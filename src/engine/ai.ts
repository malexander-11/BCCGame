import { RULES } from '../data/types'
import type { Player } from '../data/types'
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
