import { BLOCK_CAP, BLOCK_COUNT, BLOCK_OVERS, blockRange, phaseOf, RULES } from '../data/types'
import type { BlockPlan, BowlingPlan, Field, Intent, Player } from '../data/types'
import { availableBowlers, isBowler, playerQuality, SWING_WINDOW } from './ratings'
import { blockSize, oversLeft } from './rota'

const bowlingRank = (p: Player) => p.bowl.def + p.bowl.att

/**
 * Picks a legal, sensible XI from a bigger squad.
 *
 * A selection committee doesn't rank the squad and draw a line — it picks a
 * **shape**: someone to keep, someone to take the new ball, someone to bowl the
 * middle overs, a top order who can face the new ball, and then whoever scores
 * the most runs. Ranking on raw bowling index instead gives you five seamers, no
 * spinner and nobody to open, which looks fine on paper and loses on grass.
 *
 * Every step falls back to "best available" when the squad can't oblige, so a
 * side with no spinner or no keeper still gets eleven names.
 */
export function autoSelectXI(squad: Player[]): Player[] {
  const chosen: Player[] = []
  const take = (p: Player | undefined) => {
    if (p && !chosen.includes(p)) chosen.push(p)
  }
  const rest = () => squad.filter((p) => !chosen.includes(p))
  const best = (pool: Player[], rank: (p: Player) => number) =>
    [...pool].sort((a, b) => rank(b) - rank(a))

  // The keeper is non-negotiable — pick the one who bats best.
  take(best(squad.filter((p) => p.wk), playerQuality)[0])

  // The attack is counted separately from the XI because the keeper doesn't
  // bowl however good his figures look.
  const attack: Player[] = []
  const enlist = (p: Player | undefined) => {
    if (!p || chosen.includes(p) || attack.length >= RULES.minBowlers) return
    attack.push(p)
    take(p)
  }
  const bowlers = () => best(rest().filter(isBowler), bowlingRank)

  // Two to take the new ball. Swing first — it's worth more than raw ratings
  // for the twelve overs it lasts — then the best seamers behind them.
  const openWith = () => [
    ...best(bowlers().filter((p) => (p.swing ?? 0) > 0), (p) => p.swing ?? 0),
    ...bowlers().filter((p) => p.bowlType !== 'spin'),
    ...bowlers(),
  ]
  while (attack.length < 2) {
    const next = openWith()[0]
    if (!next) break
    enlist(next)
  }

  // At least one frontline spinner — someone has to bowl the middle overs.
  enlist(bowlers().find((p) => p.bowlType === 'spin'))

  // Then the best of the rest, up to a full attack.
  for (const p of bowlers()) enlist(p)

  // Two who can see off the new ball, best batter first.
  for (const p of best(rest().filter((p) => p.opener), playerQuality)) {
    if (chosen.filter((c) => c.opener).length >= 2 || chosen.length >= 11) break
    take(p)
  }

  // Fill up with runs.
  for (const p of best(rest(), playerQuality)) {
    if (chosen.length >= 11) break
    take(p)
  }

  return autoBattingOrder(chosen.slice(0, 11))
}

const battingRank = (p: Player) => 0.62 * p.bat.skill + 0.38 * p.bat.pwr

/**
 * A sensible batting order: the two best openers up top, then best batter
 * first and the tail last.
 *
 * The top two are a separate decision from the rest of the order because the
 * new ball is a separate job. Beyond slot two it's simply batting quality, and
 * bowlers sink to the tail on their own.
 *
 * Used for the opposition, and offered as the AUTO button on Bagshot's own
 * batting-order screen.
 */
export function autoBattingOrder(xi: Player[]): Player[] {
  const byBatting = [...xi].sort((a, b) => battingRank(b) - battingRank(a))
  // The best two who can actually do the job. If the side is short of openers
  // this quietly falls back to the best batters, which is what a captain does.
  const top = byBatting.filter((p) => p.opener).slice(0, 2)
  return [...top, ...byBatting.filter((p) => !top.includes(p))]
}

/**
 * What a sensible captain would call for, given the state of the chase.
 *
 * Used three ways: the auto manager's chases, headless simulation, and — the
 * one that matters day to day — the option already selected when a drinks
 * break comes up. Most breaks are obvious, so the default should be right often
 * enough that you only spend attention on the ones where you disagree.
 */
export function autoIntent(need: number, ballsLeft: number, wickets: number): Intent {
  if (ballsLeft <= 0 || need <= 0) return 'build'
  const rrr = (need / ballsLeft) * 6
  const inHand = RULES.wickets - wickets

  // Nine down and still needing runs is not the time to swing.
  if (inHand <= 1) return rrr > 9 ? 'push' : 'defend'

  // Thresholds are set against what each intent actually scores — roughly 3.2,
  // 3.8, 4.6 and 5.5 an over. Picking `build` for a 4.5 asking rate would mean
  // falling steadily behind while looking sensible.
  const level = rrr < 3.2 ? 0 : rrr < 4.2 ? 1 : rrr < 5.6 ? 2 : 3
  // A collapse pulls it back a notch whatever the rate says.
  const tight = inHand <= 3 ? 1 : 0
  const ladder: Intent[] = ['defend', 'build', 'push', 'attack']
  return ladder[Math.max(0, level - tight)]
}

