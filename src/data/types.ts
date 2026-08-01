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
  /**
   * Opens the batting. Facing the new ball is a specialist's job — anyone else
   * doing it carries extra risk until the shine has gone, whether he was picked
   * to open or arrived there because the top order fell over.
   */
  opener?: boolean
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

/**
 * Where you put the fielders, set for one nine-over block at a time — the
 * bowling side's half of the same decision.
 *
 * The ladder is how many men are up. Bring them in and you buy chances at the
 * cost of the gaps behind them; push them back and you save the boundary but
 * concede the single and never get him out. Like intent, what the setting is
 * worth depends on who's bowling: men round the bat only pay off for someone who
 * finds the edge, and a spread field only pays for someone disciplined enough to
 * bowl to it. `fieldEffect` in the engine is where that happens.
 */
export type Field = 'spread' | 'contain' | 'press' | 'attack'

export const FIELDS: { id: Field; label: string; blurb: string; push: number }[] = [
  {
    id: 'spread', label: 'SPREAD', push: 0.66,
    blurb: 'Sweepers out, everyone back. Save the four, take the single.',
  },
  {
    id: 'contain', label: 'CONTAIN', push: 0.90,
    blurb: 'Ring field. Cut off the ones and make them find a gap.',
  },
  {
    id: 'press', label: 'PRESS', push: 1.24,
    blurb: 'A catcher or two in. Build pressure and wait for the mistake.',
  },
  {
    id: 'attack', label: 'ATTACK', push: 1.66,
    blurb: 'Slips and men round the bat. Buy a wicket and hang the runs.',
  },
]

export const fieldPush = (f: Field) => FIELDS.find((x) => x.id === f)!.push

/** The tightest setting — singles are cheapest here and dearer either side. */
export const RING_PUSH = fieldPush('contain')

/** Overs per block of the innings — 45 overs is exactly five nine-over blocks. */
export const BLOCK_OVERS = 9
export const BLOCK_COUNT = 5

/** Which block an over belongs to, 0-4. */
export const blockOf = (over: number) =>
  Math.min(BLOCK_COUNT - 1, Math.floor((over - 1) / BLOCK_OVERS))

/** The over you'd break after, for each block but the last: 9, 18, 27, 36. */
export const BREAK_OVERS = Array.from({ length: BLOCK_COUNT - 1 }, (_, i) => (i + 1) * BLOCK_OVERS)

// ---------------------------------------------------------------- the attack

/**
 * How the bowling is decided: **one nine-over block at a time**, the same
 * rhythm the batting instructions run on.
 *
 * This has been through three wrong answers, all of them versions of asking for
 * the whole innings up front. First a *preference* — hold him for the new ball —
 * which the rota could only treat as a hint, so a bowler marked for nine new-ball
 * overs bowled most of them elsewhere and nothing said so. Then explicit spells
 * ("six from over one"), honest but twelve phone-screens long. Then a count per
 * third of the innings, which was readable but still asked you to plan
 * forty-five overs before a ball had been bowled.
 *
 * No captain does that. He gives the new ball to two men, watches, and decides
 * the next spell from what he's just seen. So the plan is now five decisions of
 * nine overs each, made with the score in front of you — and the first one is
 * the only thing you set before the toss.
 */
export interface BlockAllocation {
  playerId: string
  /** Overs in this block. At most `BLOCK_CAP` — he can't bowl two in a row. */
  overs: number
}

/** One block's worth of bowling: who bowls how many of the next nine. */
export type BlockPlan = BlockAllocation[]

/**
 * The whole innings, one entry per block. `null` means nobody has called it —
 * the engine reads the situation and picks for itself, which covers the
 * opposition, the auto manager, and every block ahead of wherever you've got to.
 */
export type BowlingPlan = (BlockPlan | null)[]

/** Total overs handed out in a block. */
export const blockOvers = (b: BlockPlan) => b.reduce((s, a) => s + a.overs, 0)

/**
 * Most overs one bowler can take out of a nine-over block.
 *
 * He can't bowl two in a row, so at best he has every other one — five of the
 * nine, not nine.
 */
export const BLOCK_CAP = Math.ceil(BLOCK_OVERS / 2)

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
  /**
   * How settled he is, 0 walking out to 1 fully in. The single most useful thing
   * to know before deciding a field: a new man is there to be had, a set one
   * isn't, and the same attacking field is a good idea against one and a bad
   * idea against the other.
   */
  settled: number
}

/** What to call a batter at that level of settledness. */
export function settledLabel(settled: number): string {
  if (settled < 0.22) return 'NEW IN'
  if (settled < 0.55) return 'PLAYING IN'
  if (settled < 0.85) return 'GETTING GOING'
  return 'SET'
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

// ------------------------------------------------------------- the phases
//
// Declared after RULES because they're derived from it. These describe what the
// *ball* is doing at a given point of the innings — they are not a unit of
// planning, which is the nine-over block.

export type Phase = 'powerplay' | 'middle' | 'death'

export function phaseOf(over: number): Phase {
  if (over <= RULES.powerplayUntil) return 'powerplay'
  if (over >= RULES.deathFrom) return 'death'
  return 'middle'
}

/** What each block is for, in a word. Shown as the heading on the attack screen. */
export const BLOCK_LABELS = [
  'THE NEW BALL', 'THE FIRST CHANGE', 'THE MIDDLE OVERS', 'THE SQUEEZE', 'THE DEATH',
] as const

/** First and last over of a block: block 0 is overs 1-9, block 4 is 37-45. */
export const blockRange = (block: number) => ({
  from: block * BLOCK_OVERS + 1,
  to: Math.min(RULES.overs, (block + 1) * BLOCK_OVERS),
})
