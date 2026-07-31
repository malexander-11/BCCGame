import { allocatedOvers, RULES, spellEnd, spellOvers } from '../data/types'
import type { BowlingPlan, Player, Rota, Spell } from '../data/types'
import { availableBowlers, isBowler, keeperOf } from './ratings'
import type { Rng } from './rng'

/**
 * Turns "Archie bowls six from over one, then three from thirty-four" into an
 * actual over-by-over rota.
 *
 * The old model scored each bowler's *fit* for every over against a phase
 * preference, which meant preferences were only ever suggestions — a bowler
 * held for the new ball still bowled a quarter of his overs in the middle
 * because there wasn't room for them anywhere else, and nothing said so.
 *
 * Spells are placed literally instead. You said over 34, he comes on at over
 * 34. The only thing that can move him is another bowler already standing in
 * that slot, and the plan screen shows you the result before you commit.
 */

export interface PlanProblem {
  code: 'total' | 'per-bowler' | 'too-few' | 'too-many' | 'not-a-bowler' | 'no-spell' | 'overlap'
  message: string
}

export function validatePlan(plan: BowlingPlan, xi: Player[]): PlanProblem[] {
  const problems: PlanProblem[] = []
  const used = plan.filter((a) => allocatedOvers(a) > 0)
  const total = used.reduce((s, a) => s + allocatedOvers(a), 0)

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

  const keeper = keeperOf(xi)
  for (const a of used) {
    const p = xi.find((x) => x.id === a.playerId)
    if (!p) {
      problems.push({ code: 'not-a-bowler', message: `${a.playerId} is not in the XI.` })
      continue
    }
    const overs = allocatedOvers(a)
    if (overs > RULES.maxOversPerBowler) {
      problems.push({
        code: 'per-bowler',
        message: `${p.name} has ${overs} overs — the cap is ${RULES.maxOversPerBowler}.`,
      })
    }
    if (!isBowler(p)) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} doesn't bowl.` })
    } else if (p.id === keeper?.id) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} is keeping wicket.` })
    }
    if (a.spells.length === 0) {
      problems.push({ code: 'no-spell', message: `${p.name} has no spell — say when he bowls.` })
    }
    // A spell that would run past the innings can't be bowled as written.
    for (const s of a.spells) {
      if (spellEnd(s) > RULES.overs) {
        problems.push({
          code: 'overlap',
          message: `${p.name}'s spell from over ${s.from} runs past over ${RULES.overs}.`,
        })
      }
    }
    // Check the actual overs, not the spans. Two spells can sit inside each
    // other's span quite happily (overs 1,3,5 and 2,4,6 never collide) — what
    // matters is whether this bowler ends up down for the same over twice, or
    // for two in a row, which he can't bowl.
    const list = spellOvers(a)
    for (let i = 1; i < list.length; i++) {
      if (list[i] === list[i - 1]) {
        problems.push({
          code: 'overlap',
          message: `${p.name} is down to bowl over ${list[i]} twice.`,
        })
        break
      }
      if (list[i] === list[i - 1] + 1) {
        problems.push({
          code: 'overlap',
          message: `${p.name} would bowl overs ${list[i - 1]} and ${list[i]} back to back — he can't bowl consecutive overs.`,
        })
        break
      }
    }
  }
  return problems
}

/**
 * Lay the spells onto the over-by-over rota.
 *
 * Each spell claims every other over from its start. Where two bowlers want the
 * same over the earlier-starting spell keeps it and the other slides on to the
 * next free one, so a plan can never be silently dropped. Anything still owed
 * at the end is filled into whatever's left, respecting the one rule that
 * always holds: nobody bowls two overs in a row.
 */
