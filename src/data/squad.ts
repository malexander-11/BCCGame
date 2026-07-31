import type { Player } from './types'

/**
 * ============================================================================
 *  BAGSHOT CC SQUAD — PLACEHOLDER DATA. REPLACE THE LIST BELOW.
 * ============================================================================
 *
 * These are invented players so the game is playable out of the box. Swap them
 * for the real squad — either by editing this file, or in-game via the SQUAD
 * screen, which saves to localStorage and overrides this file.
 *
 * Every rating is 0-100 and **60 is league average**:
 *
 *   bat.skill  SKILL — survival. Hard to get out. Drives your wicket column.
 *   bat.pwr    PWR   — scoring. Boundaries and strike rate.
 *   bowl.def   DEF   — containment. Economy, dots, fewer wides.
 *   bowl.att   ATT   — penetration. Taking wickets.
 *
 * Rough calibration for a Surrey Championship side:
 *
 *   85+   league star, best in the division
 *   75    first-team regular, wins games on his own
 *   60    solid first-teamer — the baseline
 *   45    second-team standard
 *   30    genuine rabbit / doesn't bowl
 *
 * `positions` is the range of batting slots the player can be picked in,
 * inclusive. Picking someone outside it is allowed but carries a small penalty.
 * Give a non-bowler `bowl: { def: 0, att: 0 }` and they won't be selectable in
 * the bowling plan.
 */
export const BAGSHOT_SQUAD: Player[] = [
  {
    id: 'p01', name: 'Sam Opener', positions: [1, 2],
    bat: { skill: 74, pwr: 62 }, bowl: { def: 0, att: 0 },
  },
  {
    id: 'p02', name: 'Will Hooper', positions: [1, 3],
    bat: { skill: 66, pwr: 75 }, bowl: { def: 0, att: 0 },
  },
  {
    id: 'p03', name: 'Ollie Anchor', positions: [3, 4],
    bat: { skill: 78, pwr: 64 }, bowl: { def: 52, att: 44 }, bowlType: 'spin',
  },
  {
    id: 'p04', name: 'James Skipper', positions: [3, 5],
    bat: { skill: 71, pwr: 73 }, bowl: { def: 58, att: 55 }, bowlType: 'pace',
  },
  {
    id: 'p05', name: 'Tom Finisher', positions: [4, 6],
    bat: { skill: 62, pwr: 82 }, bowl: { def: 0, att: 0 },
  },
  {
    id: 'p06', name: 'Harry Allround', positions: [5, 7],
    bat: { skill: 65, pwr: 70 }, bowl: { def: 68, att: 66 }, bowlType: 'pace',
  },
  {
    id: 'p07', name: 'Ben Gloves', positions: [5, 8], wk: true,
    bat: { skill: 60, pwr: 67 }, bowl: { def: 0, att: 0 },
  },
  {
    id: 'p08', name: 'Charlie Twirl', positions: [6, 8],
    bat: { skill: 56, pwr: 61 }, bowl: { def: 74, att: 70 }, bowlType: 'spin',
  },
  {
    id: 'p09', name: 'Danny Quick', positions: [8, 10],
    bat: { skill: 44, pwr: 58 }, bowl: { def: 70, att: 80 }, bowlType: 'pace',
  },
  {
    id: 'p10', name: 'Rob Seam', positions: [9, 11],
    bat: { skill: 38, pwr: 46 }, bowl: { def: 78, att: 72 }, bowlType: 'pace',
  },
  {
    id: 'p11', name: 'Alfie Yorker', positions: [10, 11],
    bat: { skill: 28, pwr: 44 }, bowl: { def: 66, att: 79 }, bowlType: 'pace',
  },
  // --- squad players, not automatically in the XI -------------------------
  {
    id: 'p12', name: 'Nick Blocker', positions: [1, 3],
    bat: { skill: 68, pwr: 52 }, bowl: { def: 0, att: 0 },
  },
  {
    id: 'p13', name: 'Joe Slogger', positions: [6, 9],
    bat: { skill: 48, pwr: 76 }, bowl: { def: 48, att: 52 }, bowlType: 'pace',
  },
  {
    id: 'p14', name: 'Ed Steady', positions: [4, 7],
    bat: { skill: 63, pwr: 58 }, bowl: { def: 62, att: 50 }, bowlType: 'spin',
  },
  {
    id: 'p15', name: 'Max Colt', positions: [7, 10],
    bat: { skill: 46, pwr: 60 }, bowl: { def: 60, att: 64 }, bowlType: 'pace',
  },
]

/** True while the shipped placeholders are still in use — the UI nags about it. */
export const SQUAD_IS_PLACEHOLDER = true
