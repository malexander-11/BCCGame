import { BLOCK_CAP, BLOCK_COUNT, BLOCK_OVERS, blockOvers, blockRange, RULES } from '../data/types'
import type { BlockPlan, BowlingPlan, Player, Rota } from '../data/types'
import { availableBowlers, isBowler, keeperOf } from './ratings'
import { makeRng } from './rng'
import type { Rng } from './rng'

/**
 * Turns "Archie and Derek take the new ball, five and four" into an actual
 * over-by-over rota, nine overs at a time.
 *
 * Two rules shape everything here.
 *
 * **Counts are exact.** A bowler down for five of the next nine bowls five,
 * never four and never six. An early version of this screen asked for a
 * *preference* instead, which the rota could only treat as a hint — a bowler
 * held for the new ball ended up bowling a quarter of his overs elsewhere and
 * nothing ever said so.
 *
 * **Bowlers work in tandem.** Ends change every over, so two bowlers operate
 * together and each bowls every other one. Picking whoever bowled two overs ago
 * keeps a man going from his end for a proper spell rather than rotating five
 * bowlers one over at a time — which is both what actually happens and what
 * stops the plan reading as thirty separate one-over spells.
 */

export interface PlanProblem {
  code: 'count' | 'per-bowler' | 'per-block' | 'too-few' | 'back-to-back' | 'not-a-bowler'
  message: string
}

/** How many overs each bowler has already bowled, from the blocks behind us. */
export function oversBowled(plan: BowlingPlan, upTo: number): Map<string, number> {
  const used = new Map<string, number>()
  for (let i = 0; i < upTo && i < plan.length; i++) {
    for (const a of plan[i] ?? []) {
      used.set(a.playerId, (used.get(a.playerId) ?? 0) + a.overs)
    }
  }
  return used
}

/** What's left in a bowler's nine-over allowance. */
export const oversLeft = (used: Map<string, number>, id: string) =>
  RULES.maxOversPerBowler - (used.get(id) ?? 0)

/**
 * How many overs a block actually holds. Every block is nine, which is why
 * forty-five divides so neatly, but this keeps the arithmetic in one place.
 */
export const blockSize = (block: number) => {
  const { from, to } = blockRange(block)
  return to - from + 1
}

/**
 * Is this block legal, given what's gone before?
 *
 * `previous` is whoever bowled the last over of the block behind — he can't open
 * this one, because that would be two in a row across the join.
 */
