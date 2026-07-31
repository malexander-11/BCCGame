import { RULES } from '../data/types'
import type {
  BowlingPlan, Club, InningsResult, Intent, MatchOutcome, MatchResult, Player,
} from '../data/types'
import { autoBattingOrder } from './ai'
import { formatOvers, simulateInnings } from './innings'
import { autoPlan, buildRota } from './rota'
import { makeRng } from './rng'

/**
 * Bagshot always bowl first, so a match is:
 *
 *   1. opposition bat against your bowling plan  → sets the target
 *   2. you bat against theirs                    → chase it
 *
 * The two innings are simulated in separate calls because the player sets his
 * batting order at the interval, once he's seen what he has to chase. Each
 * innings derives its own RNG from the match seed, so the result is fully
 * reproducible whichever order the UI runs them in.
 */

export const TEAM_NAME = 'Bagshot CC'

const firstRng = (seed: number) => makeRng(seed)
const secondRng = (seed: number) => makeRng((seed ^ 0x9e3779b9) >>> 0)

export function simulateFieldingInnings(
  opponent: Club, bagshotXI: Player[], plan: BowlingPlan, seed: number,
  forms?: Record<string, number>,
): InningsResult {
  const rng = firstRng(seed)
  return simulateInnings({
    battingTeamName: opponent.name,
    fieldingTeamName: TEAM_NAME,
    battingOrder: autoBattingOrder(opponent.xi),
    fieldingXI: bagshotXI,
    rota: buildRota(plan, rng),
    target: null,
    forms,
    rng,
  })
}

export function simulateBattingInnings(
  opponent: Club, bagshotOrder: Player[], target: number, seed: number,
  forms?: Record<string, number>, intents?: (Intent | null)[],
): InningsResult {
  const rng = secondRng(seed)
  return simulateInnings({
    battingTeamName: TEAM_NAME,
    fieldingTeamName: opponent.name,
    battingOrder: bagshotOrder,
    fieldingXI: opponent.xi,
    rota: buildRota(autoPlan(opponent.xi), rng),
    target,
    // Gaps are filled from the live score by the engine, so an unmanaged chase
    // reads the game rather than following a plan drawn up in advance.
    intents,
    forms,
    rng,
  })
}

// ------------------------------------------------------------------- result

export function buildMatchResult(
  seed: number, opponent: Club, first: InningsResult, second: InningsResult,
): MatchResult {
  const target = first.runs + 1
  let outcome: MatchOutcome
  let margin: string

  if (second.runs >= target) {
    outcome = 'win'
    const wicketsLeft = RULES.wickets - second.wickets
    const ballsLeft = RULES.balls - second.balls
    margin = `won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`
    if (ballsLeft > 0) margin += ` with ${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} to spare`
  } else if (second.runs === first.runs) {
    outcome = 'tie'
    margin = 'match tied'
  } else {
    outcome = 'loss'
    const by = first.runs - second.runs
    margin = `lost by ${by} run${by === 1 ? '' : 's'}`
  }

  return {
    seed,
    opponentName: opponent.name,
    tier: opponent.tier,
    first,
    second,
    outcome,
    margin,
    motm: pickMotm(first, second, opponent.name, outcome),
    analysis: analyse(first, second, outcome),
  }
}

interface Perf { name: string; team: string; score: number; line: string }

function pickMotm(
  first: InningsResult, second: InningsResult, opponentName: string, outcome: MatchOutcome,
): { name: string; line: string; team: string } {
  const perfs: Perf[] = []

  const collect = (innings: InningsResult, battingTeam: string, bowlingTeam: string) => {
    for (const b of innings.batting) {
      if (!b.batted || b.balls === 0) continue
      const notOut = b.out === null
      const score =
        b.runs + b.fours * 1 + b.sixes * 2 + (notOut && b.runs >= 30 ? 8 : 0)
      perfs.push({
        name: b.name, team: battingTeam, score,
        line: `${b.runs}${notOut ? '*' : ''} (${b.balls})`,
      })
    }
    for (const b of innings.bowling) {
      if (b.balls === 0) continue
      const overs = b.balls / RULES.ballsPerOver
      const econ = b.runs / Math.max(overs, 0.1)
      const score = b.wickets * 20 + b.maidens * 4 + Math.max(0, (5.5 - econ) * overs * 1.6)
      perfs.push({
        name: b.name, team: bowlingTeam, score,
        line: `${b.wickets}-${b.runs} (${formatOvers(b.balls)})`,
      })
    }
  }

  collect(first, opponentName, TEAM_NAME)
  collect(second, TEAM_NAME, opponentName)

  // A match-winning performance beats an equally good one in a losing cause.
  const winner = outcome === 'win' ? TEAM_NAME : outcome === 'loss' ? opponentName : null
  for (const p of perfs) if (winner && p.team === winner) p.score *= 1.15

  perfs.sort((a, b) => b.score - a.score)
  const best = perfs[0]
  return best
    ? { name: best.name, line: best.line, team: best.team }
    : { name: '—', line: '', team: TEAM_NAME }
}

function analyse(first: InningsResult, second: InningsResult, outcome: MatchOutcome): string {
  const target = first.runs + 1
  const chaseRR = second.runRate

  if (outcome === 'win') {
    const wicketsLeft = RULES.wickets - second.wickets
    const ballsLeft = RULES.balls - second.balls
    if (ballsLeft <= 6) return 'Down to the last over. Nobody in the bar could watch.'
    if (wicketsLeft >= 7) return 'Never in doubt. The attack squeezed them, and the top order strolled it.'
    if (first.wickets >= 9) return `Bowled them out for ${first.runs} — the game was won in the field.`
    return `A proper chase. ${target} was a real total and the middle order saw it home.`
  }

  if (outcome === 'tie') return 'A tie. Forty-five overs each and nothing to separate them.'

  const short = first.runs - second.runs
  if (second.allOut && chaseRR < 4) {
    return `Rolled over for ${second.runs}. The chase never got going — ${short} short and it was never close.`
  }
  if (short <= 15) return `${short} short. One partnership, one shot, one dropped catch — that was the game.`
  if (first.runs >= 280) return `${first.runs} was too many. The plan leaked at the death and the chase was always a stretch.`
  if (second.wickets >= 8) return `Wickets kept falling. ${second.runs} all told, and the required rate did the rest.`
  return `${short} runs short. Not a bad day, just not enough of one.`
}

/** Convenience for the bench harness and quick previews — plays the whole match. */
export function simulateMatch(
  opponent: Club, bagshotXI: Player[], seed: number, plan?: BowlingPlan, order?: Player[],
): MatchResult {
  const usedPlan = plan ?? autoPlan(bagshotXI)
  const first = simulateFieldingInnings(opponent, bagshotXI, usedPlan, seed)
  const second = simulateBattingInnings(
    opponent, order ?? autoBattingOrder(bagshotXI), first.runs + 1, seed,
  )
  return buildMatchResult(seed, opponent, first, second)
}
