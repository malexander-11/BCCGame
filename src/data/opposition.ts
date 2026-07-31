import type { Club, Player, Tier } from './types'
import { hashString, makeRng } from '../engine/rng'
import { clamp } from '../engine/ratings'

/**
 * Opposition sides.
 *
 * The club names are real Surrey Cricket Championship clubs — Bagshot's Saturday
 * XIs moved into the SCC in 2025. **The players and ratings are entirely
 * invented**: fictional names generated from a hash of the club name, so a
 * given opponent always fields the same XI, but no real cricketer is depicted.
 */

export const TIER_LABEL: Record<Tier, string> = {
  derby: 'Local derby',
  midtable: 'Mid-table',
  promotion: 'Promotion push',
  premier: 'Premier Division',
}

export const TIER_BLURB: Record<Tier, string> = {
  derby: 'Neighbours. Everyone knows everyone, and nobody wants to lose this one.',
  midtable: 'A solid league side. Beat them and you have had a good day.',
  promotion: 'Top of the table. Two overseas-standard batters and a genuinely quick opening pair.',
  premier: 'Premier Division opposition. You will need everything to go right.',
}

interface ClubSeed { name: string; tier: Tier; strength: number }

const CLUBS: ClubSeed[] = [
  // Local sides around Bagshot and north-west Surrey.
  { name: 'Camberley', tier: 'derby', strength: 0.95 },
  { name: 'Valley End', tier: 'derby', strength: 0.91 },
  { name: 'Normandy', tier: 'derby', strength: 0.93 },
  { name: 'Byfleet', tier: 'derby', strength: 0.89 },
  { name: 'Woking & Horsell', tier: 'derby', strength: 0.96 },
  { name: 'Chertsey', tier: 'derby', strength: 0.90 },
  { name: 'Egham', tier: 'derby', strength: 0.94 },

  { name: 'Weybridge', tier: 'midtable', strength: 1.00 },
  { name: 'Walton on Thames', tier: 'midtable', strength: 0.99 },
  { name: 'Guildford', tier: 'midtable', strength: 1.03 },
  { name: 'Farnham', tier: 'midtable', strength: 1.01 },
  { name: 'Cranleigh', tier: 'midtable', strength: 0.98 },
  { name: 'Dorking', tier: 'midtable', strength: 1.02 },
  { name: 'Epsom', tier: 'midtable', strength: 1.00 },
  { name: 'Chessington', tier: 'midtable', strength: 0.97 },
  { name: 'Horley', tier: 'midtable', strength: 0.99 },

  { name: 'Esher', tier: 'promotion', strength: 1.26 },
  { name: 'Sunbury', tier: 'promotion', strength: 1.21 },
  { name: 'Ashtead', tier: 'promotion', strength: 1.27 },
  { name: 'Purley', tier: 'promotion', strength: 1.19 },
  { name: 'Malden Wanderers', tier: 'promotion', strength: 1.24 },
  { name: 'Worcester Park', tier: 'promotion', strength: 1.18 },

  { name: 'Sutton', tier: 'premier', strength: 1.32 },
  { name: 'Spencer', tier: 'premier', strength: 1.31 },
  { name: 'East Molesey', tier: 'premier', strength: 1.34 },
  { name: 'Banstead', tier: 'premier', strength: 1.36 },
  { name: 'Reigate Priory', tier: 'premier', strength: 1.39 },
  { name: 'Wimbledon', tier: 'premier', strength: 1.42 },
]

// ------------------------------------------------------------------ XI shape
//
// Ratings for a par mid-table Surrey side. A club's strength shifts every
// number up or down together.

interface Archetype {
  skill: number; pwr: number; def: number; att: number
  positions: [number, number]
  wk?: boolean
  bowlType?: 'pace' | 'spin'
}

const SHAPE: Archetype[] = [
  { skill: 70, pwr: 60, def: 0, att: 0, positions: [1, 2] },
  { skill: 65, pwr: 70, def: 0, att: 0, positions: [1, 3] },
  { skill: 73, pwr: 63, def: 48, att: 42, positions: [3, 4], bowlType: 'spin' },
  { skill: 69, pwr: 72, def: 0, att: 0, positions: [3, 5] },
  { skill: 62, pwr: 77, def: 55, att: 50, positions: [4, 6], bowlType: 'pace' },
  { skill: 63, pwr: 68, def: 67, att: 65, positions: [5, 7], bowlType: 'pace' },
  { skill: 58, pwr: 65, def: 0, att: 0, positions: [5, 8], wk: true },
  { skill: 52, pwr: 60, def: 72, att: 69, positions: [6, 8], bowlType: 'spin' },
  { skill: 42, pwr: 54, def: 70, att: 78, positions: [8, 10], bowlType: 'pace' },
  { skill: 36, pwr: 47, def: 77, att: 71, positions: [9, 11], bowlType: 'pace' },
  { skill: 27, pwr: 42, def: 65, att: 79, positions: [10, 11], bowlType: 'pace' },
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
  'Denholm', 'Everleigh', 'Foxton', 'Grimshaw', 'Halloway',
]

/** Strength shifts every rating by a flat offset — a better side is better everywhere. */
const STRENGTH_SPREAD = 55

function buildXI(club: ClubSeed): Player[] {
  const rng = makeRng(hashString(club.name))
  const offset = (club.strength - 1) * STRENGTH_SPREAD
  const usedNames = new Set<string>()

  return SHAPE.map((a, i) => {
    let name = ''
    for (let tries = 0; tries < 40; tries++) {
      const candidate = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`
      if (!usedNames.has(candidate)) { name = candidate; break }
    }
    if (!name) name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`
    usedNames.add(name)

    // A little jitter so two clubs of equal strength don't field clones.
    const jit = () => (rng() - 0.5) * 8
    const rate = (base: number) => (base <= 0 ? 0 : Math.round(clamp(base + offset + jit(), 10, 97)))

    const bat = { skill: rate(a.skill), pwr: rate(a.pwr) }
    const bowl = { def: rate(a.def), att: rate(a.att) }

    // Opposition prices are cosmetic — shown on their team sheet, never spent.
    const quality = Math.max(0.58 * bat.skill + 0.42 * bat.pwr, (bowl.def + bowl.att) / 2)
    const value = Math.round(clamp((quality - 28) / 7, 1, 11) * 10) / 10

    return {
      id: `${club.name.replace(/\W+/g, '').toLowerCase()}-${i + 1}`,
      name,
      value,
      positions: a.positions,
      wk: a.wk,
      bowlType: a.bowlType,
      bat,
      bowl,
    }
  })
}

export const OPPOSITION: Club[] = CLUBS.map((c) => ({
  id: c.name.replace(/\W+/g, '').toLowerCase(),
  name: c.name,
  tier: c.tier,
  strength: c.strength,
  xi: buildXI(c),
}))

export const OPPOSITION_BY_TIER: Record<Tier, Club[]> = {
  derby: OPPOSITION.filter((c) => c.tier === 'derby'),
  midtable: OPPOSITION.filter((c) => c.tier === 'midtable'),
  promotion: OPPOSITION.filter((c) => c.tier === 'promotion'),
  premier: OPPOSITION.filter((c) => c.tier === 'premier'),
}

export const TIER_ORDER: Tier[] = ['derby', 'midtable', 'promotion', 'premier']

export function findClub(id: string): Club | undefined {
  return OPPOSITION.find((c) => c.id === id)
}
