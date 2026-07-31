import type { Club, Player } from './types'
import { hashString, makeRng } from '../engine/rng'
import { clamp } from '../engine/ratings'

/**
 * Surrey Cricket Championship, **Division 6 West** — the division Bagshot's 1st
 * XI actually play in, with the clubs they actually play.
 *
 * The club names and their real finishing order are genuine. **Their players
 * and ratings are entirely invented** — fictional names generated from a hash
 * of the club name, so a given opponent always fields the same XI.
 *
 * Strengths are calibrated against Bagshot's own squad rather than the engine's
 * "60 is average" scale. That scale turns out to be club-internal: Bagshot rate
 * their own players against each other, and by that scale their best XI looks
 * elite while the real table has them 7th of 10. So the division is tuned so an
 * auto-picked Bagshot finishes about where they really did, and improving on it
 * is down to management.
 */

export interface LeagueClub extends Club {
  /** Where they finished in the real 2025 division. */
  realPosition: number
  /** Their real points total, shown on the season screen for context. */
  realPoints: number
}

/** Bagshot's real finishing position, the number a season is played against. */
export const BAGSHOT_REAL_POSITION = 7
export const BAGSHOT_REAL_POINTS = 118

interface Seed {
  name: string
  strength: number
  realPosition: number
  realPoints: number
}

// Ordered as they finished in 2025. Bagshot themselves are not in this list —
// they're the side you manage.
const DIVISION: Seed[] = [
  { name: 'Shepperton',         strength: 1.10, realPosition: 1, realPoints: 214 },
  { name: 'Egham',              strength: 1.08, realPosition: 2, realPoints: 196 },
  { name: 'East Molesey 3rd XI', strength: 1.06, realPosition: 3, realPoints: 177 },
  { name: 'Hampton Hill',       strength: 1.02, realPosition: 4, realPoints: 137 },
  { name: 'Whiteley Village',   strength: 1.01, realPosition: 5, realPoints: 136 },
  { name: 'Ripley',             strength: 1.00, realPosition: 6, realPoints: 130 },
  // Bagshot sit here, 7th on 118.
  { name: 'Chertsey 2nd XI',    strength: 0.96, realPosition: 8, realPoints: 107 },
  { name: "Stoke D'Abernon 2nd XI", strength: 0.92, realPosition: 9, realPoints: 87 },
  { name: 'Woking & Horsell 2nd XI', strength: 0.88, realPosition: 10, realPoints: 74 },
]

/**
 * The one knob that decides how hard the division is. Raise it to make the
 * league harder; every other number here is about the *order* of the table.
 *
 * Bagshot rate their own players against each other, so their "60 is average"
 * scale sits well above the engine's. This lifts every Division 6 West player
 * onto the same scale.
 *
 * It is tuned to +13, which puts a well-managed Bagshot around 4th-5th: in the
 * top four about half of seasons, champions roughly one in nine, and still
 * capable of a bad year. Pitching it so an auto-picked side finished 7th like
 * the real table made the title a 1-in-50 shot — accurate, but not a game. The
 * real 7th is the benchmark to beat instead.
 *
 * It was +16 before squad availability landed. Losing eight or nine players a
 * week to holidays, injuries and fallings-out is worth well over a league place
 * on its own, so the division was eased to keep the same difficulty.
 */
const DIVISION_BASELINE = 13

// ------------------------------------------------------------------ XI shape
//
// Same archetype ladder as the friendly opposition: a par side, shifted up or
// down as a block by the club's strength.

interface Archetype {
  skill: number; pwr: number; def: number; att: number
  positions: [number, number]
  wk?: boolean
  bowlType?: 'pace' | 'spin'
  swing?: number
}

