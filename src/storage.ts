import type { Player } from './data/types'
import { BAGSHOT_SQUAD } from './data/squad'

// Bumped whenever the shipped squad changes shape, so a stale save can't shadow
// it: v2 replaced the placeholders with the real squad and added `value`, v3
// trimmed it from 42 players to 24.
const SQUAD_KEY = 'bcc.squad.v3'
const RECORD_KEY = 'bcc.record.v1'

export interface Record {
  played: number
  won: number
  lost: number
  tied: number
  /** Best individual chase, for the home screen. */
  bestChase: { runs: number; opponent: string } | null
}

const EMPTY_RECORD: Record = { played: 0, won: 0, lost: 0, tied: 0, bestChase: null }

function looksLikePlayer(v: unknown): v is Player {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Partial<Player>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.bat?.skill === 'number' &&
    typeof p.bat?.pwr === 'number' &&
    typeof p.bowl?.def === 'number' &&
    typeof p.bowl?.att === 'number' &&
    Array.isArray(p.positions) && p.positions.length === 2
  )
}

/** Saved squad wins over the file; a corrupt save silently falls back. */
export function loadSquad(): Player[] {
  try {
    const raw = localStorage.getItem(SQUAD_KEY)
    if (!raw) return BAGSHOT_SQUAD
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 11 && parsed.every(looksLikePlayer)) {
      return parsed.map((p) => ({ ...p, value: typeof p.value === 'number' ? p.value : 0 }))
    }
  } catch { /* fall through */ }
  return BAGSHOT_SQUAD
}

export function saveSquad(squad: Player[]): void {
  try { localStorage.setItem(SQUAD_KEY, JSON.stringify(squad)) } catch { /* private mode */ }
}

export function resetSquad(): void {
  try { localStorage.removeItem(SQUAD_KEY) } catch { /* private mode */ }
}

export function usingCustomSquad(): boolean {
  try { return localStorage.getItem(SQUAD_KEY) !== null } catch { return false }
}

export function loadRecord(): Record {
  try {
    const raw = localStorage.getItem(RECORD_KEY)
    if (!raw) return EMPTY_RECORD
    return { ...EMPTY_RECORD, ...(JSON.parse(raw) as Partial<Record>) }
  } catch { return EMPTY_RECORD }
}

export function saveRecord(r: Record): void {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)) } catch { /* private mode */ }
}

export function recordMatch(
  r: Record, outcome: 'win' | 'loss' | 'tie', chased: number, opponent: string,
): Record {
  const next: Record = {
    played: r.played + 1,
    won: r.won + (outcome === 'win' ? 1 : 0),
    lost: r.lost + (outcome === 'loss' ? 1 : 0),
    tied: r.tied + (outcome === 'tie' ? 1 : 0),
    bestChase:
      outcome === 'win' && (!r.bestChase || chased > r.bestChase.runs)
        ? { runs: chased, opponent }
        : r.bestChase,
  }
  saveRecord(next)
  return next
}
