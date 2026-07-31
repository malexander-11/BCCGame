/**
 * Seeded PRNG. Every match is a pure function of its seed, so a scorecard can
 * be reproduced or shared just by passing the number around.
 *
 * SplitMix-style integer hash — cheap, and good enough for a cricket sim.
 */
export type Rng = () => number

export function makeRng(seed: number): Rng {
  let s = seed | 0
  return () => {
    s = (s + 1831565813) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform in [lo, hi). */
export function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

/** Integer in [0, n). */
export function pickIndex(rng: Rng, n: number): number {
  return Math.floor(rng() * n)
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[pickIndex(rng, arr.length)]
}

/** Weighted choice over [value, weight] pairs. Weights need not sum to 1. */
export function weighted<T>(rng: Rng, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of table) {
    r -= w
    if (r < 0) return v
  }
  return table[table.length - 1][0]
}

/** Stable 32-bit hash of a string — used to give each club a fixed XI. */
export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0
}
