import type { Player } from '../data/types'
import { formMultiplier } from './form'
import type { Rng } from './rng'

/**
 * Turns 0-100 ratings into simulation multipliers.
 *
 * All four scales are centred so that **60 → 1.0**. That makes the numbers the
 * user enters directly meaningful: 60 is a solid first-teamer, 80 wins games,
 * 90+ is the best in the division.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

const CENTRE = 60

/** Survival. Higher = harder to dismiss. */
export const skillMult = (v: number) => clamp(1 + (v - CENTRE) * 0.020, 0.25, 1.80)
/** Scoring. Higher = more boundaries. */
export const pwrMult = (v: number) => clamp(1 + (v - CENTRE) * 0.022, 0.25, 1.85)
/** Containment. Higher = fewer runs and fewer extras. */
export const defMult = (v: number) => clamp(1 + (v - CENTRE) * 0.018, 0.35, 1.75)
/** Penetration. Higher = more wickets. */
export const attMult = (v: number) => clamp(1 + (v - CENTRE) * 0.020, 0.30, 1.80)

/**
 * Resolve one side's attribute against the other's. Damped so that a total
 * mismatch is lopsided but not absurd — a rabbit against a gun bowler survives
 * a few balls, not zero.
 */
export function duel(attacker: number, defender: number, damping: number): number {
  return Math.pow(attacker / defender, damping)
}

export const WICKET_DAMPING = 0.75
export const RUNS_DAMPING = 0.70

/**
 * Per-innings form. Cricketers are streaky: about a third of the time someone
 * turns up with nothing, and about one in six is unplayable that day.
 */
export function rollForm(rng: Rng): number {
  const r = rng()
  if (r < 0.34) return 0.50 + rng() * 0.28   // off day
  if (r < 0.82) return 0.92 + rng() * 0.26   // par
  return 1.25 + rng() * 0.45                 // on song
}

export interface BatterState {
  player: Player
  /** Effective survival multiplier for this innings. */
  sk: number
  /** Effective scoring multiplier for this innings. */
  pw: number
  form: number
}

export interface BowlerState {
  player: Player
  def: number
  att: number
  form: number
}

/**
 * How well someone is going today.
 *
 * In a season this is his tracked form nudged by the day, so a man in nick
 * mostly plays like it. In a friendly there's no history, so it falls back to
 * the streaky roll and behaves exactly as it always did.
 */
function todaysForm(rng: Rng, tracked: number | undefined): number {
  if (tracked === undefined) return rollForm(rng)
  const day = 0.82 + rng() * 0.36     // it's still cricket
  return formMultiplier(tracked) * day
}

export function makeBatterState(player: Player, rng: Rng, tracked?: number): BatterState {
  const form = todaysForm(rng, tracked)
  // Form swings scoring more than it swings technique.
  const skForm = 1 + (form - 1) * 0.6
  return {
    player,
    form,
    sk: skillMult(player.bat.skill) * skForm,
    pw: pwrMult(player.bat.pwr) * form,
  }
}

export function makeBowlerState(player: Player, rng: Rng, tracked?: number): BowlerState {
  const form = todaysForm(rng, tracked)
  return {
    player,
    form,
    // Containment is a discipline — it wobbles less than wicket-taking does.
    def: defMult(player.bowl.def) * (1 + (form - 1) * 0.45),
    att: attMult(player.bowl.att) * form,
  }
}

/** How long the new ball is worth something, in overs. */
export const SWING_WINDOW = 12

/**
 * What a bowler does with a new ball. Swing is a sharp edge early and nothing
 * later, so a swing bowler held back to first change has wasted his best asset —
 * which is the whole point of choosing who takes the new ball.
 */
export function swingBoost(swing: number | undefined, over: number) {
  if (!swing) return { att: 1, def: 1 }
  const decay = clamp(1 - (over - 1) / SWING_WINDOW, 0, 1)
  const s = swing / 100
  return {
    att: 1 + s * 0.58 * decay,  // wickets — the big effect
    def: 1 + s * 0.22 * decay,  // harder to get away, but less so
  }
}

/** Single number for sorting a squad by overall usefulness. */
export function playerQuality(p: Player): number {
  const bat = 0.58 * p.bat.skill + 0.42 * p.bat.pwr
  const bowl = 0.5 * p.bowl.def + 0.5 * p.bowl.att
  return Math.max(bat, bowl * 0.98)
}

/**
 * Below this in either bowling rating and the player is not a bowler — he's a
 * batter with a token number against his name. Real squads mark a non-bowler
 * as 1 rather than 0, so a bare `> 0` test would put keepers and specialist
 * batters into the attack.
 */
export const BOWLER_FLOOR = 20

export function isBowler(p: Player): boolean {
  return p.bowl.def >= BOWLER_FLOOR && p.bowl.att >= BOWLER_FLOOR
}

/** Whoever has the gloves: the first designated keeper in the XI. */
export function keeperOf(xi: Player[]): Player | undefined {
  return xi.find((p) => p.wk)
}

/** The bowlers you can actually call on — the keeper is otherwise engaged. */
export function availableBowlers(xi: Player[]): Player[] {
  const keeper = keeperOf(xi)
  return xi.filter((p) => isBowler(p) && p.id !== keeper?.id)
}
