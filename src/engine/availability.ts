import { DEFAULT_AVAILABILITY, RULES } from '../data/types'
import type { Player } from '../data/types'
import { AWAY_REASONS, FALLOUTS, INJURIES, RETURN_LINES } from '../data/events'
import { isBowler } from './ratings'
import { hashString, makeRng, pick, pickIndex } from './rng'
import type { Rng } from './rng'

/**
 * Squad availability across a season.
 *
 * Three kinds of absence, deliberately different in shape:
 *
 *   away    one week only, rolled per player against his availability score
 *   injury  several weeks, topped up so three to five are always crocked
 *   fallout rare, long, and it always seems to be somebody good
 *
 * Only `away` reads the availability score, and that is the point of the split:
 * keenness decides whether a fit player fancies it, but a torn hamstring does
 * not care how keen he is. So your most reliable man can still be crocked, and
 * your 3-out-of-10 is a genuine gamble every single week.
 *
 * The result is that you cannot pick the same eleven every week. Squad depth
 * stops being decoration and selection becomes a real decision each round.
 */

export type EventKind = 'away' | 'injury' | 'fallout' | 'return'

export interface Absence {
  playerId: string
  kind: Exclude<EventKind, 'return'>
  reason: string
  /** First round they're available again. */
  until: number
}

export interface SquadEvent {
  round: number
  playerId: string
  playerName: string
  kind: EventKind
  /** Rendered line, e.g. "Alex Dunnage has pulled a hamstring". */
  text: string
  /** Rounds missed, for injuries and fallouts. */
  rounds?: number
}

export interface AvailabilityState {
  /** Injuries and fallouts, spanning rounds. */
  absences: Absence[]
  /** This round's one-week absences. */
  away: Absence[]
  /** Everything that has happened, oldest first. */
  log: SquadEvent[]
}

/** Injuries are topped up to this many at the start of every round. */
const INJURY_TARGET = { min: 3, max: 5 }
/**
 * Scales every player's chance of having other plans.
 *
 * At 1.0 the availability score reads literally: 7 out of 10 means he turns up
 * seven weeks in ten. Raise it to make the club flakier across the board, lower
 * it to make everyone more reliable, without touching a single player's score.
 */
const AWAY_PRESSURE = 1.0
/** Nobody is missing more often than this, whatever their score. */
const MAX_AWAY_CHANCE = 0.92
/** Chance per round that somebody falls out with the club. */
const FALLOUT_CHANCE = 0.18
/** Never leave the manager with fewer than this to pick from. */
const MIN_AVAILABLE = 13

const rollBetween = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

const clampScore = (v: number) => (v < 0 ? 0 : v > 10 ? 10 : v)

/** How often this player turns up, 0-1. */
export const availabilityRate = (p: Player) =>
  clampScore(p.availability ?? DEFAULT_AVAILABILITY) / 10

export const emptyAvailability = (): AvailabilityState => ({ absences: [], away: [], log: [] })

/** Everyone unavailable this round, absence keyed by player. */
export function unavailableMap(state: AvailabilityState): Map<string, Absence> {
  const m = new Map<string, Absence>()
  for (const a of state.absences) m.set(a.playerId, a)
  for (const a of state.away) m.set(a.playerId, a)
  return m
}

export function availablePlayers(squad: Player[], state: AvailabilityState): Player[] {
  const out = unavailableMap(state)
  return squad.filter((p) => !out.has(p.id))
}

/** Human-readable label for the reason someone is missing. */
export function absenceLabel(a: Absence): string {
  return a.kind === 'away' ? a.reason : a.reason
}

/**
 * Roll availability for a round.
 *
 * Deterministic in the season seed and round number, so reloading mid-season
 * can't reshuffle who is fit.
 */
