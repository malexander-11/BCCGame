/**
 * Core data model.
 *
 * Every player carries exactly four ratings, all on a 0-100 scale where
 * **60 is league average**:
 *
 *   batting  SKILL — survival. How hard they are to dismiss.
 *   batting  PWR   — scoring. Boundaries and strike rate.
 *   bowling  DEF   — containment. Economy, dot balls, fewer extras.
 *   bowling  ATT   — penetration. Wicket-taking.
 *
 * They resolve as two duels on every ball: SKILL vs ATT decides whether the
 * batter survives, PWR vs DEF decides how many runs come.
 */

export type BowlType = 'pace' | 'spin'

export interface Player {
  id: string
  name: string
  bat: { skill: number; pwr: number }
  /** Below BOWLER_FLOOR in either rating means the player doesn't bowl. */
  bowl: { def: number; att: number }
  /** Legal batting slots, inclusive, e.g. [1, 3] for an opener. */
  positions: [number, number]
  /** Price in £m, spent against the selection budget. */
  value: number
  /** The club's own role label, e.g. 'Spin all-rounder'. Display only. */
  role?: string
  wk?: boolean
  bowlType?: BowlType
  /**
   * 0-100. How much the player does with a new ball. Boosts ATT (and, less so,
   * DEF) for the first dozen overs and then fades to nothing — so a swing
   * bowler is worth far more opening than first change.
   */
  swing?: number
}

export type Tier = 'derby' | 'midtable' | 'promotion' | 'premier'

export interface Club {
  id: string
  name: string
  tier: Tier
  /** Ratings scalar applied to the generated XI. Roughly 0.82 - 1.16. */
  strength: number
  xi: Player[]
}

// ---------------------------------------------------------------- bowling plan

export type SpellPref = 'new-ball' | 'middle' | 'death'

export interface BowlerAllocation {
  playerId: string
  overs: number
  /**
   * Which phases this bowler is held for. More than one is allowed — a bowler
   * set to middle *and* death is available across both windows.
   */
  prefs: SpellPref[]
}

export type BowlingPlan = BowlerAllocation[]

/** One entry per over: which bowler bowls it. Index 0 == over 1. */
export type Rota = string[]

// ------------------------------------------------------------------ scorecards

export type DismissalKind = 'c' | 'b' | 'lbw' | 'run out' | 'c & b' | 'st'

export interface Dismissal {
  kind: DismissalKind
  /** Absent on a run out — nobody gets the wicket. */
  bowlerName?: string
  /** Catcher, keeper, or the fielder who threw. */
  fielderName?: string
  /** Rendered scorecard line, e.g. "c Harris b Nolan". */
  text: string
}

export interface BatterCard {
  playerId: string
  name: string
  runs: number
  balls: number
  fours: number
  sixes: number
  out: Dismissal | null
  /** False for players who never got in. */
  batted: boolean
  /** True when picked outside their natural position range. */
  outOfPosition: boolean
}

export interface BowlerCard {
  playerId: string
  name: string
  /** Legal deliveries only. */
  balls: number
  maidens: number
  runs: number
  wickets: number
  wides: number
  noBalls: number
  dots: number
}

export interface Extras {
  wides: number
  noBalls: number
  byes: number
  legByes: number
  total: number
}

export type EventType =
  | 'wicket' | 'four' | 'six' | 'fifty' | 'ton'
  | 'team' | 'drop' | 'maiden' | 'win' | 'end'

export interface BallEvent {
  /** Legal balls bowled at the time of the event. */
  ball: number
  over: number
  type: EventType
  text: string
  score: number
  wkts: number
}

export interface OverSummary {
  over: number
  bowlerName: string
  runs: number
  wkts: number
  /** Running team total at the end of this over. */
  total: number
  totalWkts: number
}

export interface FowEntry {
  score: number
  wkt: number
  batter: string
  /** Formatted overs, e.g. "12.3". */
  at: string
}

export interface InningsResult {
  teamName: string
  runs: number
  wickets: number
  /** Legal balls bowled. */
  balls: number
  batting: BatterCard[]
  bowling: BowlerCard[]
  extras: Extras
  fow: FowEntry[]
  overSummaries: OverSummary[]
  events: BallEvent[]
  allOut: boolean
  /** Only meaningful in the second innings. */
  chased: boolean
  target: number | null
  runRate: number
}

export type MatchOutcome = 'win' | 'loss' | 'tie'

export interface MatchResult {
  seed: number
  opponentName: string
  tier: Tier
  /** Opposition batting — Bagshot always bowls first. */
  first: InningsResult
  /** Bagshot batting. */
  second: InningsResult
  outcome: MatchOutcome
  /** e.g. "won by 4 wickets", "lost by 27 runs". */
  margin: string
  motm: { name: string; line: string; team: string }
  /** One-line post-match read on how it went. */
  analysis: string
}

// ------------------------------------------------------------------ match rules

export const RULES = {
  overs: 45,
  ballsPerOver: 6,
  get balls() { return this.overs * this.ballsPerOver },
  /** A fifth of the innings, rounded down — standard limited-overs cap. */
  get maxOversPerBowler() { return Math.ceil(this.overs / 5) },
  minBowlers: 5,
  maxBowlers: 7,
  wickets: 10,
  /** Overs 1-9 are the powerplay, 36-45 the death. */
  powerplayUntil: 9,
  deathFrom: 36,
} as const