/** A full set of block intents for a side with nobody making the calls. */
export function autoIntents(target: number): Intent[] {
  return Array.from({ length: BLOCK_COUNT }, (_, i) => {
    const ballsGone = i * BLOCK_OVERS * RULES.ballsPerOver
    // Assume par progress to this point, then read the rate from there.
    const par = Math.round(target * (ballsGone / RULES.balls))
    return autoIntent(target - par, RULES.balls - ballsGone, Math.floor(i * 1.4))
  })
}

// ------------------------------------------------------------- the auto captain

/**
 * How much this bowler wants the next nine overs.
 *
 * The same shape a captain works to: the new ball to whoever swings it, the
 * middle to the spinners, and your best strike bowler saved for the end. `left`
 * breaks ties toward whoever still has overs to burn, which is what stops the
 * last block being handed to three men who have already bowled their nine.
 */
function appetite(p: Player, block: number, left: number): number {
  const { from } = blockRange(block)
  const phase = phaseOf(from)
  const swings = (p.swing ?? 0) >= 50 && from <= SWING_WINDOW
  const spin = p.bowlType === 'spin'

  let want: number
  if (phase === 'powerplay') want = swings ? 1.15 : spin ? 0.15 : 0.65
  else if (phase === 'death') want = spin ? 0.20 : 0.45 + (p.bowl.att / 100) * 0.55
  else want = spin ? 1.0 : swings ? 0.55 : 0.62

  // A man with nothing left is no use however much he suits the moment.
  if (left <= 0) return -1
  // ...and between two men who suit it equally, bowl the better one. Without
  // this the tie fell to XI order, which is batting order — so the auto captain
  // handed the middle overs to a batsman who bowls a bit while three frontline
  // seamers stood at mid-on with nine overs each still in hand.
  return want + left * 0.02 + (p.bowl.def + p.bowl.att) / 400
}

/**
 * Who bowls the next nine overs, when nobody has said.
 *
 * Covers the opposition, the auto manager, and every block ahead of wherever
 * you've got to — so an unmanaged innings is captained rather than random, and
 * a block you skip is filled by someone reading the same game you are.
 */
export function autoBlock(
  xi: Player[], block: number, used: Map<string, number>, previous: string | null,
): BlockPlan {
  const pool = availableBowlers(xi)
  if (pool.length === 0) return []

  const want = blockSize(block)
  const alloc = new Map<string, number>()
  const queue = [...pool].sort(
    (a, b) => appetite(b, block, oversLeft(used, b.id)) - appetite(a, block, oversLeft(used, a.id)),
  )

  let left = want
  for (const p of queue) {
    if (left <= 0) break
    // Whoever just bowled can only have every other over of this block.
    const ceiling = p.id === previous ? Math.floor(want / 2) : BLOCK_CAP
    const room = Math.min(ceiling, oversLeft(used, p.id), left)
    if (room <= 0) continue
    // Two men share a block; a third only comes on if they can't cover it.
    const share = alloc.size < 2 ? Math.min(room, Math.ceil(want / 2)) : room
    alloc.set(p.id, (alloc.get(p.id) ?? 0) + share)
    left -= share
  }

  // Anyone at all, rather than hand back a block that doesn't add up.
  if (left > 0) {
    for (const p of pool) {
      if (left <= 0) break
      const ceiling = p.id === previous ? Math.floor(want / 2) : BLOCK_CAP
      const room = Math.min(ceiling - (alloc.get(p.id) ?? 0), oversLeft(used, p.id), left)
      if (room <= 0) continue
      alloc.set(p.id, (alloc.get(p.id) ?? 0) + room)
      left -= room
    }
  }

  return [...alloc.entries()].map(([playerId, overs]) => ({ playerId, overs }))
}

/**
 * An innings with nothing called yet. Every block falls to `autoBlock`, so this
 * is a fully captained innings rather than an empty one — which is exactly what
 * the opposition and the auto manager want.
 */
export const emptyPlan = (): BowlingPlan => Array.from({ length: BLOCK_COUNT }, () => null)

/**
 * What field a sensible captain sets, given the state of the innings.
 *
 * Early on you attack — the ball is new, they aren't in, and a wicket now is
 * worth two later. Once they're set and going, you cut your losses and save
 * runs. At the death everyone is back whatever the score, because they're
 * swinging at everything.
 */
export function autoField(block: number, runs: number, wickets: number): Field {
  const { from } = blockRange(block)
  if (phaseOf(from) === 'death') return wickets >= 7 ? 'press' : 'spread'
  if (block === 0) return 'attack'
  // Runs per over so far tells you whether you're on top or hanging on.
  const rr = from > 1 ? runs / (from - 1) : 0
  if (wickets >= 5) return 'press'
  if (rr > 5.4) return 'spread'
  if (rr > 4.3) return 'contain'
  return 'press'
}

/** Cheap read on how strong an XI is, used for match previews. */
export function teamStrength(xi: Player[]): { bat: number; bowl: number } {
  const order = autoBattingOrder(xi)
  const top = order.slice(0, 7)
  const bat = top.reduce((s, p) => s + 0.58 * p.bat.skill + 0.42 * p.bat.pwr, 0) / (top.length || 1)

  const bowlers = xi
    .filter((p) => p.bowl.def > 0 && p.bowl.att > 0)
    .sort((a, b) => (b.bowl.def + b.bowl.att) - (a.bowl.def + a.bowl.att))
    .slice(0, 5)
  const bowl = bowlers.reduce((s, p) => s + 0.5 * p.bowl.def + 0.5 * p.bowl.att, 0) / (bowlers.length || 1)

  return { bat: Math.round(bat), bowl: Math.round(bowl) }
}
