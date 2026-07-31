import { allocatedOvers, RULES, windowCap, WINDOWS, windowSize } from '../data/types'
import type { BowlingPlan, Player, Rota, Window } from '../data/types'
import { availableBowlers, isBowler, keeperOf } from './ratings'
import type { Rng } from './rng'

/**
 * Turns "Archie bowls five of the first nine and four at the death" into an
 * actual over-by-over rota.
 *
 * Two rules shape everything here.
 *
 * **Counts are exact.** A bowler down for five powerplay overs bowls five overs
 * inside overs 1-9, never four and never six. The very first version of this
 * screen asked for a *preference* instead, which the rota could only treat as a
 * hint — a bowler held for the new ball ended up bowling a quarter of his overs
 * in the middle and nothing ever said so.
 *
 * **Bowlers work in tandem.** Ends change every over, so two bowlers operate
 * together and each bowls every other one. Picking whoever bowled two overs ago
 * keeps a man going from his end for a proper spell rather than rotating five
 * bowlers one over at a time — which is both what actually happens and what
 * stops the plan reading as thirty separate one-over spells.
 */

export interface PlanProblem {
  code: 'window' | 'per-bowler' | 'per-window' | 'too-few' | 'too-many' | 'not-a-bowler'
  message: string
}

export function validatePlan(plan: BowlingPlan, xi: Player[]): PlanProblem[] {
  const problems: PlanProblem[] = []
  const used = plan.filter((a) => allocatedOvers(a) > 0)

  // Each window has to be filled exactly — someone has to bowl every over.
  for (const w of WINDOWS) {
    const got = used.reduce((s, a) => s + a.overs[w.key], 0)
    const want = windowSize(w.key)
    if (got !== want) {
      problems.push({
        code: 'window',
        message: got < want
          ? `${w.label}: ${want - got} more over${want - got === 1 ? '' : 's'} to give out.`
          : `${w.label}: ${got - want} over${got - want === 1 ? '' : 's'} too many.`,
      })
    }
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

  const keeper = keeperOf(xi)
  for (const a of used) {
    const p = xi.find((x) => x.id === a.playerId)
    if (!p) {
      problems.push({ code: 'not-a-bowler', message: `${a.playerId} is not in the XI.` })
      continue
    }
    const total = allocatedOvers(a)
    if (total > RULES.maxOversPerBowler) {
      problems.push({
        code: 'per-bowler',
        message: `${p.name} has ${total} overs — the cap is ${RULES.maxOversPerBowler}.`,
      })
    }
    for (const w of WINDOWS) {
      const cap = windowCap(w.key)
      if (a.overs[w.key] > cap) {
        problems.push({
          code: 'per-window',
          message: `${p.name} can't bowl ${a.overs[w.key]} of the ${w.label.toLowerCase()} overs — he'd have to bowl two in a row. Most is ${cap}.`,
        })
      }
    }
    if (!isBowler(p)) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} doesn't bowl.` })
    } else if (p.id === keeper?.id) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} is keeping wicket.` })
    }
  }
  return problems
}

/**
 * Can the overs still owed be dealt across `slots` remaining overs without
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

export function buildRota(plan: BowlingPlan, rng: Rng): Rota {
  const rota: Rota = []
  // Carried across the window boundary so a bowler can't finish the powerplay
  // and start the middle overs back to back.
  let previous: string | null = null
  let beforeThat: string | null = null

  for (const w of WINDOWS) {
    const remaining = new Map<string, number>()
    for (const a of plan) {
      if (a.overs[w.key] > 0) remaining.set(a.playerId, a.overs[w.key])
    }
    const slots = windowSize(w.key)

    for (let i = 0; i < slots; i++) {
      const slotsAfter = slots - i - 1
      const eligible: string[] = []
      for (const [id, left] of remaining) {
        if (left <= 0 || id === previous) continue
        remaining.set(id, left - 1)
        const ok = feasible(remaining, slotsAfter, id)
        remaining.set(id, left)
        if (ok) eligible.push(id)
      }

      let pick: string | null = null
      // Keep the man already bowling from this end going. This one preference
      // is what turns the rota into spells instead of a five-way rotation.
      if (beforeThat !== null && eligible.includes(beforeThat)) {
        pick = beforeThat
      } else if (eligible.length > 0) {
        // Otherwise start whoever has most left, so nobody is stranded.
        pick = eligible.reduce((a, b) => {
          const la = remaining.get(a)!, lb = remaining.get(b)!
          if (la !== lb) return la > lb ? a : b
          return rng() < 0.5 ? a : b
        })
      } else {
        // Only reachable from a plan that never validated; a rota must still
        // be complete, so take anyone who isn't bowling right now.
        pick = [...remaining.entries()].find(([id, n]) => n > 0 && id !== previous)?.[0]
          ?? [...remaining.keys()][0]
          ?? null
      }
      if (pick === null) break

      rota.push(pick)
      remaining.set(pick, (remaining.get(pick) ?? 0) - 1)
      beforeThat = previous
      previous = pick
    }
  }

  return rota
}

/**
 * A sensible default: swing bowlers take the new ball, spinners the middle,
 * and whoever takes wickets is kept back for the death.
 */
export function autoPlan(xi: Player[]): BowlingPlan {
  const bowlers = availableBowlers(xi)
    .sort((a, b) => (b.bowl.def + b.bowl.att) - (a.bowl.def + a.bowl.att))
    .slice(0, RULES.maxBowlers)
  if (bowlers.length === 0) return []

  const chosen = bowlers.slice(0, Math.min(bowlers.length, Math.max(RULES.minBowlers, 5)))
  const alloc = new Map(chosen.map((p) => [p.id, { newBall: 0, middle: 0, death: 0 }]))
  const totalFor = (id: string) => {
    const o = alloc.get(id)!
    return o.newBall + o.middle + o.death
  }

  /** How badly this bowler wants an over in this window. */
  const want = (p: Player, w: Window): number => {
    const swings = (p.swing ?? 0) >= 50
    const spin = p.bowlType === 'spin'
    if (w === 'newBall') return swings ? 1.0 : spin ? 0.10 : 0.60
    if (w === 'death') return spin ? 0.15 : 0.45 + (p.bowl.att / 100) * 0.5
    return spin ? 1.0 : 0.5
  }

  // Fill the *scarce* windows first.
  //
  // The new ball and the death are nine and ten overs with a five-over ceiling
  // apiece, so they need specific people. The middle is twenty-six overs and
  // takes anyone. Filling in innings order instead lets the middle swallow
  // everybody's nine-over allowance and leaves nobody able to bowl at the
  // death — which is exactly what it did.
  const order: Window[] = ['death', 'newBall', 'middle']
  for (const key of order) {
    let left = windowSize(key)
    const cap = windowCap(key)
    const queue = [...chosen].sort((a, b) => want(b, key) - want(a, key))
    for (const p of queue) {
      if (left <= 0) break
      const o = alloc.get(p.id)!
      const room = Math.min(cap - o[key], RULES.maxOversPerBowler - totalFor(p.id), left)
      if (room <= 0) continue
      o[key] += room
      left -= room
    }
  }

  return [...alloc.entries()]
    .filter(([id]) => totalFor(id) > 0)
    .map(([playerId, overs]) => ({ playerId, overs }))
}
