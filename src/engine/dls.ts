import { RULES } from '../data/types'

/**
 * Duckworth-Lewis-Stern par scores.
 *
 * The table below is the published **Standard Edition** resource table: the
 * percentage of its total run-scoring resources a side still has, given overs
 * remaining and wickets already lost. Fifty overs with all ten in hand is 100%.
 *
 * No rain is simulated here. A par score is shown for the same reason it is on
 * television during an uninterrupted chase — it answers "are we ahead?" far
 * better than a required run rate does, because it prices in wickets as well as
 * balls. Nine down and level with the rate is not level at all.
 */

/** Overs remaining, descending, matching the rows of RESOURCES. */
const OVERS_ROWS = [
  50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0,
]

/** RESOURCES[oversRow][wicketsLost] — percentage of resources remaining. */
const RESOURCES: number[][] = [
  // 0     1     2     3     4     5     6     7     8     9
  [100.0, 93.4, 85.1, 74.9, 62.7, 49.0, 34.9, 22.0, 11.9, 4.7], // 50 overs
  [ 90.3, 85.1, 78.5, 70.0, 59.5, 47.6, 34.6, 22.0, 11.9, 4.7], // 45
  [ 83.8, 79.8, 74.5, 67.3, 58.3, 47.6, 34.6, 22.0, 11.9, 4.7], // 40
  [ 76.1, 73.0, 68.9, 63.2, 55.7, 46.1, 34.2, 22.0, 11.9, 4.7], // 35
  [ 66.5, 64.2, 61.0, 56.7, 50.9, 43.4, 33.2, 21.9, 11.9, 4.7], // 30
  [ 56.6, 54.9, 52.6, 49.5, 45.2, 39.5, 31.3, 21.4, 11.8, 4.7], // 25
  [ 46.1, 44.9, 43.4, 41.2, 38.4, 34.4, 28.6, 20.5, 11.7, 4.7], // 20
  [ 35.0, 34.3, 33.4, 32.1, 30.4, 28.0, 24.5, 18.7, 11.4, 4.7], // 15
  [ 23.9, 23.5, 23.0, 22.4, 21.5, 20.3, 18.4, 15.4, 10.5, 4.7], // 10
  [ 12.5, 12.3, 12.2, 12.0, 11.7, 11.3, 10.7,  9.7,  7.8, 4.5], //  5
  [  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, 0.0], //  0
]

/**
 * Resources remaining as a percentage, interpolating linearly between the
 * table's five-over rows.
 */
export function resources(oversLeft: number, wicketsLost: number): number {
  if (wicketsLost >= RULES.wickets) return 0
  const w = Math.max(0, Math.min(9, Math.floor(wicketsLost)))
  const ov = Math.max(0, Math.min(50, oversLeft))

  // Rows run high-to-low, so find the pair that brackets `ov`.
  for (let i = 0; i < OVERS_ROWS.length - 1; i++) {
    const hi = OVERS_ROWS[i]
    const lo = OVERS_ROWS[i + 1]
    if (ov <= hi && ov >= lo) {
      const t = hi === lo ? 0 : (ov - lo) / (hi - lo)
      return RESOURCES[i + 1][w] + t * (RESOURCES[i][w] - RESOURCES[i + 1][w])
    }
  }
  return RESOURCES[0][w]
}

/** Resources a side batting the full innings starts with. */
export function startingResources(): number {
  return resources(RULES.overs, 0)
}

export interface DlsState {
  /** The score the chasing side needs to be level on DLS right now. */
  par: number
  /** Runs ahead of par. Negative is behind. */
  diff: number
  /** Percentage of the chasing side's resources already spent. */
  used: number
}

/**
 * Par for a side chasing `target` runs (first-innings total + 1), having scored
 * `runs` for `wickets` off `ballsBowled`.
 *
 * Par is the first-innings score scaled by the share of resources the chasing
 * side has consumed. Level means a tie, so being *above* par is winning.
 */
export function dlsPar(
  firstInningsRuns: number, runs: number, wickets: number, ballsBowled: number,
): DlsState {
  const start = startingResources()
  const oversLeft = (RULES.balls - ballsBowled) / RULES.ballsPerOver
  const left = resources(oversLeft, wickets)
  const spent = Math.max(0, start - left)
  const par = Math.round((firstInningsRuns * spent) / start)
  return { par, diff: runs - par, used: (spent / start) * 100 }
}
