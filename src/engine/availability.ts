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
 *   away    one week only, and everybody is equally likely to have plans
 *   injury  several weeks, topped up so three to five are always crocked
 *   fallout rare, long, and it always seems to be somebody good
 *
 * The point is that you cannot pick the same eleven every week. Squad depth
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
/** How many have other plans each week. */
const AWAY_COUNT = { min: 3, max: 5 }
/** Chance per round that somebody falls out with the club. */
const FALLOUT_CHANCE = 0.18
/** Never leave the manager with fewer than this to pick from. */
const MIN_AVAILABLE = 13

const rollBetween = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

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
  const away: Absence[] = []
  const wantAway = rollBetween(rng, AWAY_COUNT.min, AWAY_COUNT.max)
  const pool = squad.filter((p) => !isOut(p.id))
  const reasons = [...AWAY_REASONS]
  for (let i = 0; i < wantAway; i++) {
    const remaining = pool.filter((p) => !away.some((a) => a.playerId === p.id))
    if (pool.length - away.length <= MIN_AVAILABLE - absences.length) break
    if (remaining.length === 0) break
    const p = remaining[pickIndex(rng, remaining.length)]
    const reason = reasons.length
      ? reasons.splice(pickIndex(rng, reasons.length), 1)[0]
      : 'unavailable'
    away.push({ playerId: p.id, kind: 'away', reason, until: round + 1 })
    add({ playerId: p.id, playerName: p.name, kind: 'away', text: `${p.name} is ${reason}` })
  }

  const state: AvailabilityState = { absences, away, log }

  // --- last-resort guard --------------------------------------------------
  // A squad that can't raise a legal XI isn't a challenge, it's a bug. Recall
  // players who are merely busy — never the injured — until an XI is possible.
  while (true) {
    const fit = availablePlayers(squad, state)
    const enough = fit.length >= 11 && fit.filter(isBowler).length >= 5
    if (enough || state.away.length === 0) break
    const recalled = state.away.pop()!
    state.log = state.log.filter(
      (e) => !(e.round === round && e.kind === 'away' && e.playerId === recalled.playerId),
    )
  }

  return state
}

/** Seed round one, so a season opens with people already crocked. */
export function initialAvailability(squad: Player[], seasonSeed: number): AvailabilityState {
  return rollRound(emptyAvailability(), squad, 1, seasonSeed)
}

/** Team news for one round, newest first, for the season screen. */
export function roundNews(state: AvailabilityState, round: number): SquadEvent[] {
  return state.log.filter((e) => e.round === round)
}
