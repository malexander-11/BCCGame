import type { InningsResult, Player } from '../data/types'
import { addFallout, availablePlayers, ensurePickable } from './availability'
import type { AvailabilityState } from './availability'
import { makeRng, hashString, pickIndex } from './rng'

/**
 * Fresh air games.
 *
 * A player picked for a match who then neither faces a ball nor bowls one has
 * had a fresh air game: he gave up his Saturday, put his whites on, and did
 * nothing. Club cricketers do not take this well.
 *
 * It's the one absence you bring on yourself — bat your non-bowlers at nine,
 * ten and eleven, win the chase inside thirty overs, and three of them went
 * home having had no involvement at all.
 */

/** Chance he walks out, first offence. */
const BASE_CHANCE = 0.30
/** How much each previous fresh air game this season stacks on top. */
const REPEAT_STEP = 0.25
const MAX_CHANCE = 0.85

/** How long he sulks for, in rounds. */
const OUT_MIN = 2
const OUT_MAX = 4

const LINES = [
  'was picked and never got a bat or a bowl, and has had enough',
  'gave up his Saturday to field for 90 overs and has decided that will do',
  'did not face a ball or bowl one, and is not answering the group chat',
  'travelled an hour to carry the drinks, and will not be doing it again',
  'has pointed out he has not had a bat in weeks, and walked',
]

/** Who in the XI did nothing at all. */
export function freshAirPlayers(
  xi: Player[], bowlingInnings: InningsResult, battingInnings: InningsResult,
): Player[] {
  const bowled = new Set(
    bowlingInnings.bowling.filter((b) => b.balls > 0).map((b) => b.playerId),
  )
  const batted = new Set(
    battingInnings.batting.filter((b) => b.balls > 0).map((b) => b.playerId),
  )
  return xi.filter((p) => !bowled.has(p.id) && !batted.has(p.id))
}

export interface FreshAirOutcome {
  availability: AvailabilityState
  /** Everyone who had a fresh air game, whether or not they stormed off. */
  offenders: string[]
  /** Those who actually walked. */
  walkedOut: string[]
}

/**
 * Apply the consequences. The fallout is immediate when it fires, but it does
 * not fire every time — a short chase can leave three players idle, and
 * removing three a week would empty the squad by August. Repeat offences make
 * it far more likely, which is the bit that should change how you pick.
 */
export function applyFreshAir(
  availability: AvailabilityState,
  squad: Player[],
  xi: Player[],
  bowlingInnings: InningsResult,
  battingInnings: InningsResult,
  priorCounts: Record<string, number>,
  round: number,
  seasonSeed: number,
): FreshAirOutcome {
  const offenders = freshAirPlayers(xi, bowlingInnings, battingInnings)
  const rng = makeRng(hashString(`freshair-${seasonSeed}-${round}`))
  let state = availability
  const walkedOut: string[] = []

  for (const p of offenders) {
    const prior = priorCounts[p.id] ?? 0
    const chance = Math.min(MAX_CHANCE, BASE_CHANCE + REPEAT_STEP * prior)
    if (rng() >= chance) continue
    // Losing him must not leave the club unable to field a side. The rule is
    // meant to hurt, not to break the season.
    if (availablePlayers(squad, state).length <= 13) break
    const rounds = OUT_MIN + Math.floor(rng() * (OUT_MAX - OUT_MIN + 1))
    const before = state
    state = addFallout(state, p, round, rounds, LINES[pickIndex(rng, LINES.length)])
    if (state !== before) walkedOut.push(p.id)
  }

  // Walk-outs land after the weekly roll, so re-run the guard.
  state = ensurePickable(state, squad, round)
  return { availability: state, offenders: offenders.map((p) => p.id), walkedOut }
}
