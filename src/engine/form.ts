import { RULES } from '../data/types'
import type { BatterCard, BowlerCard, Player } from '../data/types'
import { clamp } from './ratings'

/**
 * Form.
 *
 * A 0-100 read on how a player is going *right now*, moved by what he's
 * actually done rather than by what his ratings say he should do. Fifty is
 * neutral, and everyone starts there.
 *
 * The point is to give selection a second axis. Your best batter on paper
 * having a shocking month is a genuine question — do you keep faith, or bring
 * in the man who got 70 last week?
 */

export const NEUTRAL_FORM = 50

/** How much one game moves a player. Low enough that a single innings nudges. */
const WEIGHT = 0.35
/**
 * What a week off costs you.
 *
 * Form used to drift back toward neutral when you didn't play, which meant
 * dropping your out-of-nick batter was the cheapest way to fix him — the exact
 * opposite of how it works. Missing cricket makes you rusty, so idle players
 * lose ground instead, down to a floor they can't fall past.
 *
 * The consequence is the interesting bit: **the only way back into form is to
 * play**. Carrying a struggling batter until he comes good is now a real
 * decision with a real cost, rather than something the bench does for free.
 */
const RUST = 3.5
/** Long-term absentees settle here — "out of nick", not unplayable. */
const RUST_FLOOR = 30

export interface FormBand {
  label: string
  colour: string
  /** Lower bound, inclusive. */
  from: number
}

/** Bands are wide enough that the label only changes when something changed. */
export const FORM_BANDS: FormBand[] = [
  { from: 80, label: 'ON FIRE', colour: '#F4C430' },
  { from: 65, label: 'IN FORM', colour: '#3FAE6A' },
  { from: 40, label: 'STEADY', colour: '#86A18E' },
  { from: 25, label: 'OUT OF NICK', colour: '#C9A86B' },
  { from: 0, label: 'STRUGGLING', colour: '#E04A40' },
]

export function formBand(form: number): FormBand {
  return FORM_BANDS.find((b) => form >= b.from) ?? FORM_BANDS[FORM_BANDS.length - 1]
}

const batIndex = (p: Player) => 0.62 * p.bat.skill + 0.38 * p.bat.pwr

/**
 * How a batting performance rates, 0-100.
 *
 * Par scales with ability, so a 30 from the number nine is a good day and a
 * failure from your best batter. Fewer than six balls faced isn't evidence
 * either way — he never got in.
 */
export function batScore(p: Player, card: BatterCard): number | null {
  if (card.balls < 6) return null
  const par = 4 + 0.32 * batIndex(p)
  const notOutBonus = card.out === null && card.runs >= par * 0.6 ? 6 : 0
  return clamp(50 + (card.runs - par) * 1.6 + notOutBonus, 0, 100)
}

/** How a bowling spell rates, 0-100. Three overs is the minimum evidence. */
export function bowlScore(card: BowlerCard): number | null {
  const overs = card.balls / RULES.ballsPerOver
  if (overs < 3) return null
  const economy = card.runs / overs
  return clamp(50 + card.wickets * 11 - (economy - 5) * 7, 0, 100)
}

/**
 * Move a player's form on the back of one match.
 *
 * Returns the new value. A player who did both is judged on both, weighted by
 * how much of each he did; a player who did neither drifts toward neutral.
 */
export function updateForm(
  current: number, player: Player,
  batting: BatterCard | undefined, bowling: BowlerCard | undefined,
): number {
  const bat = batting ? batScore(player, batting) : null
  const bowl = bowling ? bowlScore(bowling) : null

  let score: number
  if (bat !== null && bowl !== null) {
    // Weight by involvement so a bits-and-pieces contribution doesn't swing it.
    const batWeight = batting!.balls
    const bowlWeight = bowling!.balls
    score = (bat * batWeight + bowl * bowlWeight) / (batWeight + bowlWeight)
  } else if (bat !== null) {
    score = bat
  } else if (bowl !== null) {
    score = bowl
  } else {
    // Picked, but never got a bat or a meaningful bowl. No evidence either
    // way, so he goes stale like anyone else who didn't play.
    return driftForm(current)
  }

  return clamp(current * (1 - WEIGHT) + score * WEIGHT, 0, 100)
}

/**
 * A week without cricket. Everyone who didn't play goes a little stale.
 *
 * Nobody falls past RUST_FLOOR, and anyone already there stays put — you can't
 * get rustier than rusty, and a five-week injury shouldn't end a career. But
 * nor does sitting out ever *improve* anybody.
 */
export function driftForm(current: number): number {
  if (current <= RUST_FLOOR) return current
  return clamp(Math.max(RUST_FLOOR, current - RUST), 0, 100)
}

/**
 * Form as a simulation multiplier. Neutral is exactly 1.0, so a squad with no
 * form history plays precisely as it did before form existed.
 */
export function formMultiplier(form: number): number {
  return 0.72 + (clamp(form, 0, 100) / 100) * 0.56
}
