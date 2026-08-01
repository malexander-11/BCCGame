import { BLOCK_COUNT, BLOCK_OVERS, RULES } from '../data/types'
import type { Intent, Player } from '../data/types'
import { isBowler, playerQuality } from './ratings'

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
