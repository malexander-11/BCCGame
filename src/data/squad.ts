import type { Player } from './types'

/**
 * ============================================================================
 *  BAGSHOT CC SQUAD — the real thing.
 * ============================================================================
 *
 * Every rating is 0-100 and **60 is league average**:
 *
 *   bat.skill  SKILL — survival. Hard to get out. Drives your wicket column.
 *   bat.pwr    PWR   — scoring. Boundaries and strike rate.
 *   bowl.def   DEF   — containment. Economy, dots, fewer wides.
 *   bowl.att   ATT   — penetration. Taking wickets.
 *
 * `value` is the player's price in £m. It is shown on the team sheet but does
 * not constrain selection — there is no budget cap.
 *
 * `positions` — the batting slots a player can be picked in, inclusive — is the
 * one field not in the source data. It is derived from each player's role and
 * batting quality, so treat it as a first cut and edit freely: picking someone
 * outside his range is allowed, it just costs him a little.
 *
 * A rating below 20 in either DEF or ATT means the player doesn't bowl, and he
 * won't appear in the bowling plan. Neither will whoever is keeping wicket.
 *
 * This is a trimmed 24-man squad — enough for a keeper, a full attack and real
 * choices in the middle order, without a long tail who would never be picked.
 * Add anyone back by pasting their entry in; nothing depends on the size.
 */
