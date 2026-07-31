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
  BAGSHOT_SQUAD, OPPOSITION, RULES, DIV6_WEST, BAGSHOT_REAL_POSITION,
  simulateMatch, simulateFieldingInnings, simulateBattingInnings, buildMatchResult,
  autoPlan, autoBattingOrder, autoSelectXI, buildRota, validatePlan,
  createSeason, nextFixture, recordRound, standings, seasonComplete,
  dlsPar, resources, swingBoost, SWING_WINDOW,
  initialAvailability, rollRound, availablePlayers, unavailableMap,
} = await import(join(outdir, 'engine.mjs'))

const argMatches = process.argv.indexOf('--matches')
const MATCHES = argMatches > -1 ? Number(process.argv[argMatches + 1]) : 2000

const BAGSHOT_XI = autoSelectXI(BAGSHOT_SQUAD)

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

// Aggregate totals are easy to hit with a distribution that's wrong in the
// detail — everyone making 20, or one batter making all of it. These watch the
// shape of individual innings.
let ducks = 0, twenties = 0, fifties = 0, hundreds = 0, topScores = 0, inningsCount = 0

// Calibration is measured par-against-par — two league-average clubs playing
// each other. Measuring it against Bagshot's own XI would move the goalposts
// every time somebody edits the squad.
const evenOpponents = OPPOSITION.filter((c) => c.strength >= 0.97 && c.strength <= 1.03)

for (let i = 0; i < MATCHES; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const other = evenOpponents[(i + 1) % evenOpponents.length]
  const m = simulateMatch(opp, other.xi, i * 7919 + 13)

  firstTotals.push(m.first.runs)
  secondTotals.push(m.second.runs)
  firstWkts.push(m.first.wickets)
  firstExtras.push(m.first.extras.total)
  firstRR.push(m.first.runRate)
  allOut.push(m.first.allOut ? 1 : 0)
  outcomes[m.outcome]++
  if (!m.motm.name || m.motm.name === '—') motmMissing++

  for (const innings of [m.first, m.second]) {
    const batted = innings.batting.filter((b) => b.batted && b.balls > 0)
    if (batted.length === 0) continue
    inningsCount++
    topScores += Math.max(...batted.map((b) => b.runs))
    for (const b of batted) {
      if (b.runs === 0 && b.out) ducks++
      if (b.runs >= 20) twenties++
      if (b.runs >= 50) fifties++
      if (b.runs >= 100) hundreds++
    }
  }
}

console.log('\x1b[1mFirst innings (par club batting, par club bowling)\x1b[0m')
check('median total', pct(firstTotals, 50), 190, 240, (v) => Math.round(v))
check('10th percentile', pct(firstTotals, 10), 110, 175, (v) => Math.round(v))
check('90th percentile', pct(firstTotals, 90), 250, 320, (v) => Math.round(v))
check('mean run rate', mean(firstRR), 4.2, 5.6, (v) => v.toFixed(2))
check('mean wickets lost', mean(firstWkts), 5.5, 8.5, (v) => v.toFixed(2))
check('all-out rate %', mean(allOut) * 100, 25, 45, (v) => v.toFixed(1))
check('mean extras', mean(firstExtras), 8, 20, (v) => v.toFixed(1))

console.log('\n\x1b[1mIndividual scores (both innings)\x1b[0m')
check('ducks per innings', ducks / inningsCount, 0.4, 2.6, (v) => v.toFixed(2))
check('20+ scores per innings', twenties / inningsCount, 2.5, 4.5, (v) => v.toFixed(2))
check('fifties per innings', fifties / inningsCount, 0.6, 1.5, (v) => v.toFixed(2))
check('hundreds per innings', hundreds / inningsCount, 0.05, 0.35, (v) => v.toFixed(3))
check('mean top score', topScores / inningsCount, 60, 90, (v) => v.toFixed(1))

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

const parRate = (outcomes.win / MATCHES) * 100
console.log(`  \x1b[90mpar club vs par club, side batting second: ${parRate.toFixed(1)}%\x1b[0m`)
check('MotM always chosen', motmMissing, 0, 0, (v) => v)

// How the actual Bagshot squad fares. Informational — it moves whenever the
// squad is edited, so it must never gate the build.
const bagshotRate = (tier) => {
  const clubs = OPPOSITION.filter((c) => c.tier === tier)
  let w = 0
  const n = 400
  for (let i = 0; i < n; i++) {
    if (simulateMatch(clubs[i % clubs.length], BAGSHOT_XI, i * 5077 + 3).outcome === 'win') w++
  }
  return (w / n) * 100
}
console.log('\n  \x1b[90mBagshot XI win rate by tier (informational):\x1b[0m')
for (const tier of ['derby', 'midtable', 'promotion', 'premier']) {
  console.log(`  \x1b[90m  ${tier.padEnd(10)} ${bagshotRate(tier).toFixed(1)}%\x1b[0m`)
}

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

