import type { Player } from './data/types'
import type { Season } from './engine/season'
import { BAGSHOT_SQUAD } from './data/squad'

// Bumped whenever the shipped squad changes shape, so a stale save can't shadow
// it: v2 replaced the placeholders with the real squad and added `value`, v3
// trimmed it from 42 players to 24, v4 restored three and added swing ratings.
const SQUAD_KEY = 'bcc.squad.v4'
const RECORD_KEY = 'bcc.record.v1'
const SEASON_KEY = 'bcc.season.v1'
const PREFS_KEY = 'bcc.prefs.v1'

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

// ------------------------------------------------------------------- season

/** A season in progress, stored whole so a campaign survives a reload. */
export function loadSeason(): Season | null {
  try {
    const raw = localStorage.getItem(SEASON_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Season
    // Guard against a save written by an older schedule shape.
    if (!Array.isArray(s?.schedule) || !Array.isArray(s?.results) || !s?.stats) return null
    return s
  } catch { return null }
}

export function saveSeason(season: Season | null): void {
  try {
    if (season) localStorage.setItem(SEASON_KEY, JSON.stringify(season))
    else localStorage.removeItem(SEASON_KEY)
  } catch { /* private mode */ }
}

// -------------------------------------------------------------- preferences

export interface Prefs {
  /** Skip the over-by-over playback and go straight to the scorecard. */
  instant: boolean
}

const DEFAULT_PREFS: Prefs = { instant: false }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch { return DEFAULT_PREFS }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
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
