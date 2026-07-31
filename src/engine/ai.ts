import type { Player } from '../data/types'
import { playerQuality } from './ratings'

/**
 * Picks a batting order the way a captain would: fill each slot with the best
 * available player who actually bats there, and only reach outside a player's
 * range when nothing else is left.
 *
 * Used for the opposition, and offered as the "auto" button on Bagshot's own
 * batting-order screen.
 */
export function autoBattingOrder(xi: Player[]): Player[] {
  const pool = [...xi]
  const order: Player[] = []

  for (let slot = 1; slot <= xi.length; slot++) {
    const eligible = pool.filter((p) => slot >= p.positions[0] && slot <= p.positions[1])
    const candidates = eligible.length > 0 ? eligible : pool

    let best = candidates[0]
    let bestScore = -Infinity
    for (const p of candidates) {
      // Prefer good players early, but respect how specialised the slot is —
      // a [1,2] opener left unplaced at slot 3 is a wasted opener.
      const urgency = eligible.length > 0 ? (11 - p.positions[1]) * 0.6 : 0
      const score = playerQuality(p) + urgency
      if (score > bestScore) { bestScore = score; best = p }
    }

    order.push(best)
    pool.splice(pool.indexOf(best), 1)
  }

  return order
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
