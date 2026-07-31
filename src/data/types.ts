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
  /**
   * 0-10. How often he actually turns up. Ten is every week without fail; one
   * is the lad who plays twice a season. It drives the weekly "other plans"
   * roll, not injuries — a bad back doesn't care how keen you are.
   *
   * Defaults to DEFAULT_AVAILABILITY when absent.
   */
  availability?: number
}

/** Assumed availability for a player with no score set. */
export const DEFAULT_AVAILABILITY = 8

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

// ------------------------------------------------------------- chase orders

/**
 * How hard the batters are trying, set for one nine-over block at a time.
 *
 * The number is *intent* — how many shots they play — not an outcome. What that
 * intent is worth depends entirely on who is at the crease: power turns shots
 * into boundaries, technique keeps you in while you play them. Telling your
 * best striker to attack is a good trade; telling your number eleven to attack
 * is close to suicide. `intentEffect` in the engine is where that happens.
 */
export type Intent = 'defend' | 'build' | 'push' | 'attack'

export const INTENTS: { id: Intent; label: string; blurb: string; push: number }[] = [
  {
    id: 'defend', label: 'DEFEND', push: 0.65,
    blurb: 'Bat time. Get behind it, see off the good ones, take no risks.',
  },
  {
    id: 'build', label: 'BUILD', push: 0.90,
    blurb: 'Knock it around. Ones and twos, boundaries only when they come.',
  },
  {
    id: 'push', label: 'PUSH', push: 1.25,
    blurb: 'Up the tempo. Look for the gaps and take on the loose ball.',
  },
  {
    id: 'attack', label: 'ATTACK', push: 1.70,
    blurb: 'Get after them. Every ball is there to be hit.',
  },
]

export const intentPush = (i: Intent) => INTENTS.find((x) => x.id === i)!.push

/** Overs per block of the innings — 45 overs is exactly five nine-over blocks. */
export const BLOCK_OVERS = 9
export const BLOCK_COUNT = 5

/** Which block an over belongs to, 0-4. */
export const blockOf = (over: number) =>
  Math.min(BLOCK_COUNT - 1, Math.floor((over - 1) / BLOCK_OVERS))

/** The over you'd break after, for each block but the last: 9, 18, 27, 36. */
export const BREAK_OVERS = Array.from({ length: BLOCK_COUNT - 1 }, (_, i) => (i + 1) * BLOCK_OVERS)

export type Window = 'newBall' | 'middle' | 'death'

/**
 * How many overs a bowler bowls in each third of the innings.
 *
 * This has been through two wrong answers. First it was a *preference* — hold
 * him for the new ball — which the rota could only treat as a suggestion, so a
 * bowler with nine overs marked "new ball" had to bowl most of them elsewhere
 * and nothing said so. Then it was explicit spells ("six from over one"), which
 * was honest but made the screen twelve phone-screens long and demanded mental
 * arithmetic to read.
 *
 * A count per window is both. It's a quantity, not a wish, so the rota can
 * satisfy it exactly and the old silent leak cannot come back. And it's three
 * numbers you can read at a glance.
 */
export interface BowlerAllocation {
  playerId: string
  overs: Record<Window, number>
}

export const NO_OVERS: Record<Window, number> = { newBall: 0, middle: 0, death: 0 }

/** Total overs across all three windows. */
export const allocatedOvers = (a: BowlerAllocation) =>
  a.overs.newBall + a.overs.middle + a.overs.death

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
  /** Same fielder by id, so season stats don't have to match on names. */
  fielderId?: string
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

/** One batter as he stood at the end of an over. */
export interface CreaseBatter {
  name: string
  runs: number
  balls: number
  /** He faced the last ball of the over — so he'll be off strike for the next. */
  onStrike: boolean
}

export interface OverSummary {
  over: number
  bowlerName: string
  runs: number
  wkts: number
  /** Running team total at the end of this over. */
  total: number
  totalWkts: number
  /**
   * Every delivery in the over, scorebook-style: `.` `1` `4` `W` `wd` `nb`
   * `1b` `2lb`. Extras mean an over can run to more than six.
   */
  balls: string[]
  /**
   * Who was in at the end of the over, striker first. One entry when the last
   * man is stranded, none when the innings ended on the last ball.
   */
  atCrease: CreaseBatter[]
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

// ------------------------------------------------------- the bowling windows
//
// Declared after RULES because they're derived from it.

/** First and last over of each third of the innings. */
export const WINDOWS: { key: Window; label: string; from: number; to: number }[] = [
  { key: 'newBall', label: 'NEW BALL', from: 1, to: RULES.powerplayUntil },
  { key: 'middle', label: 'MIDDLE', from: RULES.powerplayUntil + 1, to: RULES.deathFrom - 1 },
  { key: 'death', label: 'DEATH', from: RULES.deathFrom, to: RULES.overs },
]

/** How many overs a window holds — 9, 26 and 10. */
export const windowSize = (w: Window) => {
  const win = WINDOWS.find((x) => x.key === w)!
  return win.to - win.from + 1
}

/**
 * Most overs one bowler can take out of a window.
 *
 * He can't bowl two in a row, so at best he has every other one — five of the
 * nine powerplay overs, not nine. Still capped by his overall allowance.
 */
export const windowCap = (w: Window) =>
  Math.min(Math.ceil(windowSize(w) / 2), RULES.maxOversPerBowler)

/** Which window an over falls in. */
export function windowOf(over: number): Window {
  if (over <= RULES.powerplayUntil) return 'newBall'
  if (over >= RULES.deathFrom) return 'death'
  return 'middle'
}
