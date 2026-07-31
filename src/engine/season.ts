import { RULES } from '../data/types'
import type { InningsResult, MatchOutcome, MatchResult, Player } from '../data/types'
import { DIV6_WEST } from '../data/league'
import { simulateMatch, TEAM_NAME } from './match'
import { initialAvailability, rollRound } from './availability'
import type { AvailabilityState } from './availability'
import { hashString } from './rng'

/**
 * A season in Surrey Cricket Championship Division 6 West.
 *
 * Ten clubs, single round-robin, nine fixtures. You play Bagshot's match; the
 * other four each round are simulated headlessly so the table moves around you
 * and there is a real title race rather than a Bagshot-only ladder.
 */

export const BAGSHOT_ID = 'bagshot'

/** Win 20, tie 10, loss 0, plus bonus points as club leagues actually score it. */
export const POINTS = { win: 20, tie: 10, loss: 0 } as const

/** One point per fifty runs, capped at four. */
export const battingBonus = (runs: number) => Math.min(4, Math.floor(runs / 50))
/** One point per two wickets, capped at five. */
export const bowlingBonus = (wickets: number) => Math.min(5, Math.floor(wickets / 2))

export interface SeasonFixture {
  round: number
  opponentId: string
  home: boolean
}

export interface SeasonResult extends SeasonFixture {
  bagshot: { runs: number; wickets: number; balls: number; allOut: boolean }
  opponent: { runs: number; wickets: number; balls: number; allOut: boolean }
  outcome: MatchOutcome
  margin: string
  points: number
  motm: string
}

export interface TeamStats {
  played: number
  won: number
  lost: number
  tied: number
  points: number
  runsFor: number
  oversFor: number
  runsAgainst: number
  oversAgainst: number
}

export interface Season {
  seed: number
  /** Nine rounds, each five fixtures of [homeId, awayId]. */
  schedule: [string, string][][]
  results: SeasonResult[]
  stats: Record<string, TeamStats>
  /** Who is injured, away or sulking, and the running team-news log. */
  availability: AvailabilityState
}

export interface TableRow extends TeamStats {
  clubId: string
  name: string
  position: number
  nrr: number
  isBagshot: boolean
}

const emptyStats = (): TeamStats => ({
  played: 0, won: 0, lost: 0, tied: 0, points: 0,
  runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0,
})

/**
 * A side bowled out is charged the full quota of overs for net run rate — the
 * standard rule, and the reason collapsing cheaply hurts twice.
 */
const oversUsed = (innings: InningsResult) =>
  innings.allOut ? RULES.overs : innings.balls / RULES.ballsPerOver

// ------------------------------------------------------------------ schedule

/**
 * Circle-method round robin: fix the first team and rotate the rest. Ten clubs
 * gives nine rounds of five fixtures, everyone playing everyone once.
 */
function roundRobin(ids: string[]): [string, string][][] {
  const arr = [...ids]
  const n = arr.length
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      // Alternate which side is at home so nobody plays every game away.
      const [a, b] = r % 2 === 0 ? [arr[i], arr[n - 1 - i]] : [arr[n - 1 - i], arr[i]]
      pairs.push([a, b])
    }
    rounds.push(pairs)
    arr.splice(1, 0, arr.pop()!)
  }
  return rounds
}

export function createSeason(seed: number, squad: Player[]): Season {
  const ids = [BAGSHOT_ID, ...DIV6_WEST.map((c) => c.id)]
  const stats: Record<string, TeamStats> = {}
  for (const id of ids) stats[id] = emptyStats()
  return {
    seed,
    schedule: roundRobin(ids),
    results: [],
    stats,
    availability: initialAvailability(squad, seed),
  }
}

export const totalRounds = (season: Season) => season.schedule.length

/** The fixture Bagshot play next, or null once the season is done. */
export function nextFixture(season: Season): SeasonFixture | null {
  const round = season.results.length + 1
  if (round > season.schedule.length) return null
  const pair = season.schedule[round - 1].find(([h, a]) => h === BAGSHOT_ID || a === BAGSHOT_ID)
  if (!pair) return null
  const home = pair[0] === BAGSHOT_ID
  return { round, opponentId: home ? pair[1] : pair[0], home }
}

// -------------------------------------------------------------------- table

interface Side {
  id: string
  /** Their own innings. */
  batted: InningsResult
  /** The innings they bowled at. */
  bowled: InningsResult
  outcome: MatchOutcome
}