export const BAGSHOT_SQUAD: Player[] = [
  {
    id: 'keith-wheeler', name: 'Keith Wheeler', value: 2,
    role: 'Spin all-rounder', positions: [3, 6],
    bowlType: 'spin',
    bat: { skill: 78, pwr: 88 }, bowl: { def: 34, att: 50 },
  },
  {
    id: 'andrew-doyle', name: 'Andrew Doyle', value: 4,
    role: 'Batting all-rounder', positions: [1, 4],
    bowlType: 'pace',
    bat: { skill: 85, pwr: 73 }, bowl: { def: 44, att: 52 },
  },
  {
    id: 'jack-grinstead', name: 'Jack Grinstead', value: 4,
    role: 'Batter', positions: [1, 3],
    bowlType: 'pace',
    bat: { skill: 88, pwr: 85 }, bowl: { def: 27, att: 34 },
  },
  {
    id: 'jack-rowlett', name: 'Jack Rowlett', value: 3.9,
    role: 'Batting all-rounder', positions: [1, 4],
    bowlType: 'pace',
    bat: { skill: 77, pwr: 91 }, bowl: { def: 45, att: 52 },
  },
  {
    id: 'josh-nakarja', name: 'Josh Nakarja', value: 3.5,
    role: 'All-rounder', positions: [4, 7],
    bowlType: 'pace',
    bat: { skill: 73, pwr: 85 }, bowl: { def: 57, att: 63 },
  },
  {
    id: 'alex-dunnage', name: 'Alex Dunnage', value: 1.5,
    role: 'Spin all-rounder', positions: [3, 6],
    bowlType: 'spin',
    bat: { skill: 79, pwr: 93 }, bowl: { def: 81, att: 76 },
  },
  {
    id: 'surya-babu', name: 'Surya Babu', value: 3.3,
    role: 'All-rounder', positions: [4, 7],
    bowlType: 'pace',
    bat: { skill: 68, pwr: 85 }, bowl: { def: 74, att: 81 },
  },
  {
    id: 'jack-brown', name: 'Jack Brown', value: 3.9,
    role: 'Bowler', positions: [9, 11],
    bowlType: 'pace',
    bat: { skill: 35, pwr: 44 }, bowl: { def: 84, att: 88 },
  },
  {
    id: 'matt-alexander', name: 'Matt Alexander', value: 3.9,
    role: 'Bowler', positions: [10, 11],
    bowlType: 'pace',
    bat: { skill: 1, pwr: 1 }, bowl: { def: 84, att: 78 },
  },
  {
    id: 'archie-graham', name: 'Archie Graham', value: 5.9,
    role: 'All-rounder', positions: [5, 8],
    bowlType: 'pace',
    bat: { skill: 71, pwr: 65 }, bowl: { def: 81, att: 86 },
  },
  {
    id: 'albie-swindells', name: 'Albie Swindells', value: 3.4,
    role: 'Bowler', positions: [9, 11],
    bowlType: 'pace',
    bat: { skill: 30, pwr: 38 }, bowl: { def: 79, att: 81 },
  },
  {
    id: 'adam-passfield', name: 'Adam Passfield', value: 2,
    role: 'All-rounder', positions: [4, 7],
    bowlType: 'pace',
    bat: { skill: 77, pwr: 76 }, bowl: { def: 84, att: 81 },
  },
  {
    id: 'jonathan-atkinson', name: 'Jonathan Atkinson', value: 2.5,
    role: 'Spin bowler', positions: [7, 9],
    bowlType: 'spin',
    bat: { skill: 68, pwr: 58 }, bowl: { def: 82, att: 79 },
  },
  {
    id: 'matt-pettet', name: 'Matt Pettet', value: 3.9,
    role: 'Bowler', positions: [7, 9],
    bowlType: 'pace',
    bat: { skill: 70, pwr: 55 }, bowl: { def: 80, att: 79 },
  },
  {
    id: 'james-white', name: 'James White', value: 9.7,
    role: 'All-rounder', positions: [3, 6],
    bowlType: 'pace',
    bat: { skill: 87, pwr: 81 }, bowl: { def: 91, att: 88 },
  },
  {
    id: 'paul-kelly', name: 'Paul Kelly', value: 6.6,
    role: 'All-rounder', positions: [5, 8],
    bowlType: 'pace',
    bat: { skill: 69, pwr: 82 }, bowl: { def: 68, att: 72 },
  },
  {
    id: 'jeremy-davis', name: 'Jeremy Davis', value: 8.5,
    role: 'Spin all-rounder', positions: [4, 7],
    bowlType: 'spin',
    bat: { skill: 78, pwr: 74 }, bowl: { def: 76, att: 74 },
  },
  {
    id: 'adit-gandhi', name: 'Adit Gandhi', value: 9.1,
    role: 'Spin all-rounder', positions: [3, 6],
    bowlType: 'spin',
    bat: { skill: 83, pwr: 88 }, bowl: { def: 82, att: 79 },
  },
  {
    id: 'tony-roome', name: 'Tony Roome', value: 4.9,
    role: 'All-rounder', positions: [5, 8],
    bowlType: 'pace',
    bat: { skill: 75, pwr: 63 }, bowl: { def: 76, att: 70 },
  },
  {
    id: 'alex-murray', name: 'Alex Murray', value: 3.9,
    role: 'All-rounder', positions: [4, 7],
    bowlType: 'pace',
    bat: { skill: 77, pwr: 76 }, bowl: { def: 74, att: 73 },
  },
  {
    id: 'henry-mackay', name: 'Henry Mackay', value: 10.1,
    role: 'Defensive bowler', positions: [4, 7],
    bowlType: 'pace',
    bat: { skill: 88, pwr: 83 }, bowl: { def: 81, att: 92 },
  },
  {
    id: 'brad-pressfield', name: 'Brad Pressfield', value: 2,
    role: 'Spin all-rounder', positions: [3, 6],
    bowlType: 'spin',
    bat: { skill: 81, pwr: 82 }, bowl: { def: 83, att: 81 },
  },
  {
    id: 'michael-davis', name: 'Michael Davis', value: 4.8,
    role: 'Wicketkeeper-batter', positions: [1, 4],
    wk: true, bowlType: 'pace',
    bat: { skill: 82, pwr: 76 }, bowl: { def: 63, att: 55 },
  },
  {
    id: 'stuart-derry', name: 'Stuart Derry', value: 3.5,
    role: 'Wicketkeeper-batter', positions: [3, 6],
    wk: true,
    bat: { skill: 76, pwr: 48 }, bowl: { def: 1, att: 1 },
  },
]

/** Total cost of fielding literally everyone, for scale. */
export const SQUAD_VALUE = BAGSHOT_SQUAD.reduce((sum, p) => sum + p.value, 0)