export function buildRota(plan: BowlingPlan, rng: Rng): Rota {
  /** What you asked for. An over two bowlers both want goes to the earlier spell. */
  const wanted = new Map<number, string>()
  const remaining = new Map<string, number>()

  const spells: { id: string; spell: Spell }[] = []
  for (const a of plan) {
    const total = allocatedOvers(a)
    if (total <= 0) continue
    remaining.set(a.playerId, total)
    for (const s of a.spells) if (s.overs > 0) spells.push({ id: a.playerId, spell: s })
  }
  spells.sort((x, y) => x.spell.from - y.spell.from)
  for (const { id, spell } of spells) {
    for (let i = 0; i < spell.overs; i++) {
      const over = spell.from + i * 2
      if (over >= 1 && over <= RULES.overs && !wanted.has(over)) wanted.set(over, id)
    }
  }

  const totalOvers = [...remaining.values()].reduce((s, n) => s + n, 0)
  const rota: Rota = []
  let previous: string | null = null

  for (let over = 1; over <= totalOvers; over++) {
    const slotsAfter = totalOvers - over
    const eligible: string[] = []
    let fallback: string | null = null

    for (const [id, left] of remaining) {
      if (left <= 0) continue
      if (id === previous) continue
      if (fallback === null) fallback = id
      // Would taking this over strand somebody else? The guard below is what
      // makes the rota legal by construction rather than by luck.
      remaining.set(id, left - 1)
      const ok = feasible(remaining, slotsAfter, id)
      remaining.set(id, left)
      if (ok) eligible.push(id)
    }

    // Give the over to whoever you asked for, if he can legally have it.
    const asked = wanted.get(over)
    let best = asked !== undefined && eligible.includes(asked) ? asked : null

    if (best === null && eligible.length > 0) {
      // Nobody you asked for — take whoever is furthest behind, so a bowler
      // whose spell got squeezed still gets his overs in.
      best = eligible.reduce((a, b) => {
        const la = remaining.get(a)!, lb = remaining.get(b)!
        if (la !== lb) return la > lb ? a : b
        return rng() < 0.5 ? a : b
      })
    }
    if (best === null) best = fallback
    if (best === null) break

    rota.push(best)
    remaining.set(best, remaining.get(best)! - 1)
    previous = best
  }

  return rota
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
 * A sensible default plan.
 *
 * Swing bowlers open — that edge is gone by the thirteenth over, so holding one
 * back wastes him. Spinners take the middle, where they're worth most and where
 * a seamer leaks. Whoever takes wickets is kept back for the death.
 */
export function autoPlan(xi: Player[]): BowlingPlan {
  const bowlers = availableBowlers(xi)
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

  /** How much this bowler wants a given over. */
  const suits = (p: Player, over: number): number => {
    const swings = (p.swing ?? 0) >= 50
    const spin = p.bowlType === 'spin'
    if (over <= RULES.powerplayUntil) return swings ? 1.0 : spin ? 0.10 : 0.62
    if (over >= RULES.deathFrom) return spin ? 0.15 : 0.45 + (p.bowl.att / 100) * 0.5
    return spin ? 1.0 : 0.5
  }

  // Deal the overs out first, then read the spells back off the result.
  //
  // Going the other way — picking spells and hoping they tile — fragments: five
  // bowlers taking every other over cannot cover forty-five without someone
  // being left overs he has nowhere legal to bowl. Dealing first makes a legal,
  // complete, collision-free assignment by construction, and the spells are
  // simply a description of it.
  const remaining = new Map(alloc.filter((a) => a.overs > 0).map((a) => [a.player.id, a.overs]))
  const byId = new Map(alloc.map((a) => [a.player.id, a.player]))
  const assignment: string[] = []
  let previous: string | null = null

  for (let over = 1; over <= RULES.overs; over++) {
    const slotsAfter = RULES.overs - over
    let best: string | null = null
    let bestScore = -Infinity
    for (const [id, leftOvers] of remaining) {
      if (leftOvers <= 0 || id === previous) continue
      remaining.set(id, leftOvers - 1)
      const ok = feasible(remaining, slotsAfter, id)
      remaining.set(id, leftOvers)
      if (!ok) continue
      // Suitability decides, with a nudge toward whoever is furthest behind so
      // nobody is left with a pile of overs and nowhere to bowl them.
      const score = suits(byId.get(id)!, over) + (leftOvers / RULES.maxOversPerBowler) * 0.25
      if (score > bestScore) { bestScore = score; best = id }
    }
    if (best === null) break
    assignment.push(best)
    remaining.set(best, remaining.get(best)! - 1)
    previous = best
  }

  // Group each bowler's overs into runs of every-other-over — his spells.
  const out: BowlingPlan = []
  for (const a of alloc) {
    const overs = assignment
      .map((id, i) => (id === a.player.id ? i + 1 : 0))
      .filter((n) => n > 0)
    if (overs.length === 0) continue
    const spells: Spell[] = []
    let start = overs[0]
    let count = 1
    for (let i = 1; i < overs.length; i++) {
      if (overs[i] === overs[i - 1] + 2) { count++; continue }
      spells.push({ from: start, overs: count })
      start = overs[i]
      count = 1
    }
    spells.push({ from: start, overs: count })
    out.push({ playerId: a.player.id, spells })
  }
  return out
}
