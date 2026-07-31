/**
 * Calibration harness.
 *
 * The engine is easy to get wrong in a way that still looks plausible ball by
 * ball — a village side posting 400, or nobody ever being bowled out. This runs
 * a few thousand headless matches and asserts the aggregate numbers look like
 * 45-over Surrey Championship cricket.
 *
 *   npm run bench
 *   npm run bench -- --matches 5000
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = join(root, '.bench')

mkdirSync(outdir, { recursive: true })
await build({
  entryPoints: [join(root, 'scripts/bench-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(outdir, 'engine.mjs'),
  logLevel: 'warning',
})

const {
  BAGSHOT_SQUAD, OPPOSITION, RULES,
  simulateMatch, autoPlan, autoBattingOrder, buildRota, validatePlan,
} = await import(join(outdir, 'engine.mjs'))

const argMatches = process.argv.indexOf('--matches')
const MATCHES = argMatches > -1 ? Number(process.argv[argMatches + 1]) : 2000

const XI = autoBattingOrder(BAGSHOT_SQUAD).slice(0, 11)

// ------------------------------------------------------------------ helpers

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)

let failures = 0
const check = (label, value, lo, hi, fmt = (v) => v.toFixed(1)) => {
  const ok = value >= lo && value <= hi
  if (!ok) failures++
  console.log(
    `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ` +
    `${label.padEnd(34)} ${fmt(value).toString().padStart(8)}   ` +
    `\x1b[90mexpect ${fmt(lo)}–${fmt(hi)}\x1b[0m`,
  )
}

// ----------------------------------------------------------------- run them

console.log(`\n\x1b[1mBagshot CC engine calibration\x1b[0m — ${MATCHES} matches, ${RULES.overs} overs\n`)

const firstTotals = []
const secondTotals = []
const firstWkts = []
const firstExtras = []
const firstRR = []
const outcomes = { win: 0, loss: 0, tie: 0 }
const allOut = []
let motmMissing = 0

// Even-strength opponents only, so the win rate is a fair coin test.
const evenOpponents = OPPOSITION.filter((c) => c.strength >= 0.97 && c.strength <= 1.03)

for (let i = 0; i < MATCHES; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const m = simulateMatch(opp, XI, i * 7919 + 13)

  firstTotals.push(m.first.runs)
  secondTotals.push(m.second.runs)
  firstWkts.push(m.first.wickets)
  firstExtras.push(m.first.extras.total)
  firstRR.push(m.first.runRate)
  allOut.push(m.first.allOut ? 1 : 0)
  outcomes[m.outcome]++
  if (!m.motm.name || m.motm.name === '—') motmMissing++
}

console.log('\x1b[1mFirst innings (opposition batting vs your plan)\x1b[0m')
check('median total', pct(firstTotals, 50), 190, 240, (v) => Math.round(v))
check('10th percentile', pct(firstTotals, 10), 110, 175, (v) => Math.round(v))
check('90th percentile', pct(firstTotals, 90), 250, 320, (v) => Math.round(v))
check('mean run rate', mean(firstRR), 4.2, 5.6, (v) => v.toFixed(2))
check('mean wickets lost', mean(firstWkts), 5.5, 8.5, (v) => v.toFixed(2))
check('all-out rate %', mean(allOut) * 100, 25, 45, (v) => v.toFixed(1))
check('mean extras', mean(firstExtras), 8, 20, (v) => v.toFixed(1))

console.log('\n\x1b[1mMatch outcomes\x1b[0m')

// A club playing *itself* is the only clean test of engine neutrality: any
// departure from 50% is the engine favouring one innings, not one squad.
let mirrorWins = 0
let mirrorTies = 0
const mirrorN = Math.max(600, Math.floor(MATCHES / 2))
for (let i = 0; i < mirrorN; i++) {
  const club = evenOpponents[i % evenOpponents.length]
  const m = simulateMatch(club, club.xi, i * 31337 + 5)
  if (m.outcome === 'win') mirrorWins++
  if (m.outcome === 'tie') mirrorTies++
}
// Chasing genuinely is easier — you know the number, so you can pace it. Real
// limited-overs cricket runs ~52-56% to the side batting second. This guards
// against runaway bias, not against a coin flip.
const mirrorRate = (mirrorWins / mirrorN) * 100
check('mirror match — chasing win %', mirrorRate, 46, 58, (v) => v.toFixed(1))
console.log(`  \x1b[90m${mirrorN} matches of a side against itself · ${mirrorTies} tied\x1b[0m`)

const winRate = (outcomes.win / MATCHES) * 100
console.log(
  `  \x1b[90mplaceholder Bagshot XI vs par opposition: ${winRate.toFixed(1)}% ` +
  `(W ${outcomes.win} · L ${outcomes.loss} · T ${outcomes.tie}) — ` +
  `informational, the shipped squad is stronger than par\x1b[0m`,
)
check('MotM always chosen', motmMissing, 0, 0, (v) => v)

// ------------------------------------------------- ratings must matter

console.log('\n\x1b[1mMonotonicity — better ratings must win more\x1b[0m')

const shift = (squad, d) => squad.map((p) => ({
  ...p,
  bat: { skill: Math.max(5, p.bat.skill + d), pwr: Math.max(5, p.bat.pwr + d) },
  bowl: {
    def: p.bowl.def > 0 ? Math.max(5, p.bowl.def + d) : 0,
    att: p.bowl.att > 0 ? Math.max(5, p.bowl.att + d) : 0,
  },
}))

const winRateFor = (squad) => {
  const xi = autoBattingOrder(squad).slice(0, 11)
  let w = 0
  const n = Math.max(400, Math.floor(MATCHES / 2))
  for (let i = 0; i < n; i++) {
    const opp = evenOpponents[i % evenOpponents.length]
    if (simulateMatch(opp, xi, i * 7919 + 13).outcome === 'win') w++
  }
  return (w / n) * 100
}

const weak = winRateFor(shift(BAGSHOT_SQUAD, -12))
const base = winRateFor(BAGSHOT_SQUAD)
const strong = winRateFor(shift(BAGSHOT_SQUAD, +12))
console.log(`  \x1b[90m-12 ratings: ${weak.toFixed(1)}%   base: ${base.toFixed(1)}%   +12: ${strong.toFixed(1)}%\x1b[0m`)
check('weaker squad wins less', base - weak, 8, 100, (v) => v.toFixed(1))
check('stronger squad wins more', strong - base, 8, 100, (v) => v.toFixed(1))

// ------------------------------------------------------- structural rules

console.log('\n\x1b[1mStructural integrity\x1b[0m')

let rotaViolations = 0
let capViolations = 0
let tooFewBowlers = 0
let ballsMismatch = 0
let runsMismatch = 0

for (let i = 0; i < 500; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const plan = autoPlan(XI)
  if (validatePlan(plan, XI).length > 0) capViolations++

  const rota = buildRota(plan, (() => { let s = i; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })())
  for (let o = 1; o < rota.length; o++) if (rota[o] === rota[o - 1]) rotaViolations++
  const counts = new Map()
  for (const id of rota) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of counts.values()) if (n > RULES.maxOversPerBowler) capViolations++
  if (counts.size < RULES.minBowlers) tooFewBowlers++

  const m = simulateMatch(opp, XI, i * 104729 + 7)
  for (const innings of [m.first, m.second]) {
    const bowled = innings.bowling.reduce((s, b) => s + b.balls, 0)
    if (bowled !== innings.balls) ballsMismatch++

    const offBat = innings.batting.reduce((s, b) => s + b.runs, 0)
    if (offBat + innings.extras.total !== innings.runs) runsMismatch++

    const wktsOnCard = innings.batting.filter((b) => b.out !== null).length
    if (wktsOnCard !== innings.wickets) runsMismatch++
  }
}

check('no consecutive overs', rotaViolations, 0, 0, (v) => v)
check('over cap respected', capViolations, 0, 0, (v) => v)
check('at least 5 bowlers used', tooFewBowlers, 0, 0, (v) => v)
check('balls reconcile', ballsMismatch, 0, 0, (v) => v)
check('runs & wickets reconcile', runsMismatch, 0, 0, (v) => v)

rmSync(outdir, { recursive: true, force: true })

console.log(
  failures === 0
    ? '\n\x1b[32m\x1b[1mAll checks passed.\x1b[0m\n'
    : `\n\x1b[31m\x1b[1m${failures} check(s) failed.\x1b[0m\n`,
)
process.exit(failures === 0 ? 0 : 1)