// Shift a par XI rather than Bagshot's: starting from a side that already wins
// most of its games would hit the ceiling and hide a real regression.
const PAR_XI = evenOpponents[0].xi
const weak = winRateFor(shift(PAR_XI, -12))
const base = winRateFor(PAR_XI)
const strong = winRateFor(shift(PAR_XI, +12))
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
  const plan = autoPlan(BAGSHOT_XI)
  if (validatePlan(plan, BAGSHOT_XI).length > 0) capViolations++

  const rota = buildRota(plan, (() => { let s = i; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })())
  for (let o = 1; o < rota.length; o++) if (rota[o] === rota[o - 1]) rotaViolations++
  const counts = new Map()
  for (const id of rota) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of counts.values()) if (n > RULES.maxOversPerBowler) capViolations++
  if (counts.size < RULES.minBowlers) tooFewBowlers++

  const m = simulateMatch(opp, BAGSHOT_XI, i * 104729 + 7)
  for (const innings of [m.first, m.second]) {
    const bowled = innings.bowling.reduce((s, b) => s + b.balls, 0)
    if (bowled !== innings.balls) ballsMismatch++

    const offBat = innings.batting.reduce((s, b) => s + b.runs, 0)
    if (offBat + innings.extras.total !== innings.runs) runsMismatch++

    const wktsOnCard = innings.batting.filter((b) => b.out !== null).length
    if (wktsOnCard !== innings.wickets) runsMismatch++
  }
}

// Split spells must not be able to produce an illegal rota.
let splitViolations = 0
let splitCap = 0
for (let i = 0; i < 300; i++) {
  const bowlers = BAGSHOT_XI.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20 && !p.wk).slice(0, 5)
  if (bowlers.length < RULES.minBowlers) break
  const combos = [['new-ball'], ['middle'], ['death'], ['new-ball', 'middle'],
                  ['middle', 'death'], ['new-ball', 'death'], ['new-ball', 'middle', 'death']]
  const plan = bowlers.map((p, n) => ({
    playerId: p.id, overs: 9, prefs: combos[(i + n) % combos.length],
  }))
  let s = i + 1
  const rota = buildRota(plan, () => ((s = (s * 16807) % 2147483647) / 2147483647))
  for (let o = 1; o < rota.length; o++) if (rota[o] === rota[o - 1]) splitViolations++
  const counts = new Map()
  for (const id of rota) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of counts.values()) if (n > RULES.maxOversPerBowler) splitCap++
  if (rota.length !== RULES.overs) splitCap++
}

check('no consecutive overs', rotaViolations, 0, 0, (v) => v)
check('split spells stay legal', splitViolations + splitCap, 0, 0, (v) => v)
check('over cap respected', capViolations, 0, 0, (v) => v)
check('at least 5 bowlers used', tooFewBowlers, 0, 0, (v) => v)
check('balls reconcile', ballsMismatch, 0, 0, (v) => v)
check('runs & wickets reconcile', runsMismatch, 0, 0, (v) => v)

// ------------------------------------------------------- DLS resource table

console.log('\n\x1b[1mDuckworth-Lewis par\x1b[0m')

let dlsMonotonic = 0
for (let ov = 0; ov <= 50; ov += 1) {
  for (let w = 0; w < 9; w++) {
    // More wickets lost is never more resource.
    if (resources(ov, w + 1) > resources(ov, w) + 1e-9) dlsMonotonic++
  }
  // More overs left is never less resource.
  if (ov > 0 && resources(ov - 1, 0) > resources(ov, 0) + 1e-9) dlsMonotonic++
}
check('resource table monotonic', dlsMonotonic, 0, 0, (v) => v)

const parAtEnd = dlsPar(200, 0, 0, RULES.balls).par
check('par at the last ball = target', parAtEnd, 200, 200, (v) => v)
const parAtStart = dlsPar(200, 0, 0, 0).par
check('par before a ball is bowled = 0', parAtStart, 0, 0, (v) => v)
check('all out spends every resource', dlsPar(200, 90, 10, 120).par, 200, 200, (v) => v)

// ----------------------------------------------------------- swing bowling