export function rollRound(
  previous: AvailabilityState, squad: Player[], round: number, seasonSeed: number,
): AvailabilityState {
  const rng = makeRng(hashString(`avail-${seasonSeed}-${round}`))
  const log: SquadEvent[] = [...previous.log]
  const byId = new Map(squad.map((p) => [p.id, p]))

  const name = (id: string) => byId.get(id)?.name ?? id
  const add = (e: Omit<SquadEvent, 'round'>) => log.push({ ...e, round })

  // --- long absences tick down ------------------------------------------
  const absences: Absence[] = []
  for (const a of previous.absences) {
    if (!byId.has(a.playerId)) continue        // dropped from the squad
    if (a.until <= round) {
      add({
        playerId: a.playerId, playerName: name(a.playerId),
        kind: 'return', text: `${name(a.playerId)} ${pick(rng, RETURN_LINES)}`,
      })
    } else {
      absences.push(a)
    }
  }

  const isOut = (id: string) => absences.some((a) => a.playerId === id)

  // --- top the injury list back up --------------------------------------
  const target = rollBetween(rng, INJURY_TARGET.min, INJURY_TARGET.max)
  let injured = absences.filter((a) => a.kind === 'injury').length
  let guard = 0
  while (injured < target && guard++ < 40) {
    const fit = squad.filter((p) => !isOut(p.id))
    if (fit.length <= MIN_AVAILABLE) break
    const p = fit[pickIndex(rng, fit.length)]
    const t = INJURIES[pickIndex(rng, INJURIES.length)]
    const rounds = rollBetween(rng, t.min, t.max)
    absences.push({ playerId: p.id, kind: 'injury', reason: t.text, until: round + rounds })
    add({
      playerId: p.id, playerName: p.name, kind: 'injury',
      text: `${p.name} ${t.text}`, rounds,
    })
    injured++
  }

  // --- somebody storms off ----------------------------------------------
  if (rng() < FALLOUT_CHANCE) {
    const fit = squad.filter((p) => !isOut(p.id))
    if (fit.length > MIN_AVAILABLE) {
      const p = fit[pickIndex(rng, fit.length)]
      const t = FALLOUTS[pickIndex(rng, FALLOUTS.length)]
      const rounds = rollBetween(rng, t.min, t.max)
      absences.push({ playerId: p.id, kind: 'fallout', reason: t.text, until: round + rounds })
      add({
        playerId: p.id, playerName: p.name, kind: 'fallout',
        text: `${p.name} ${t.text}`, rounds,
      })
    }
  }

  // --- this week's plans -------------------------------------------------
  //
  // Rolled per player rather than by drawing a fixed number, so an
  // availability score actually means something: a 3-out-of-10 misses most
  // weeks and a 10 is there every time. The count that falls out varies with
  // the squad, which is the point.
  const away: Absence[] = []
  const pool = squad.filter((p) => !isOut(p.id))
  const reasons = [...AWAY_REASONS]
  for (const p of pool) {
    // `pool` already excludes the injured, so this is the count still standing.
    // Stopping here rather than leaning on ensurePickable matters: every player
    // it has to talk round is one whose score didn't mean what it said.
    if (pool.length - away.length <= MIN_AVAILABLE) break
    const score = p.availability ?? DEFAULT_AVAILABILITY
    const chance = Math.min(MAX_AWAY_CHANCE, AWAY_PRESSURE * (1 - clampScore(score) / 10))
    if (rng() >= chance) continue
    const reason = reasons.length
      ? reasons.splice(pickIndex(rng, reasons.length), 1)[0]
      : 'unavailable'
    away.push({ playerId: p.id, kind: 'away', reason, until: round + 1 })
    add({ playerId: p.id, playerName: p.name, kind: 'away', text: `${p.name} is ${reason}` })
  }

  return ensurePickable({ absences, away, log }, squad, round)
}

/**
 * A squad that can't raise a legal XI isn't a challenge, it's a bug.
 *
 * Recalls players who are merely busy — never the injured, and never anyone who
 * has walked out — until an eleven with five bowlers is possible again. Called
 * after every roll, and again after fresh air fallouts, which land later.
 */
export function ensurePickable(
  state: AvailabilityState, squad: Player[], round: number,
): AvailabilityState {
  let next = state
  while (true) {
    const fit = availablePlayers(squad, next)
    if (fit.length >= 11 && fit.filter(isBowler).length >= RULES.minBowlers) break
    if (next.away.length === 0) break
    // Talk round the most reliable first — he's the one who'd actually come.
    const byId = new Map(squad.map((p) => [p.id, p]))
    const away = [...next.away].sort((a, b) => {
      const pa = byId.get(a.playerId)
      const pb = byId.get(b.playerId)
      return (pa ? availabilityRate(pa) : 0) - (pb ? availabilityRate(pb) : 0)
    })
    const recalled = away.pop()!
    next = {
      ...next,
      away,
      log: next.log.filter(
        (e) => !(e.round === round && e.kind === 'away' && e.playerId === recalled.playerId),
      ),
    }
  }
  return next
}

/**
 * A player walks out. Used by the fresh air rule, which is the one absence the
 * manager brought on himself.
 */
export function addFallout(
  state: AvailabilityState, player: Player, round: number, rounds: number, reason: string,
): AvailabilityState {
  if (state.absences.some((a) => a.playerId === player.id)) return state
  return {
    ...state,
    absences: [
      ...state.absences,
      { playerId: player.id, kind: 'fallout', reason, until: round + rounds },
    ],
    // Also drop him from this week's away list if he somehow appears twice.
    away: state.away.filter((a) => a.playerId !== player.id),
    log: [
      ...state.log,
      {
        round, playerId: player.id, playerName: player.name, kind: 'fallout',
        text: `${player.name} ${reason}`, rounds,
      },
    ],
  }
}

/** Seed round one, so a season opens with people already crocked. */
export function initialAvailability(squad: Player[], seasonSeed: number): AvailabilityState {
  return rollRound(emptyAvailability(), squad, 1, seasonSeed)
}

/** Team news for one round, newest first, for the season screen. */
export function roundNews(state: AvailabilityState, round: number): SquadEvent[] {
  return state.log.filter((e) => e.round === round)
}