export function validateBlock(
  block: number, plan: BlockPlan, xi: Player[], used: Map<string, number>, previous: string | null,
): PlanProblem[] {
  const problems: PlanProblem[] = []
  const live = plan.filter((a) => a.overs > 0)
  const want = blockSize(block)
  const got = blockOvers(live)

  if (got !== want) {
    problems.push({
      code: 'count',
      message: got < want
        ? `${want - got} more over${want - got === 1 ? '' : 's'} to give out.`
        : `${got - want} over${got - want === 1 ? '' : 's'} too many.`,
    })
  }

  const keeper = keeperOf(xi)
  for (const a of live) {
    const p = xi.find((x) => x.id === a.playerId)
    if (!p) {
      problems.push({ code: 'not-a-bowler', message: `${a.playerId} is not in the XI.` })
      continue
    }
    if (a.overs > BLOCK_CAP) {
      problems.push({
        code: 'per-block',
        message: `${p.name} can't bowl ${a.overs} of nine — he'd have to bowl two in a row. Most is ${BLOCK_CAP}.`,
      })
    }
    const left = oversLeft(used, p.id)
    if (a.overs > left) {
      problems.push({
        code: 'per-bowler',
        message: left <= 0
          ? `${p.name} has bowled his nine.`
          : `${p.name} has only ${left} over${left === 1 ? '' : 's'} left.`,
      })
    }
    if (!isBowler(p)) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} doesn't bowl.` })
    } else if (p.id === keeper?.id) {
      problems.push({ code: 'not-a-bowler', message: `${p.name} is keeping wicket.` })
    }
  }

  // One man can't bowl a whole block on his own, and if the man who just
  // finished is the only one down for overs, the join is impossible.
  if (live.length === 1 && want > 1) {
    problems.push({ code: 'too-few', message: 'Two bowlers minimum — ends change every over.' })
  } else if (previous !== null && live.length > 0 && live.every((a) => a.playerId === previous)) {
    problems.push({
      code: 'back-to-back',
      message: 'He bowled the last over — somebody else has to take the first of these.',
    })
  }

  // ...and even with two, the man who just bowled can't have more than half.
  if (previous !== null && got === want) {
    const his = live.find((a) => a.playerId === previous)?.overs ?? 0
    if (his > Math.floor(want / 2)) {
      problems.push({
        code: 'back-to-back',
        message: `${xi.find((x) => x.id === previous)?.name ?? 'He'} bowled the last over, so he can have at most ${Math.floor(want / 2)} of these.`,
      })
    }
  }

  // Leaving yourself unable to finish the innings is a real trap: five bowlers
  // at nine each is exactly forty-five, so wasting an allowance strands you.
  const after = new Map(used)
  for (const a of live) after.set(a.playerId, (after.get(a.playerId) ?? 0) + a.overs)
  const remaining = RULES.overs - Math.min(RULES.overs, (block + 1) * BLOCK_OVERS)
  if (got === want && remaining > 0) {
    const capacity = availableBowlers(xi).reduce((s, p) => s + Math.max(0, oversLeft(after, p.id)), 0)
    if (capacity < remaining) {
      problems.push({
        code: 'too-few',
        message: `That leaves only ${capacity} overs of bowling for the last ${remaining}. Spread them wider.`,
      })
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

/**
 * Deal one block's overs into an order.
 *
 * `previous` and `beforeThat` carry across the block boundary, so a bowler can't
 * finish one block and start the next, and a man mid-spell keeps his end.
 */
export function buildBlockRota(
  block: number, plan: BlockPlan, previous: string | null, beforeThat: string | null, rng: Rng,
): Rota {
  const rota: Rota = []
  const remaining = new Map<string, number>()
  for (const a of plan) if (a.overs > 0) remaining.set(a.playerId, a.overs)
  const slots = blockSize(block)

  let prev = previous
  let before = beforeThat

  for (let i = 0; i < slots; i++) {
    const slotsAfter = slots - i - 1
    const eligible: string[] = []
    for (const [id, left] of remaining) {
      if (left <= 0 || id === prev) continue
      remaining.set(id, left - 1)
      const ok = feasible(remaining, slotsAfter, id)
      remaining.set(id, left)
      if (ok) eligible.push(id)
    }

    let pick: string | null = null
    // Keep the man already bowling from this end going. This one preference is
    // what turns the rota into spells instead of a five-way rotation.
    if (before !== null && eligible.includes(before)) {
      pick = before
    } else if (eligible.length > 0) {
      // Otherwise start whoever has most left, so nobody is stranded.
      pick = eligible.reduce((a, b) => {
        const la = remaining.get(a)!, lb = remaining.get(b)!
        if (la !== lb) return la > lb ? a : b
        return rng() < 0.5 ? a : b
      })
    } else {
      // Only reachable from a block that never validated; a rota must still be
      // complete, so take anyone who isn't bowling right now.
      pick = [...remaining.entries()].find(([id, n]) => n > 0 && id !== prev)?.[0]
        ?? [...remaining.keys()][0]
        ?? null
    }
    if (pick === null) break

    rota.push(pick)
    remaining.set(pick, (remaining.get(pick) ?? 0) - 1)
    before = prev
    prev = pick
  }

  return rota
}

/**
 * Each block gets its own RNG stream, derived from the match seed.
 *
 * That is what makes the in-play decisions honest. Block 1's rota is a pure
 * function of block 1's plan and the seed, so changing your mind at the
 * nine-over break cannot reach backwards and re-deal the overs you have already
 * watched. Share one stream across the innings and every later decision would
 * silently rewrite the beginning.
 */
export const blockRng = (seed: number, block: number) =>
  makeRng((seed ^ (0x9e3779b9 * (block + 1))) >>> 0)

/**
 * The whole innings' rota. Blocks nobody has called are filled by `fallback` —
 * the auto captain — reading the state each block starts in.
 */
export function buildRota(
  plan: BowlingPlan, seed: number,
  fallback: (block: number, used: Map<string, number>, previous: string | null) => BlockPlan,
): Rota {
  const rota: Rota = []
  let previous: string | null = null
  let beforeThat: string | null = null
  const used = new Map<string, number>()

  for (let block = 0; block < BLOCK_COUNT; block++) {
    const called = plan[block]
    const chosen = called && blockOvers(called) === blockSize(block)
      ? called
      : fallback(block, used, previous)

    const part = buildBlockRota(block, chosen, previous, beforeThat, blockRng(seed, block))
    for (const id of part) used.set(id, (used.get(id) ?? 0) + 1)
    rota.push(...part)
    previous = part[part.length - 1] ?? previous
    beforeThat = part[part.length - 2] ?? beforeThat
  }

  return rota
}
