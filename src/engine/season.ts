import { RULES } from '../data/types'
import type { InningsResult, MatchOutcome, MatchResult, Player } from '../data/types'
import { DIV6_WEST } from '../data/league'
import { simulateMatch, TEAM_NAME } from './match'
import { initialAvailability, rollRound } from './availability'
import type { AvailabilityState } from './availability'
import { applyFreshAir } from './freshair'
import { driftForm, NEUTRAL_FORM, updateForm } from './form'
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

/** Everything one Bagshot player has done this season. */
export interface PlayerSeasonStats {
  playerId: string
  name: string
  matches: number
  // batting
  innings: number
  runs: number
  ballsFaced: number
  notOuts: number
  fours: number
  sixes: number
  best: number
  fifties: number
  hundreds: number
  ducks: number
  // bowling
  ballsBowled: number
  maidens: number
  runsConceded: number
  wickets: number
  bestWickets: number
  bestRuns: number
  // fielding
  catches: number
  stumpings: number
  runOuts: number
  // standing
  form: number
  freshAirGames: number
}

export interface Season {
  seed: number
  /** Nine rounds, each five fixtures of [homeId, awayId]. */
  schedule: [string, string][][]
  results: SeasonResult[]
  stats: Record<string, TeamStats>
  /** Who is injured, away or sulking, and the running team-news log. */
  availability: AvailabilityState
  /** Per-player season figures, Bagshot only. */
  players: Record<string, PlayerSeasonStats>
}

export const emptyPlayerStats = (playerId: string, name: string): PlayerSeasonStats => ({
  playerId, name, matches: 0,
  innings: 0, runs: 0, ballsFaced: 0, notOuts: 0, fours: 0, sixes: 0,
  best: 0, fifties: 0, hundreds: 0, ducks: 0,
  ballsBowled: 0, maidens: 0, runsConceded: 0, wickets: 0, bestWickets: -1, bestRuns: 0,
  catches: 0, stumpings: 0, runOuts: 0,
  form: NEUTRAL_FORM, freshAirGames: 0,
})

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
  const players: Record<string, PlayerSeasonStats> = {}
  for (const p of squad) players[p.id] = emptyPlayerStats(p.id, p.name)
  return {
    seed,
    schedule: roundRobin(ids),
    results: [],
    stats,
    availability: initialAvailability(squad, seed),
    players,
  }
}

/** Current form for everyone, in the shape the ball engine wants. */
export function seasonForms(season: Season): Record<string, number> {
  const forms: Record<string, number> = {}
  for (const [id, p] of Object.entries(season.players)) forms[id] = p.form
  return forms
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
/**
 * Fold one Bagshot match into the per-player season figures, move everyone's
 * form, and work out who had a fresh air game.
 */
function applyPlayerStats(
  players: Record<string, PlayerSeasonStats>,
  squad: Player[], xi: Player[],
  bowlingInnings: InningsResult, battingInnings: InningsResult,
): { players: Record<string, PlayerSeasonStats>; freshAir: string[] } {
  const next: Record<string, PlayerSeasonStats> = {}
  for (const [id, v] of Object.entries(players)) next[id] = { ...v }
  for (const p of squad) next[p.id] ??= emptyPlayerStats(p.id, p.name)

  const inXI = new Set(xi.map((p) => p.id))
  const batting = new Map(battingInnings.batting.map((b) => [b.playerId, b]))
  const bowling = new Map(bowlingInnings.bowling.map((b) => [b.playerId, b]))

  // Catches, stumpings and run outs, from the innings Bagshot fielded in.
  for (const b of bowlingInnings.batting) {
    const id = b.out?.fielderId
    if (!id || !next[id]) continue
    if (b.out!.kind === 'st') next[id].stumpings++
    else if (b.out!.kind === 'run out') next[id].runOuts++
    else next[id].catches++
  }

  const freshAir: string[] = []

  for (const p of squad) {
    const st = next[p.id]
    if (!inXI.has(p.id)) {
      st.form = driftForm(st.form)
      continue
    }
    st.matches++

    const bat = batting.get(p.id)
    const bowl = bowling.get(p.id)

    if (bat && bat.balls > 0) {
      st.innings++
      st.runs += bat.runs
      st.ballsFaced += bat.balls
      st.fours += bat.fours
      st.sixes += bat.sixes
      if (!bat.out) st.notOuts++
      if (bat.runs > st.best) st.best = bat.runs
      if (bat.runs >= 100) st.hundreds++
      else if (bat.runs >= 50) st.fifties++
      if (bat.runs === 0 && bat.out) st.ducks++
    }

    if (bowl && bowl.balls > 0) {
      st.ballsBowled += bowl.balls
      st.maidens += bowl.maidens
      st.runsConceded += bowl.runs
      st.wickets += bowl.wickets
      // Best figures: most wickets, then fewest runs.
      if (bowl.wickets > st.bestWickets ||
          (bowl.wickets === st.bestWickets && bowl.runs < st.bestRuns)) {
        st.bestWickets = bowl.wickets
        st.bestRuns = bowl.runs
      }
    }

    const facedNothing = !bat || bat.balls === 0
    const bowledNothing = !bowl || bowl.balls === 0
    if (facedNothing && bowledNothing) {
      st.freshAirGames++
      freshAir.push(p.id)
      // Doing nothing tells you nothing about how he's playing, so form only
      // drifts — the punishment is the fallout, not a form hit as well.
      st.form = driftForm(st.form)
    } else {
      st.form = updateForm(st.form, p, bat, bowl)
    }
  }

  return { players: next, freshAir }
}

export function recordRound(
  season: Season, match: MatchResult, squad: Player[], xi?: Player[],
): Season {
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

  // Per-player figures, form, and who did nothing at all.
  const playedXI = xi ?? []
  const { players, freshAir } = playedXI.length
    ? applyPlayerStats(season.players, squad, playedXI, match.first, match.second)
    : { players: season.players, freshAir: [] as string[] }

  // Roll next week's team news now, so the season screen can show it before you
  // commit to playing. Nothing to roll once the season is over.
  const nextRound = results.length + 1
  let availability = nextRound <= season.schedule.length
    ? rollRound(season.availability, squad, nextRound, season.seed)
    : season.availability

  // Anyone who had a fresh air game may walk out — applied after the roll so
  // his absence lands in next week's team news alongside everything else.
  if (freshAir.length > 0 && nextRound <= season.schedule.length) {
    const priors: Record<string, number> = {}
    for (const id of freshAir) {
      // The count already includes today's, so look at what came before it.
      priors[id] = Math.max(0, (players[id]?.freshAirGames ?? 1) - 1)
    }
    availability = applyFreshAir(
      availability, squad, playedXI, match.first, match.second, priors, nextRound, season.seed,
    ).availability
  }

  return { ...season, stats, results, availability, players }
}

export const seasonComplete = (season: Season) =>
  season.results.length >= season.schedule.length
