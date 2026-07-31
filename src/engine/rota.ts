import { RULES } from '../data/types'
import type { BowlingPlan, Player, Rota, SpellPref } from '../data/types'
import { clamp } from './ratings'
import type { Rng } from './rng'

/**
 * Turns "Danny Quick bowls 9, prefers the new ball" into an actual over-by-over
 * rota, honouring the one rule that makes bowling plans interesting: nobody
 * bowls two overs in a row.
 */

/** How well a bowler's stated preference fits a given over (0-1). */
function prefFit(pref: SpellPref, over: number): number {
  const { overs, powerplayUntil, deathFrom } = RULES
  switch (pref) {
    case 'new-ball':
      // Strongest at over 1, gone by the end of the powerplay + a couple.
      return clamp(1 - (over - 1) / (powerplayUntil + 3), 0.02, 1)
    case 'death':
      // Ramps in over the last third, peaks at the final over.
      return clamp((over - (deathFrom - 9)) / (overs - (deathFrom - 9)), 0.02, 1)
    case 'middle': {
      // Bell centred between the powerplay and the death.
      const centre = (powerplayUntil + deathFrom) / 2
      const width = (deathFrom - powerplayUntil) / 2 + 3
      return clamp(1 - Math.abs(over - centre) / width, 0.02, 1)
    }
  }
}

export interface PlanProblem {
  code: 'total' | 'per-bowler' | 'too-few' | 'too-many' | 'not-a-bowler' | 'zero-overs'
  message: string
}

export function validatePlan(plan: BowlingPlan, xi: Player[]): PlanProblem[] {
  const problems: PlanProblem[] = []
  const used = plan.filter((a) => a.overs > 0)
  const total = used.reduce((s, a) => s + a.overs, 0)

  if (total !== RULES.overs) {
    problems.push({
      code: 'total',
      message: `Overs must total ${RULES.overs} — currently ${total}.`,
    })
  }
  if (used.length < RULES.minBowlers) {
    problems.push({
      code: 'too-few',
      message: `Need at least ${RULES.minBowlers} bowlers — you have ${used.length}.`,
    })
  }
  if (used.length > RULES.maxBowlers) {
    problems.push({
      code: 'too-many',
      message: `No more than ${RULES.maxBowlers} bowlers — you have ${used.length}.`,
    })
  }
  for (const a of used) {
    const p = xi.find((x) => x.id === a.playerId)
    if (!p) {
      problems.push({ code: 'not-a-bowler', message: `${a.playerId} is not in the XI.` })
      continue
    }
    if (a.overs > RULES.maxOversPerBowler) {
      problems.push({
        code: 'per-bowler',
        message: `${p.name} has ${a.overs} overs — the cap is ${RULES.maxOversPerBowler}.`,
      })
    }
    if (p.bowl.def <= 0 || p.bowl.att <= 0) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} doesn't bowl.` })
    }
  }
  return problems
}

/**
 * Can the overs still owed be dealt out across `slots` remaining overs without
 * anyone bowling twice in a row, given `prev` just bowled?
 *
 * `prev` is locked out of the next slot, so he can only have the even-numbered
 * ones — at most floor(slots/2). Everyone else can take the odd ones too, so at
 * most ceil(slots/2). If nobody exceeds their share, a valid ordering exists.
 */
function feasible(remaining: Map<string, number>, slots: number, prev: string | null): boolean {
  const capPrev = Math.floor(slots / 2)
  const capOther = Math.ceil(slots / 2)
  let total = 0
  for (const [id, left] of remaining) {
    if (left <= 0) continue
    if (left > (id === prev ? capPrev : capOther)) return false
    total += left
  }
  return total === slots
}

/**
 * Fill the rota over by over, picking the best-fitting bowler whose selection
 * still leaves a legal schedule for everyone else. Preference decides who
 * bowls when; the feasibility guard stops a spell preference from painting the
 * last few overs into a corner.
 */
export function buildRota(plan: BowlingPlan, rng: Rng): Rota {
  const remaining = new Map<string, number>()
  const pref = new Map<string, SpellPref>()
  for (const a of plan) {
    if (a.overs <= 0) continue
    remaining.set(a.playerId, a.overs)
    pref.set(a.playerId, a.pref)
  }

  const totalOvers = [...remaining.values()].reduce((s, n) => s + n, 0)
  const rota: Rota = []
  let previous: string | null = null

  for (let over = 1; over <= totalOvers; over++) {
    const slotsAfter = totalOvers - over
    let best: string | null = null
    let bestScore = -Infinity
    let fallback: string | null = null

    for (const [id, left] of remaining) {
      if (left <= 0) continue
      if (id === previous) continue
      if (fallback === null) fallback = id

      remaining.set(id, left - 1)
      const ok = feasible(remaining, slotsAfter, id)
      remaining.set(id, left)
      if (!ok) continue

      const score =
        prefFit(pref.get(id)!, over) * 0.55 +
        (left / Math.max(slotsAfter + 1, 1)) * 0.45 +
        rng() * 0.06
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }

    // Nothing keeps the schedule perfectly legal — take any eligible bowler
    // rather than leaving the rota short. Unreachable for a plan that passes
    // validatePlan, but a rota must always be complete.
    if (best === null) best = fallback
    if (best === null) break

    rota.push(best)
    remaining.set(best, remaining.get(best)! - 1)
    previous = best
  }

  return rota
}

/**
 * A sensible default plan: best bowlers get the most overs, quicks take the new
 * ball, spinners squeeze the middle, and the highest-ATT bowler is held back
 * for the death.
 */
export function autoPlan(xi: Player[]): BowlingPlan {
  const bowlers = xi
    .filter((p) => p.bowl.def > 0 && p.bowl.att > 0)
    .sort((a, b) => (b.bowl.def + b.bowl.att) - (a.bowl.def + a.bowl.att))
    .slice(0, RULES.maxBowlers)

  if (bowlers.length === 0) return []

  const count = Math.min(bowlers.length, Math.max(RULES.minBowlers, 5))
  const chosen = bowlers.slice(0, count)

  // Hand out the cap to the best until the overs run out.
  const alloc = chosen.map((p) => ({ player: p, overs: 0 }))
  let left = RULES.overs
  while (left > 0) {
    let placed = false
    for (const a of alloc) {
      if (left <= 0) break
      if (a.overs >= RULES.maxOversPerBowler) continue
      a.overs++
      left--
      placed = true
    }
    if (!placed) break
  }

  // Death overs go to whoever takes wickets; the new ball to the quicks.
  const byAtt = [...alloc].sort((a, b) => b.player.bowl.att - a.player.bowl.att)
  const deathIds = new Set(byAtt.slice(0, 2).map((a) => a.player.id))

  return alloc.map((a) => {
    let pref: SpellPref
    if (deathIds.has(a.player.id)) pref = 'death'
    else if (a.player.bowlType === 'spin') pref = 'middle'
    else pref = 'new-ball'
    return { playerId: a.player.id, overs: a.overs, pref }
  })
}
