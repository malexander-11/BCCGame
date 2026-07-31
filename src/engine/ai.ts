import { BLOCK_COUNT, BLOCK_OVERS, RULES } from '../data/types'
import type { Intent, Player } from '../data/types'
import { isBowler, playerQuality } from './ratings'

/**
 * Picks a legal, sensible XI from a bigger squad: a keeper first, then enough
 * bowlers to get through 45 overs, then the best batters left. Same shape a
 * selection committee would arrive at, without the argument.
 */
export function autoSelectXI(squad: Player[]): Player[] {
  const chosen: Player[] = []
  const take = (p: Player | undefined) => {
    if (p && !chosen.includes(p)) chosen.push(p)
  }
  const rest = () => squad.filter((p) => !chosen.includes(p))

  // The keeper is non-negotiable — pick the one who bats best.
  take([...squad.filter((p) => p.wk)].sort((a, b) => playerQuality(b) - playerQuality(a))[0])

  // Then a front-line attack.
  const bowlers = rest()
    .filter(isBowler)
    .sort((a, b) => (b.bowl.def + b.bowl.att) - (a.bowl.def + a.bowl.att))
  for (const p of bowlers.slice(0, RULES.minBowlers)) take(p)

  // Fill up with runs.
  for (const p of rest().sort((a, b) => playerQuality(b) - playerQuality(a))) {
    if (chosen.length >= 11) break
    take(p)
  }

  return autoBattingOrder(chosen.slice(0, 11))
}

/**
 * A sensible batting order: best batter first, tail last.
 *
 * Used for the opposition, and offered as the AUTO button on Bagshot's own
 * batting-order screen.
 */
export function autoBattingOrder(xi: Player[]): Player[] {
  // No preferred slots any more, so this is simply best batter first. Bowlers
  // sink to the tail on their own, which is where they were going anyway.
  return [...xi].sort(
    (a, b) => (0.62 * b.bat.skill + 0.38 * b.bat.pwr) - (0.62 * a.bat.skill + 0.38 * a.bat.pwr),
  )
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