const SHAPE: Archetype[] = [
  { skill: 70, pwr: 60, def: 0, att: 0, positions: [1, 2] },
  { skill: 65, pwr: 70, def: 0, att: 0, positions: [1, 3] },
  { skill: 73, pwr: 63, def: 48, att: 42, positions: [3, 4], bowlType: 'spin' },
  { skill: 69, pwr: 72, def: 0, att: 0, positions: [3, 5] },
  { skill: 62, pwr: 77, def: 55, att: 50, positions: [4, 6], bowlType: 'pace' },
  { skill: 63, pwr: 68, def: 67, att: 65, positions: [5, 7], bowlType: 'pace', swing: 60 },
  { skill: 58, pwr: 65, def: 0, att: 0, positions: [5, 8], wk: true },
  { skill: 52, pwr: 60, def: 72, att: 69, positions: [6, 8], bowlType: 'spin' },
  { skill: 42, pwr: 54, def: 70, att: 78, positions: [8, 10], bowlType: 'pace', swing: 72 },
  { skill: 36, pwr: 47, def: 77, att: 71, positions: [9, 11], bowlType: 'pace' },
  { skill: 27, pwr: 42, def: 65, att: 79, positions: [10, 11], bowlType: 'pace', swing: 55 },
]

const FIRST = [
  'Tom', 'Jack', 'Harry', 'Oliver', 'George', 'Charlie', 'Sam', 'Will', 'Josh', 'Ben',
  'Dan', 'Matt', 'Adam', 'Luke', 'Ryan', 'Alex', 'James', 'Rob', 'Chris', 'Ed',
  'Nick', 'Andy', 'Joe', 'Mike', 'Pete', 'Rhys', 'Callum', 'Freddie', 'Toby', 'Hugo',
]

const LAST = [
  'Hargreaves', 'Whitfield', 'Prentice', 'Ashworth', 'Lockhart', 'Bramley', 'Dunmore',
  'Kingsley', 'Radcliffe', 'Sutcliffe', 'Marchant', 'Ellery', 'Fairhurst', 'Bexley',
  'Corbett', 'Trelawney', 'Ravensworth', 'Hollis', 'Pargeter', 'Wainwright', 'Netherton',
  'Cavendish', 'Silverton', 'Ackroyd', 'Brightwell', 'Gorton', 'Maddock', 'Penhale',
  'Rushworth', 'Thackeray', 'Vellacott', 'Wyndham', 'Aldridge', 'Bickerstaff', 'Crowhurst',
]

const STRENGTH_SPREAD = 55

function buildXI(seed: Seed): Player[] {
  const rng = makeRng(hashString(`d6w-${seed.name}`))
  const offset = (seed.strength - 1) * STRENGTH_SPREAD
  const used = new Set<string>()

  return SHAPE.map((a, i) => {
    let name = ''
    for (let tries = 0; tries < 40; tries++) {
      const candidate = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`
      if (!used.has(candidate)) { name = candidate; break }
    }
    if (!name) name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`
    used.add(name)

    const jit = () => (rng() - 0.5) * 8
    const rate = (base: number) =>
      (base <= 0 ? 0 : Math.round(clamp(base + DIVISION_BASELINE + offset + jit(), 10, 97)))

    const bat = { skill: rate(a.skill), pwr: rate(a.pwr) }
    const bowl = { def: rate(a.def), att: rate(a.att) }
    const quality = Math.max(0.58 * bat.skill + 0.42 * bat.pwr, (bowl.def + bowl.att) / 2)

    return {
      id: `${seed.name.replace(/\W+/g, '').toLowerCase()}-${i + 1}`,
      name,
      value: Math.round(clamp((quality - 28) / 7, 1, 11) * 10) / 10,
      positions: a.positions,
      wk: a.wk,
      bowlType: a.bowlType,
      swing: a.swing,
      bat,
      bowl,
    }
  })
}

export const DIV6_WEST: LeagueClub[] = DIVISION.map((c) => ({
  id: `d6w-${c.name.replace(/\W+/g, '').toLowerCase()}`,
  name: c.name,
  tier: 'midtable',
  strength: c.strength,
  xi: buildXI(c),
  realPosition: c.realPosition,
  realPoints: c.realPoints,
}))

export function findLeagueClub(id: string): LeagueClub | undefined {
  return DIV6_WEST.find((c) => c.id === id)
}