console.log('\n\x1b[1mSwing\x1b[0m')
const swingEarly = swingBoost(85, 1).att
const swingLate = swingBoost(85, SWING_WINDOW + 1).att
check('new ball boosts the attack', swingEarly, 1.3, 1.7, (v) => v.toFixed(3))
check('gone by the end of the window', swingLate, 1, 1, (v) => v.toFixed(3))
check('no swing rating, no boost', swingBoost(undefined, 1).att, 1, 1, (v) => v.toFixed(3))

// ------------------------------------------------------------ season shape

// ------------------------------------------------------- squad availability

console.log('\n\x1b[1mSquad availability\x1b[0m')

const awayCounts = []
const injuredCounts = []
let falloutTotal = 0
let unpickable = 0
let noKeeperRounds = 0
let negativeRounds = 0

for (let s = 0; s < 300; s++) {
  let state = initialAvailability(BAGSHOT_SQUAD, s * 7919 + 11)
  for (let round = 1; round <= 9; round++) {
    if (round > 1) state = rollRound(state, BAGSHOT_SQUAD, round, s * 7919 + 11)
    awayCounts.push(state.away.length)
    injuredCounts.push(state.absences.filter((a) => a.kind === 'injury').length)
    falloutTotal += state.log.filter((e) => e.round === round && e.kind === 'fallout').length

    const fit = availablePlayers(BAGSHOT_SQUAD, state)
    // A squad that can't raise a legal XI is a bug, not a challenge.
    if (fit.length < 11) unpickable++
    if (fit.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20).length < RULES.minBowlers) unpickable++
    if (!fit.some((p) => p.wk)) noKeeperRounds++
    // An absence must never outlive its own expiry.
    if (state.absences.some((a) => a.until <= round)) negativeRounds++
  }
}

const rounds = awayCounts.length
check('away per round', mean(awayCounts), 3, 5, (v) => v.toFixed(2))
check('injured at any time', mean(injuredCounts), 3, 5, (v) => v.toFixed(2))
check('always able to field an XI', unpickable, 0, 0, (v) => v)
check('expired absences cleared', negativeRounds, 0, 0, (v) => v)
check('fallouts are rare', (falloutTotal / rounds) * 100, 2, 30, (v) => v.toFixed(1) + '%')
console.log(
  `  \x1b[90mboth keepers out in ${((noKeeperRounds / rounds) * 100).toFixed(1)}% of rounds ` +
  `— a stand-in keeps, at a cost\x1b[0m`,
)

console.log('\n\x1b[1mDivision 6 West\x1b[0m')

const seasonPositions = []
const SEASONS = Math.max(60, Math.floor(MATCHES / 20))
for (let s = 0; s < SEASONS; s++) {
  let season = createSeason(s * 7919 + 11, BAGSHOT_SQUAD)
  while (!seasonComplete(season)) {
    const f = nextFixture(season)
    const opp = DIV6_WEST.find((c) => c.id === f.opponentId)
    const sd = (s * 31 + f.round) * 104729
    const fit = availablePlayers(BAGSHOT_SQUAD, season.availability)
    const xiR = autoSelectXI(fit)
    const one = simulateFieldingInnings(opp, xiR, autoPlan(xiR), sd)
    const two = simulateBattingInnings(opp, autoBattingOrder(xiR), one.runs + 1, sd)
    season = recordRound(season, buildMatchResult(sd, opp, one, two), BAGSHOT_SQUAD)
  }
  const table = standings(season)
  seasonPositions.push(table.find((r) => r.isBagshot).position)
  if (table.length !== 10) seasonPositions.push(99)
  // Everybody must have played all nine.
  if (table.some((r) => r.played !== 9)) seasonPositions.push(99)
}
check('mean finish, auto-managed', mean(seasonPositions), 3.5, 6.0, (v) => v.toFixed(2))
check('title is winnable', seasonPositions.filter((p) => p === 1).length / SEASONS * 100, 3, 30, (v) => v.toFixed(1) + '%')
check('title is not a formality', seasonPositions.filter((p) => p >= 7).length / SEASONS * 100, 5, 45, (v) => v.toFixed(1) + '%')
console.log(`  \x1b[90m${SEASONS} seasons · real Bagshot finished ${BAGSHOT_REAL_POSITION}th\x1b[0m`)

rmSync(outdir, { recursive: true, force: true })

console.log(
  failures === 0
    ? '\n\x1b[32m\x1b[1mAll checks passed.\x1b[0m\n'
    : `\n\x1b[31m\x1b[1m${failures} check(s) failed.\x1b[0m\n`,
)
process.exit(failures === 0 ? 0 : 1)