function credit(stats: Record<string, TeamStats>, side: Side) {
  const s = stats[side.id]
  if (!s) return
  s.played++
  s.runsFor += side.batted.runs
  s.oversFor += oversUsed(side.batted)
  s.runsAgainst += side.bowled.runs
  s.oversAgainst += oversUsed(side.bowled)

  if (side.outcome === 'win') { s.won++; s.points += POINTS.win }
  else if (side.outcome === 'tie') { s.tied++; s.points += POINTS.tie }
  else { s.lost++; s.points += POINTS.loss }

  s.points += battingBonus(side.batted.runs) + bowlingBonus(side.bowled.wickets)
}

/** Apply one completed match to the table, crediting both sides. */
function applyMatch(
  stats: Record<string, TeamStats>,
  battingFirstId: string, chasingId: string,
  first: InningsResult, second: InningsResult,
) {
  const tied = second.runs === first.runs
  const chaseWon = second.runs > first.runs

  credit(stats, {
    id: battingFirstId, batted: first, bowled: second,
    outcome: tied ? 'tie' : chaseWon ? 'loss' : 'win',
  })
  credit(stats, {
    id: chasingId, batted: second, bowled: first,
    outcome: tied ? 'tie' : chaseWon ? 'win' : 'loss',
  })
}

export function standings(season: Season): TableRow[] {
  const rows: TableRow[] = Object.entries(season.stats).map(([clubId, s]) => {
    const club = DIV6_WEST.find((c) => c.id === clubId)
    const nrr = (s.oversFor > 0 ? s.runsFor / s.oversFor : 0) -
                (s.oversAgainst > 0 ? s.runsAgainst / s.oversAgainst : 0)
    return {
      ...s,
      clubId,
      name: club?.name ?? TEAM_NAME,
      isBagshot: clubId === BAGSHOT_ID,
      nrr,
      position: 0,
    }
  })
  rows.sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.won - a.won)
  rows.forEach((r, i) => { r.position = i + 1 })
  return rows
}

export const bagshotRow = (season: Season) =>
  standings(season).find((r) => r.isBagshot)!

// -------------------------------------------------------------------- rounds

/**
 * Record Bagshot's match and play out the rest of the round.
 *
 * Returns a new season — the state is treated as immutable so React re-renders
 * cleanly and a half-applied round can never be persisted.
 */
export function recordRound(season: Season, match: MatchResult, squad: Player[]): Season {
  const fixture = nextFixture(season)
  if (!fixture) return season

  const stats: Record<string, TeamStats> = {}
  for (const [id, s] of Object.entries(season.stats)) stats[id] = { ...s }

  // Bagshot always bowl first, so the opposition are the side batting first.
  applyMatch(stats, fixture.opponentId, BAGSHOT_ID, match.first, match.second)

  // The other four fixtures in this round, played out headlessly.
  for (const [homeId, awayId] of season.schedule[fixture.round - 1]) {
    if (homeId === BAGSHOT_ID || awayId === BAGSHOT_ID) continue
    const home = DIV6_WEST.find((c) => c.id === homeId)
    const away = DIV6_WEST.find((c) => c.id === awayId)
    if (!home || !away) continue
    // The home side bowls first, mirroring Bagshot's own rule.
    const seed = hashString(`${season.seed}-${fixture.round}-${homeId}-${awayId}`)
    const sim = simulateMatch(away, home.xi, seed)
    applyMatch(stats, awayId, homeId, sim.first, sim.second)
  }

  const bonus = battingBonus(match.second.runs) + bowlingBonus(match.first.wickets)
  const result: SeasonResult = {
    ...fixture,
    bagshot: {
      runs: match.second.runs, wickets: match.second.wickets,
      balls: match.second.balls, allOut: match.second.allOut,
    },
    opponent: {
      runs: match.first.runs, wickets: match.first.wickets,
      balls: match.first.balls, allOut: match.first.allOut,
    },
    outcome: match.outcome,
    margin: match.margin,
    points: (match.outcome === 'win' ? POINTS.win : match.outcome === 'tie' ? POINTS.tie : POINTS.loss) + bonus,
    motm: `${match.motm.name} ${match.motm.line}`,
  }

  const results = [...season.results, result]
  // Roll next week's team news now, so the season screen can show it before you
  // commit to playing. Nothing to roll once the season is over.
  const nextRound = results.length + 1
  const availability = nextRound <= season.schedule.length
    ? rollRound(season.availability, squad, nextRound, season.seed)
    : season.availability

  return { ...season, stats, results, availability }
}

export const seasonComplete = (season: Season) =>
  season.results.length >= season.schedule.length
