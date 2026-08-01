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
  autoBattingOrder, autoSelectXI, autoBlock, autoField, emptyPlan, makeRng,
  buildRota, buildBlockRota, blockRng, blockSize, oversBowled, oversLeft, validateBlock,
  blockOvers, BLOCK_CAP, BLOCK_COUNT, BLOCK_OVERS, blockOf, blockRange, phaseOf,
  fieldEffect, fieldPush, FIELDS, confidence, settledLabel,
  intentEffect, intentPush, autoIntent,
  createSeason, nextFixture, recordRound, standings, seasonComplete,
  dlsPar, resources, swingBoost, SWING_WINDOW,
  initialAvailability, rollRound, availablePlayers, unavailableMap, availabilityRate,
  DEFAULT_AVAILABILITY,
  seasonForms, formMultiplier, freshAirPlayers, NEUTRAL_FORM,
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
check('median total', pct(firstTotals, 50), 155, 200, (v) => Math.round(v))
check('10th percentile', pct(firstTotals, 10), 95, 145, (v) => Math.round(v))
check('90th percentile', pct(firstTotals, 90), 190, 250, (v) => Math.round(v))
check('mean run rate', mean(firstRR), 3.6, 4.6, (v) => v.toFixed(2))
check('mean wickets lost', mean(firstWkts), 5.5, 8.5, (v) => v.toFixed(2))
check('all-out rate %', mean(allOut) * 100, 28, 50, (v) => v.toFixed(1))
check('mean extras', mean(firstExtras), 8, 20, (v) => v.toFixed(1))

console.log('\n\x1b[1mIndividual scores (both innings)\x1b[0m')
check('ducks per innings', ducks / inningsCount, 0.4, 2.6, (v) => v.toFixed(2))
check('20+ scores per innings', twenties / inningsCount, 2.0, 4.0, (v) => v.toFixed(2))
check('fifties per innings', fifties / inningsCount, 0.4, 1.2, (v) => v.toFixed(2))
check('hundreds per innings', hundreds / inningsCount, 0.01, 0.20, (v) => v.toFixed(3))
check('mean top score', topScores / inningsCount, 45, 72, (v) => v.toFixed(1))

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
let stripMismatch = 0
let creaseMismatch = 0

/** A fully auto-captained rota — every block read off the state by `autoBlock`. */
const autoRota = (xi, seed) =>
  buildRota(emptyPlan(), seed, (block, used, previous) => autoBlock(xi, block, used, previous))

for (let i = 0; i < 500; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const rota = autoRota(BAGSHOT_XI, i * 31 + 5)
  if (rota.length !== RULES.overs) capViolations++
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

    // The scorebook strip drives the sim display, so it has to be the truth:
    // six legal deliveries an over, wickets and runs matching the summary.
    for (const o of innings.overSummaries) {
      const legal = o.balls.filter((t) => t !== 'wd' && t !== 'nb').length
      const last = o.over === innings.overSummaries[innings.overSummaries.length - 1].over
      // A short final over is fine — the innings ended inside it.
      if (legal > RULES.ballsPerOver || (legal < RULES.ballsPerOver && !last)) stripMismatch++
      if (o.balls.filter((t) => t === 'W').length !== o.wkts) stripMismatch++
      const fromStrip = o.balls.reduce((s, t) => {
        if (t === 'wd' || t === 'nb') return s + 1
        if (t === '.') return s
        return s + (parseInt(t, 10) || 0)
      }, 0)
      if (fromStrip !== o.runs) stripMismatch++
      // Nobody at the crease is already out, and never more than two of them.
      if (o.atCrease.length > 2) creaseMismatch++
      if (o.atCrease.filter((b) => b.onStrike).length > 1) creaseMismatch++
      for (const b of o.atCrease) {
        const card = innings.batting.find((c) => c.name === b.name)
        if (!card || b.runs > card.runs || b.balls > card.balls) creaseMismatch++
      }
    }
  }
}

// Lopsided blocks must not be able to produce an illegal rota. Every block is
// pushed right up against the ceiling, in every combination, with the join
// across the block boundary having to hold each time.
let splitViolations = 0
let splitCap = 0
for (let i = 0; i < 300; i++) {
  const bowlers = BAGSHOT_XI.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20 && !p.wk).slice(0, 5)
  if (bowlers.length < RULES.minBowlers) break
  const shapes = [[5, 4], [4, 5], [5, 3, 1], [3, 3, 3], [4, 4, 1]]
  const plan = Array.from({ length: BLOCK_COUNT }, (_, b) => {
    const shape = shapes[(i + b) % shapes.length]
    // Rotate who gets which share, so every bowler takes a turn in every role.
    return shape.map((overs, n) => ({ playerId: bowlers[(i + b + n) % bowlers.length].id, overs }))
  })
  // A shape that busts somebody's nine-over allowance simply isn't a legal
  // plan; the point of this check is the rota, not the validator.
  const total = new Map()
  let illegal = false
  for (const b of plan) {
    for (const a of b) {
      total.set(a.playerId, (total.get(a.playerId) ?? 0) + a.overs)
      if (total.get(a.playerId) > RULES.maxOversPerBowler) illegal = true
      if (a.overs > BLOCK_CAP) illegal = true
    }
  }
  if (illegal) continue
  const rota = buildRota(plan, i * 977 + 3, () => [])
  for (let o = 1; o < rota.length; o++) if (rota[o] === rota[o - 1]) splitViolations++
  const counts = new Map()
  for (const id of rota) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of counts.values()) if (n > RULES.maxOversPerBowler) splitCap++
  if (rota.length !== RULES.overs) splitCap++
}

// The count you set is the count you get. The very first version of this screen
// asked for a *preference*, which the rota treated as a hint — 16% of overs
// were bowled outside the block you picked and nothing said so. This is the
// check that stops that coming back.
let countHonoured = 0, countTotal = 0
for (let i = 0; i < 300; i++) {
  const used = new Map()
  let previous = null
  for (let b = 0; b < BLOCK_COUNT; b++) {
    const chosen = autoBlock(BAGSHOT_XI, b, used, previous)
    if (validateBlock(b, chosen, BAGSHOT_XI, used, previous).length > 0) countTotal++   // counts as a miss
    const part = buildBlockRota(b, chosen, previous, null, blockRng(i * 7919 + 3, b))
    for (const a of chosen) {
      countTotal++
      if (part.filter((id) => id === a.playerId).length === a.overs) countHonoured++
    }
    for (const id of part) used.set(id, (used.get(id) ?? 0) + 1)
    previous = part[part.length - 1] ?? previous
  }
}

// Bowlers must bowl in spells, not one over every fourth over.
//
// Deriving the rota from a straight "whoever is furthest behind" deal produced
// exactly that — five bowlers rotating a single over at a time, all innings.
// It reads wrong, and it made the plan screen render thirty one-over spells.
let runTotal = 0, runCount = 0
for (let i = 0; i < 200; i++) {
  const rota = autoRota(BAGSHOT_XI, i * 104729 + 7)
  const seen = new Set(rota)
  for (const id of seen) {
    const overs = rota.map((x, n) => (x === id ? n + 1 : 0)).filter(Boolean)
    let run = 1
    for (let n = 1; n < overs.length; n++) {
      if (overs[n] === overs[n - 1] + 2) { run++; continue }
      runTotal += run; runCount++; run = 1
    }
    runTotal += run; runCount++
  }
}

// The auto captain must always get through the innings. A version that quietly
// dropped overs it couldn't place left the innings short and every batting
// number wrong — and now that he's called five separate times, a block that
// strands the last one is a live risk rather than a theoretical one.
let autoShort = 0
for (let i = 0; i < 50; i++) {
  const xiN = autoSelectXI(BAGSHOT_SQUAD.slice(0, 12 + (i % 15)))
  const rota = autoRota(xiN, i * 61 + 11)
  if (rota.length !== RULES.overs) autoShort++
  const counts = new Map()
  for (const id of rota) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const n of counts.values()) if (n > RULES.maxOversPerBowler) autoShort++
  if (counts.size < RULES.minBowlers) autoShort++
}
check('the auto captain gets through 45', autoShort, 0, 0, (v) => v)

check('no consecutive overs', rotaViolations, 0, 0, (v) => v)
check('awkward blocks stay legal', splitViolations + splitCap, 0, 0, (v) => v)
check(
  'block counts honoured exactly',
  countTotal === 0 ? 0 : (countHonoured / countTotal) * 100, 100, 100, (v) => v.toFixed(1) + '%',
)
check('bowlers bowl in spells', runCount === 0 ? 0 : runTotal / runCount, 2.4, 9, (v) => v.toFixed(2))
check('over cap respected', capViolations, 0, 0, (v) => v)
check('at least 5 bowlers used', tooFewBowlers, 0, 0, (v) => v)
check('balls reconcile', ballsMismatch, 0, 0, (v) => v)
check('runs & wickets reconcile', runsMismatch, 0, 0, (v) => v)
check('scorebook strip reconciles', stripMismatch, 0, 0, (v) => v)
check('crease snapshot is sane', creaseMismatch, 0, 0, (v) => v)

// The bowling plan screen previews the rota by re-seeding buildRota with the
// match seed. That's only honest if it reproduces the rota the innings actually
// uses — so check the preview against who really bowled.
let previewMismatch = 0
for (let i = 0; i < 300; i++) {
  const seed = i * 7919 + 13
  const opp = evenOpponents[i % evenOpponents.length]
  // Play out a whole innings a block at a time, the way the screen does: build
  // the block, preview it, take the field, and check the preview against who
  // really bowled those nine overs.
  const plan = emptyPlan()
  const idOf = (name) => (name === undefined ? null : BAGSHOT_XI.find((p) => p.name === name)?.id ?? null)
  for (let b = 0; b < BLOCK_COUNT; b++) {
    // The last *two* bowlers cross the join: one is locked out of the first
    // over, the other still holds his end. A preview that only carried the last
    // one across was wrong about a third of the time.
    const done = b === 0
      ? []
      : simulateFieldingInnings(opp, BAGSHOT_XI, plan, seed)
        .overSummaries.filter((o) => o.over <= b * BLOCK_OVERS)
    const before = idOf(done[done.length - 1]?.bowlerName)
    const beforeThat = idOf(done[done.length - 2]?.bowlerName)
    plan[b] = autoBlock(BAGSHOT_XI, b, oversBowled(plan, b), before)
    const preview = buildBlockRota(b, plan[b], before, beforeThat, blockRng(seed, b))
    const innings = simulateFieldingInnings(opp, BAGSHOT_XI, plan, seed)
    for (const o of innings.overSummaries) {
      if (blockOf(o.over) !== b) continue
      const predicted = BAGSHOT_XI.find((p) => p.id === preview[o.over - 1 - b * BLOCK_OVERS])
      if (predicted?.name !== o.bowlerName) previewMismatch++
    }
  }
}
check('rota preview matches reality', previewMismatch, 0, 0, (v) => v)

// The attack screen reads every bowler's analysis out of his most recent over
// summary. That's only honest if the snapshot really is what he had bowled by
// then — reading his final card instead would tell you how the innings turns
// out before you'd picked who bowls the next nine.
let figureDrift = 0
for (let i = 0; i < 200; i++) {
  const innings = simulateFieldingInnings(
    evenOpponents[i % evenOpponents.length], BAGSHOT_XI, emptyPlan(), i * 7919 + 23,
  )
  for (const mark of [9, 18, 27, 36]) {
    const upTo = innings.overSummaries.filter((o) => o.over <= mark)
    if (upTo.length === 0) continue
    // Everyone's figures as the screen would show them.
    const shown = new Map()
    for (const o of upTo) shown.set(o.bowlerId, o.figures)
    // ...against what those overs actually contained, ball by ball. Byes and
    // leg byes go against the team and never the bowler, which is exactly why
    // adding up over totals wouldn't do.
    for (const [id, f] of shown) {
      const strips = upTo.filter((o) => o.bowlerId === id).flatMap((o) => o.balls)
      const legal = strips.filter((t) => t !== 'wd' && t !== 'nb').length
      const charged = strips.reduce((s, t) => {
        if (t === 'wd' || t === 'nb') return s + 1
        if (/[a-z]/.test(t)) return s                 // byes and leg byes
        return s + (parseInt(t, 10) || 0)
      }, 0)
      if (f.balls !== legal) figureDrift++
      if (f.runs !== charged) figureDrift++
      const final = innings.bowling.find((b) => b.playerId === id)
      // And it must never be ahead of where he ends up.
      if (final && (f.runs > final.runs || f.wickets > final.wickets)) figureDrift++
    }
  }
}
check('figures at a break are the figures then', figureDrift, 0, 0, (v) => v)

// The whole live-bowling design rests on this: deciding block three cannot
// reach backwards and re-deal blocks one and two. Each block's rota comes from
// its own seeded stream for exactly that reason — share one and every later
// decision would silently rewrite the overs you had already watched.
let rewritten = 0
for (let i = 0; i < 200; i++) {
  const seed = i * 104729 + 17
  const opp = evenOpponents[i % evenOpponents.length]
  const partial = emptyPlan()
  partial[0] = autoBlock(BAGSHOT_XI, 0, new Map(), null)
  const early = simulateFieldingInnings(opp, BAGSHOT_XI, partial, seed)

  // Now call the later blocks differently and re-run.
  const fuller = [...partial]
  const bowlers = BAGSHOT_XI.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20 && !p.wk)
  for (let b = 1; b < BLOCK_COUNT; b++) {
    fuller[b] = [
      { playerId: bowlers[(b * 2) % bowlers.length].id, overs: 5 },
      { playerId: bowlers[(b * 2 + 1) % bowlers.length].id, overs: 4 },
    ]
  }
  const later = simulateFieldingInnings(opp, BAGSHOT_XI, fuller, seed)

  for (const o of early.overSummaries) {
    if (o.over > BLOCK_OVERS) break
    const same = later.overSummaries.find((x) => x.over === o.over)
    if (!same || same.bowlerName !== o.bowlerName || same.total !== o.total
        || same.balls.join('') !== o.balls.join('')) rewritten++
  }
}
check('deciding later never re-bowls the start', rewritten, 0, 0, (v) => v)

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

// The band is wide on purpose. A narrow one here was quietly holding the new
// ball down to a rounding error, which is most of why the bowling plan didn't
// matter: with nothing to gain from opening with your swing bowler, the screen
// was thirty controls governing 1.4% of an innings.
console.log('\n\x1b[1mSwing\x1b[0m')
const swingEarly = swingBoost(85, 1).att
const swingLate = swingBoost(85, SWING_WINDOW + 1).att
check('new ball boosts the attack', swingEarly, 1.65, 2.10, (v) => v.toFixed(3))
check('gone by the end of the window', swingLate, 1, 1, (v) => v.toFixed(3))
check('no swing rating, no boost', swingBoost(undefined, 1).att, 1, 1, (v) => v.toFixed(3))

// ------------------------------------------------- the bowling plan matters
//
// The one this suite was missing. The attack screen was rebuilt twice on the
// assumption its problem was the interface; nothing here noticed that a good
// deployment and a thoughtless one differed by two and a half runs, so the
// screen kept being decorative and nothing failed.
//
// Same five bowlers in every plan — only *when* they bowl changes. Letting the
// plans pick different bowlers would measure selection instead, which is worth
// far more and would hide exactly the problem this is here to catch.

console.log('\n\x1b[1mThe bowling plan\x1b[0m')

const planAttack = (() => {
  const pool = BAGSHOT_XI.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20 && !p.wk)
  const rank = (f) => [...pool].sort((a, b) => f(b) - f(a))
  const five = [
    ...rank((p) => p.swing ?? 0).slice(0, 2),
    rank((p) => (p.bowlType === 'spin' ? 1000 : 0) + p.bowl.def + p.bowl.att)[0],
  ]
  for (const p of rank((p) => p.bowl.def + p.bowl.att)) {
    if (five.length >= 5) break
    if (!five.includes(p)) five.push(p)
  }
  return five
})()

/**
 * Deal all five blocks, taking each block's preference order from `prefFor`.
 *
 * Whoever bowled the last over of the block behind can only have half of the
 * next one, so the join is tracked as we go — the same rule the screen enforces.
 */
const dealPlan = (prefFor) => {
  const used = new Map()
  const plan = []
  let previous = null
  for (let b = 0; b < BLOCK_COUNT; b++) {
    const want = blockSize(b)
    const alloc = new Map()
    let leftToGive = want
    for (const p of [...prefFor(b), ...planAttack]) {
      if (leftToGive <= 0) break
      const ceiling = p.id === previous ? Math.floor(want / 2) : BLOCK_CAP
      const room = Math.min(ceiling - (alloc.get(p.id) ?? 0), oversLeft(used, p.id), leftToGive)
      if (room > 0) { alloc.set(p.id, (alloc.get(p.id) ?? 0) + room); leftToGive -= room }
    }
    if (leftToGive > 0) return null
    const block = [...alloc.entries()].map(([playerId, overs]) => ({ playerId, overs }))
    if (validateBlock(b, block, BAGSHOT_XI, used, previous).length > 0) return null
    const part = buildBlockRota(b, block, previous, null, blockRng(1, b))
    for (const id of part) used.set(id, (used.get(id) ?? 0) + 1)
    previous = part[part.length - 1] ?? previous
    plan.push(block)
  }
  return plan
}

const rankBy = (f) => [...planAttack].sort((a, b) => f(b) - f(a))
const seamFirst = rankBy((p) => (p.bowlType === 'spin' ? 0 : 1000) + p.bowl.att)
const spinFirst = rankBy((p) => (p.bowlType === 'spin' ? 1000 : 0) + p.bowl.def)
const swingFirst = rankBy((p) => (p.swing ?? 0) * 10 + p.bowl.att)
const byIndex = rankBy((p) => p.bowl.def + p.bowl.att)

// Swing takes the new ball, spin squeezes the middle, the strike bowlers finish.
const goodPlan = dealPlan((b) => {
  const phase = phaseOf(blockRange(b).from)
  if (phase === 'powerplay') return swingFirst.filter((p) => p.bowlType !== 'spin')
  if (phase === 'death') return seamFirst
  return spinFirst
})
// Nobody thought about it: the five best by raw index, taken two at a time in
// that order for nine overs each, type and swing ignored. The realistic bad
// plan rather than a pathological one — it's what you get from working down the
// list, and it buries the swing bowlers in the middle overs.
//
// Note it can't simply be "best index first every block": that hands the first
// three men their full allowance by the twenty-seventh over and strands the
// death with one bowler and five overs. Which is a real trap, and why
// `validateBlock` warns about it — but a plan that never validates isn't a
// comparison, it's a crash.
const naivePlan = Array.from({ length: BLOCK_COUNT }, (_, b) => ([
  { playerId: byIndex[(b * 2) % byIndex.length].id, overs: 5 },
  { playerId: byIndex[(b * 2 + 1) % byIndex.length].id, overs: 4 },
]))

const concede = (plan, fields) => {
  const totals = []
  for (let i = 0; i < 800; i++) {
    totals.push(
      simulateFieldingInnings(
        evenOpponents[i % evenOpponents.length], BAGSHOT_XI, plan, i * 7919 + 11, undefined, fields,
      ).runs,
    )
  }
  return mean(totals)
}

if (!goodPlan || !naivePlan) {
  check('deployment is worth having', 0, 8, 30, (v) => v.toFixed(1))
  console.log('  \x1b[90mcould not build a legal pair of plans to compare\x1b[0m')
} else {
  check('deployment is worth having', concede(naivePlan) - concede(goodPlan), 8, 30, (v) => v.toFixed(1))
}

// ...and it must stay a question of *when*, not *who*. If widening the phase
// table ever makes one type flatly better, the plan collapses into "pick the
// good bowlers" and the blocks stop meaning anything.
const flatPlan = Array.from({ length: BLOCK_COUNT }, (_, b) => (
  // Same two men every block, rotated so everyone bowls in every phase.
  [
    { playerId: planAttack[(b * 2) % planAttack.length].id, overs: 5 },
    { playerId: planAttack[(b * 2 + 1) % planAttack.length].id, overs: 4 },
  ]
))
const asType = (type) => {
  const xi = BAGSHOT_XI.map((p) =>
    (planAttack.includes(p) ? { ...p, bowlType: type, swing: undefined } : p))
  const totals = []
  for (let i = 0; i < 800; i++) {
    totals.push(simulateFieldingInnings(evenOpponents[i % evenOpponents.length], xi, flatPlan, i * 7919 + 11).runs)
  }
  return mean(totals)
}
check('pace and spin stay level', Math.abs(asType('pace') - asType('spin')), 0, 8, (v) => v.toFixed(1))

// --------------------------------------------------------------- the fields

console.log('\n\x1b[1mThe field\x1b[0m')

// A field must be a decision, not a dial: it has to be worth real runs, and the
// same setting has to be a different deal for different bowlers. Without the
// second half it's one multiplier applied to everybody, which is exactly the
// mistake the first version of batting intent made.
/** One setting, from the first ball to the last. */
const allField = (f) => [{ at: 0, field: f }]
if (goodPlan) {
  const totals = FIELDS.map((f) => ({ f: f.id, runs: concede(goodPlan, allField(f.id)) }))
  const spread = totals.find((t) => t.f === 'spread').runs
  const attack = totals.find((t) => t.f === 'attack').runs
  check('the field is worth runs', Math.abs(attack - spread), 6, 40, (v) => v.toFixed(1))
  // ...and no setting can be free money. If one of them wins by a distance
  // there is no decision here, just a button you always press.
  const best = Math.min(...totals.map((t) => t.runs))
  const worst = Math.max(...totals.map((t) => t.runs))
  check('no setting runs away with it', worst - best, 0, 32, (v) => v.toFixed(1))
  console.log(`  \x1b[90m${totals.map((t) => `${t.f} ${t.runs.toFixed(0)}`).join(' · ')}\x1b[0m`)
}

// A ring field is the tightest thing there is — singles are cheapest there and
// dearer either side of it. That's what stops SPREAD being a strictly better
// CONTAIN.
const singlesFor = (f) => fieldEffect(fieldPush(f), 70, 70).single
check(
  'a ring field is the tightest',
  Math.min(singlesFor('spread'), singlesFor('press'), singlesFor('attack')) - singlesFor('contain'),
  0.001, 0.2, (v) => v.toFixed(3),
)

// Attacking suits a strike bowler far more than a part-timer — the same
// asymmetry batting intent has between a striker and a tailender.
const gun = fieldEffect(fieldPush('attack'), 80, 90)
const trundler = fieldEffect(fieldPush('attack'), 45, 42)
check('attacking pays a strike bowler', (gun.wicket - 1) * 100, 30, 90, (v) => v.toFixed(0) + '%')
check('...and a part-timer less', (trundler.wicket - 1) * 100, 8, 45, (v) => v.toFixed(0) + '%')
check(
  'the gun gets the better exchange',
  (gun.wicket - 1) / (trundler.wicket - 1), 1.25, 4, (v) => v.toFixed(2) + '×',
)
// ...and spreading is only worth ordering if he can bowl to it.
const tidy = fieldEffect(fieldPush('spread'), 85, 70)
const loose = fieldEffect(fieldPush('spread'), 38, 55)
check('spreading saves a tidy bowler runs', 1 - tidy.boundary, 0.20, 0.55, (v) => v.toFixed(2))
check('...and barely helps a loose one', 1 - loose.boundary, 0.05, 0.28, (v) => v.toFixed(2))
check(
  'no field is free',
  Math.min(fieldEffect(fieldPush('attack'), 80, 90).boundary, 99) - 1, 0.10, 0.60, (v) => v.toFixed(2),
)

// ------------------------------------------------------------- opening batters

console.log('\n\x1b[1mOpening the batting\x1b[0m')

const openOrder = autoBattingOrder(BAGSHOT_XI)
check('AUTO opens with two openers', openOrder.slice(0, 2).filter((p) => p.opener).length, 2, 2, (v) => v)

const batOut = (order) => {
  const totals = []
  for (let i = 0; i < 800; i++) {
    // An unreachable target, so they bat the full 45 and the whole cost shows.
    totals.push(simulateBattingInnings(evenOpponents[i % evenOpponents.length], order, 999, i * 7919 + 11).runs)
  }
  return mean(totals)
}
// Identical players, identical order — the only difference is whether the top
// two are built for the new ball.
// Being an opener is now a positive rather than merely the absence of a
// penalty, so the gap between a specialist and a middle-order man pushed up is
// wide — around three-quarters of an over's worth of extra risk with the new
// ball. That's deliberate: it's what makes the top two a decision rather than
// "best batter first".
const stripped = openOrder.map((p, i) => (i < 2 ? { ...p, opener: false } : p))
check('opening with the wrong men costs runs', batOut(openOrder) - batOut(stripped), 5, 35, (v) => v.toFixed(1))

// ...and it has to be the *new ball* doing it, not a flat penalty on the top
// two. The damage has to be done by the time the shine goes; after that a
// non-opener is simply a batter and the two sides must lose wickets at the same
// rate. Measured as wickets down at the end of the swing window against wickets
// down across the rest of the innings.
const wktsBy = (order, over) => {
  let early = 0
  for (let i = 0; i < 800; i++) {
    const r = simulateBattingInnings(evenOpponents[i % evenOpponents.length], order, 999, i * 7919 + 11)
    const at = r.overSummaries.find((o) => o.over === over)
    early += at ? at.totalWkts : r.wickets
  }
  return early / 800
}
check(
  'the new ball is what does it',
  wktsBy(stripped, SWING_WINDOW) - wktsBy(openOrder, SWING_WINDOW), 0.10, 1.80,
  (v) => v.toFixed(2) + ' wkts',
)

// ...and it is gone once the shine is. Marking the *tail* as openers must do
// nothing at all: they arrive long after the twelfth over, so if this moves,
// the penalty has become a flat tax on not being an opener rather than a new
// ball a specialist sees off. Comparing the top two before and after can't tell
// those apart — losing an extra early wicket cascades through the rest of the
// innings whichever mechanism caused it.
const tailMarked = openOrder.map((p, i) => (i >= 7 ? { ...p, opener: true } : p))
check(
  '...and it is gone once the shine is',
  Math.abs(batOut(tailMarked) - batOut(openOrder)), 0, 2.5, (v) => v.toFixed(1) + ' runs',
)

// ------------------------------------------------------------- getting in

console.log('\n\x1b[1mConfidence\x1b[0m')

// Getting in has to be the main story of a batting innings — steep early, and
// most of it won inside the first dozen balls.
check('walking out is nothing like set', confidence(0), 0, 0, (v) => v.toFixed(2))
check('a dozen balls does most of it', confidence(12), 0.42, 0.75, (v) => v.toFixed(2))
check('and it tops out', confidence(60), 1, 1, (v) => v.toFixed(2))
let confSlips = 0
for (let b = 1; b <= 80; b++) if (confidence(b) < confidence(b - 1)) confSlips++
check('never goes backwards', confSlips, 0, 0, (v) => v)

// The whole point: a set batter is far harder to shift than a new one. Measured
// in the innings rather than from the constants, so it survives a retune.
const dismissRate = (lo, hi) => {
  let out = 0, balls = 0
  for (let i = 0; i < 600; i++) {
    const r = simulateBattingInnings(evenOpponents[i % evenOpponents.length], openOrder, 999, i * 7919 + 11)
    for (const c of r.batting) {
      if (!c.batted || c.balls === 0) continue
      // Only count a card whose whole innings sits in the band — a batter who
      // got past `hi` obviously survived it.
      if (c.balls <= lo) continue
      const inBand = Math.min(c.balls, hi) - lo
      if (inBand <= 0) continue
      balls += inBand
      if (c.out && c.balls <= hi) out++
    }
  }
  return balls === 0 ? 0 : (out / balls) * 100
}
const early = dismissRate(0, 12)
const late = dismissRate(36, 90)
check('a new batter is the one you want', early / Math.max(late, 1e-9), 1.6, 5, (v) => v.toFixed(2) + '×')
console.log(`  \x1b[90mfirst 12 balls ${early.toFixed(1)}% per ball · past 36 ${late.toFixed(1)}%\x1b[0m`)

// ---------------------------------------------------- the shape of an innings
//
// Aggregate totals can be right while every individual score is wrong. Club
// batting is a fat low band, a real middle, and the occasional big one — and
// openers face the most balls, so the top of the order must outscore the middle.
// Before confidence existed the median was 8 with a 39% bulge at 1-9, and a
// number five outscored an opener.

console.log('\n\x1b[1mThe shape of a batting innings\x1b[0m')

const scores = []
const byPos = Array.from({ length: 11 }, () => [])
let dismissals = 0, duckOuts = 0
for (let i = 0; i < 1200; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const other = evenOpponents[(i + 1) % evenOpponents.length]
  const m = simulateMatch(opp, other.xi, i * 7919 + 13)
  for (const innings of [m.first, m.second]) {
    innings.batting.forEach((c, n) => {
      if (!c.batted || c.balls === 0) return
      scores.push(c.runs)
      byPos[n].push(c.runs)
      if (c.out) { dismissals++; if (c.runs === 0) duckOuts++ }
    })
  }
}
const band = (lo, hi) => (scores.filter((s) => s >= lo && s <= hi).length / scores.length) * 100
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const topThree = meanOf([...byPos[0], ...byPos[1], ...byPos[2]])
const middle = meanOf([...byPos[4], ...byPos[5]])

// These bands are **club** cricket, not the professional game, and the first
// version of this block had professional numbers in it — a median of 12 and a
// duck rate of one in ten. Work it out from a real card instead: a side bowled
// out for 175 has ten dismissed batters sharing about 160 off the bat, which is
// a mean of 16, and club cards are heavily right-skewed. 45, 38, 22, 15, 8, 6,
// 4, 3, 1, 0, 0 is an utterly ordinary Saturday, and its median is 6 with two
// ducks in ten dismissals. Chasing a median of 12 here would mean an engine
// nobody gets out in.
check('median score', pct(scores, 50), 5, 12, (v) => Math.round(v))
check('ducks as a share of dismissals', (duckOuts / dismissals) * 100, 12, 24, (v) => v.toFixed(1) + '%')
check('single figures are common', band(1, 9), 30, 46, (v) => v.toFixed(1) + '%')
check('...but not the whole innings', band(20, 49), 14, 28, (v) => v.toFixed(1) + '%')
check('fifties are an event', band(50, 300), 5, 16, (v) => v.toFixed(1) + '%')
// The one that was genuinely wrong before confidence existed: a number five
// outscored an opener, which happens in no real scorebook. Openers face by far
// the most deliveries, so the top of the order has to be the best place to bat.
check('the top three outscore the middle', topThree - middle, 0.4, 12, (v) => v.toFixed(1))
console.log(
  `  \x1b[90mby position: ${byPos.map((a) => meanOf(a).toFixed(0)).join(' · ')}\x1b[0m`,
)

// ------------------------------------------------------ a balanced auto XI

console.log('\n\x1b[1mThe suggested XI\x1b[0m')

let noKeeper = 0, tooFew = 0, noSpin = 0, noOpeners = 0, noNewBall = 0, wrongSize = 0
for (let i = 0; i < 60; i++) {
  // Squads of every awkward shape, including ones with no spinner at all.
  const squad = BAGSHOT_SQUAD.slice(0, 11 + (i % 17))
  if (squad.length < 11) continue
  const xi = autoSelectXI(squad)
  const attack = xi.filter((p) => p.bowl.def >= 20 && p.bowl.att >= 20 && !p.wk)
  if (xi.length !== 11) wrongSize++
  if (squad.some((p) => p.wk) && !xi.some((p) => p.wk)) noKeeper++
  if (attack.length < RULES.minBowlers) tooFew++
  if (squad.some((p) => p.bowlType === 'spin') && !attack.some((p) => p.bowlType === 'spin')) noSpin++
  if (squad.filter((p) => p.opener).length >= 2 && xi.filter((p) => p.opener).length < 2) noOpeners++
  if (squad.some((p) => p.swing) && !attack.some((p) => p.swing)) noNewBall++
}
check('always eleven', wrongSize, 0, 0, (v) => v)
check('always a keeper', noKeeper, 0, 0, (v) => v)
check('always five bowlers', tooFew, 0, 0, (v) => v)
check('always a spinner', noSpin, 0, 0, (v) => v)
check('always someone for the new ball', noNewBall, 0, 0, (v) => v)
check('always two openers', noOpeners, 0, 0, (v) => v)

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
// Away is no longer a fixed draw — it's an independent roll per player against
// his availability score, so the count follows from the squad. The band is wide
// on purpose: change the scores and this number is *meant* to move.
const expectedAway = BAGSHOT_SQUAD.reduce((n, p) => n + (1 - availabilityRate(p)), 0)
check('away per round', mean(awayCounts), 2.5, 7.5, (v) => v.toFixed(2))
check(
  'away count tracks the squad scores',
  Math.abs(mean(awayCounts) - expectedAway), 0, 1.2, (v) => `±${v.toFixed(2)} of ${expectedAway.toFixed(1)}`,
)
check('injured at any time', mean(injuredCounts), 3, 5, (v) => v.toFixed(2))
check('always able to field an XI', unpickable, 0, 0, (v) => v)
check('expired absences cleared', negativeRounds, 0, 0, (v) => v)
check('fallouts are rare', (falloutTotal / rounds) * 100, 2, 30, (v) => v.toFixed(1) + '%')

// --- does the score actually mean anything? ---------------------------------
//
// A synthetic squad spanning the whole scale, so the claim "7 out of 10 means he
// turns up seven weeks in ten" is measured rather than asserted. Only the away
// roll is checked — injuries ignore the score by design, so they're excluded.
const ladder = Array.from({ length: 27 }, (_, i) => {
  const score = i < 11 ? 10 : [2, 4, 6, 8][(i - 11) % 4]
  return {
    id: `l${i}`, name: `Ladder ${i}`, value: 1,
    bat: { skill: 60, pwr: 60 }, bowl: { def: 60, att: 60 },
    wk: i === 0, availability: score,
  }
})

const awayByScore = new Map()
const seenByScore = new Map()
for (let s = 0; s < 400; s++) {
  let st = initialAvailability(ladder, s * 104729 + 3)
  for (let round = 1; round <= 9; round++) {
    if (round > 1) st = rollRound(st, ladder, round, s * 104729 + 3)
    const injured = new Set(st.absences.map((a) => a.playerId))
    const away = new Set(st.away.map((a) => a.playerId))
    for (const p of ladder) {
      // Somebody already crocked never gets an away roll, so he can't count.
      if (injured.has(p.id)) continue
      seenByScore.set(p.availability, (seenByScore.get(p.availability) ?? 0) + 1)
      if (away.has(p.id)) awayByScore.set(p.availability, (awayByScore.get(p.availability) ?? 0) + 1)
    }
  }
}

for (const score of [2, 4, 6, 8, 10]) {
  const rate = (awayByScore.get(score) ?? 0) / (seenByScore.get(score) ?? 1)
  const want = 1 - score / 10
  // Generous on the low scores: the legal-XI guard recalls the keenest first,
  // which drags a 2-out-of-10's observed rate slightly under his nominal one.
  check(
    `score ${score}/10 misses ~${Math.round(want * 100)}% of weeks`,
    rate * 100, Math.max(0, want * 100 - 9), want * 100 + 4, (v) => v.toFixed(1) + '%',
  )
}
console.log(
  `  \x1b[90mboth keepers out in ${((noKeeperRounds / rounds) * 100).toFixed(1)}% of rounds ` +
  `— a stand-in keeps, at a cost\x1b[0m`,
)

// ------------------------------------------------------------ form

console.log('\n\x1b[1mForm\x1b[0m')
check('neutral form is exactly par', formMultiplier(NEUTRAL_FORM), 1, 1, (v) => v.toFixed(3))
check('in form beats out of form', formMultiplier(85) / formMultiplier(15), 1.2, 1.8, (v) => v.toFixed(2))

// Form has to actually change results, or it's decoration.
const runsAtForm = (value) => {
  const club = DIV6_WEST[4]
  const xi = autoSelectXI(BAGSHOT_SQUAD)
  const forms = {}
  for (const p of BAGSHOT_SQUAD) forms[p.id] = value
  let total = 0
  const n = 500
  for (let i = 0; i < n; i++) {
    total += simulateBattingInnings(club, autoBattingOrder(xi), 400, i * 7919 + 3, forms).runs
  }
  return total / n
}
const lowForm = runsAtForm(20)
const highForm = runsAtForm(80)
check('form changes what you score', highForm - lowForm, 25, 200, (v) => v.toFixed(1))
console.log(`  \x1b[90mform 20: ${lowForm.toFixed(0)} · form 80: ${highForm.toFixed(0)} per innings\x1b[0m`)

console.log('\n\x1b[1mDivision 6 West\x1b[0m')

const seasonPositions = []
const freshAirPerMatch = []
const seasonForms_ = []
let formOutOfRange = 0
let seasonFallouts = 0
let seasonUnpickable = 0
const SEASONS = Math.max(60, Math.floor(MATCHES / 20))
for (let s = 0; s < SEASONS; s++) {
  let season = createSeason(s * 7919 + 11, BAGSHOT_SQUAD)
  while (!seasonComplete(season)) {
    const f = nextFixture(season)
    const opp = DIV6_WEST.find((c) => c.id === f.opponentId)
    const sd = (s * 31 + f.round) * 104729
    const fit = availablePlayers(BAGSHOT_SQUAD, season.availability)
    const xiR = autoSelectXI(fit)
    const fm = seasonForms(season)
    const one = simulateFieldingInnings(opp, xiR, emptyPlan(), sd, fm)
    const two = simulateBattingInnings(opp, autoBattingOrder(xiR), one.runs + 1, sd, fm)
    freshAirPerMatch.push(freshAirPlayers(xiR, one, two).length)
    if (fit.length < 11) seasonUnpickable++
    season = recordRound(season, buildMatchResult(sd, opp, one, two), BAGSHOT_SQUAD, xiR)
  }
  const table = standings(season)
  seasonPositions.push(table.find((r) => r.isBagshot).position)
  for (const p of Object.values(season.players)) {
    if (p.form < 0 || p.form > 100 || Number.isNaN(p.form)) formOutOfRange++
    seasonForms_.push(p.form)
  }
  seasonFallouts += season.availability.log.filter((e) => e.kind === 'fallout').length
  if (table.length !== 10) seasonPositions.push(99)
  // Everybody must have played all nine.
  if (table.some((r) => r.played !== 9)) seasonPositions.push(99)
}
check('mean finish, auto-managed', mean(seasonPositions), 3.5, 6.0, (v) => v.toFixed(2))
check('title is winnable', seasonPositions.filter((p) => p === 1).length / SEASONS * 100, 3, 30, (v) => v.toFixed(1) + '%')
check('title is not a formality', seasonPositions.filter((p) => p >= 7).length / SEASONS * 100, 5, 45, (v) => v.toFixed(1) + '%')
console.log(`  \x1b[90m${SEASONS} seasons · real Bagshot finished ${BAGSHOT_REAL_POSITION}th\x1b[0m`)

// ------------------------------------------------------------ batting intent

console.log('\n\x1b[1mBatting intent\x1b[0m')

// The trade must depend on who is holding the bat. The first version of this
// applied one multiplier to everybody, so telling the number eleven to attack
// was the same deal as telling your best striker — which is the whole thing
// this check exists to stop coming back.
const striker = { skill: 83, pwr: 88 }
const tailender = { skill: 20, pwr: 25 }
const atk = intentPush('attack')
const sEff = intentEffect(atk, striker.skill, striker.pwr)
const tEff = intentEffect(atk, tailender.skill, tailender.pwr)
const exchange = (e) => (e.boundary - 1) / (e.wicket - 1)
check('attacking pays a striker more', sEff.boundary, 1.7, 2.4, (v) => `${Math.round((v - 1) * 100)}%`)
check('attacking pays a tailender less', tEff.boundary, 1.1, 1.6, (v) => `${Math.round((v - 1) * 100)}%`)
check('...and costs him more', tEff.wicket / sEff.wicket, 1.3, 3.0, (v) => v.toFixed(2) + '×')
// Runs bought per unit of risk taken. The band is wide at the top on purpose:
// these two are the extremes of the squad, and attacking with a number eleven
// really should be a badly lopsided deal. The lower bound is the one doing the
// work — it fails the moment intent stops caring who is batting.
check('the striker gets the better exchange', exchange(sEff) / exchange(tEff), 1.8, 12, (v) => v.toFixed(1) + '×')

const dEff = (skill) => intentEffect(intentPush('defend'), skill, 60)
check('blocking works for a good player', dEff(85).wicket, 0.70, 0.88, (v) => v.toFixed(2))
check('...and barely helps a tailender', dEff(25).wicket, 0.88, 0.98, (v) => v.toFixed(2))

// Intent has to move the actual innings, not just the multipliers.
const chaseOrder = autoBattingOrder(BAGSHOT_XI)
/** Tell everybody the same thing from ball one. */
const everyone = (intent) => chaseOrder.map((p) => ({ at: 0, playerId: p.id, intent }))
const chaseWith = (orders, target) => {
  const runs = [], wkts = []
  for (let i = 0; i < 700; i++) {
    const opp = evenOpponents[i % evenOpponents.length]
    const inn = simulateBattingInnings(opp, chaseOrder, target + 1, i * 7919 + 5, undefined, orders)
    runs.push(inn.runs); wkts.push(inn.wickets)
  }
  return { runs: mean(runs), wkts: mean(wkts) }
}
const defended = chaseWith(everyone('defend'), 400)   // unreachable, so they just bat
const attacked = chaseWith(everyone('attack'), 400)
check('attack scores more than defend', attacked.runs - defended.runs, 25, 200, (v) => `+${Math.round(v)}`)
check('...and loses more wickets', attacked.wkts - defended.wkts, 0.4, 5, (v) => `+${v.toFixed(2)}`)

// ...and orders are **per batter**. Tell the top three to attack and the rest
// to block and the innings has to land between the two extremes — if it lands
// on one of them, "per batter" is one team setting wearing a disguise.
const split = chaseWith(
  chaseOrder.map((p, i) => ({ at: 0, playerId: p.id, intent: i < 3 ? 'attack' : 'defend' })),
  400,
)
check(
  'orders are per batter, not per side',
  split.runs, defended.runs + 8, attacked.runs - 8, (v) => Math.round(v),
)
console.log(`  \x1b[90mall defend ${defended.runs.toFixed(0)} · top three attack ${split.runs.toFixed(0)} · all attack ${attacked.runs.toFixed(0)}\x1b[0m`)

// A break re-simulates the whole innings with a longer log. That is only honest
// if everything before the ball you changed comes out identical — the entire
// interactive design rests on it, and now that orders are stamped in balls
// rather than blocks, the guarantee has to hold to the ball.
let prefixDrift = 0
for (let i = 0; i < 200; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const seed = i * 104729 + 11
  const base = [{ at: 0, playerId: chaseOrder[0].id, intent: 'push' }]
  const before = simulateBattingInnings(opp, chaseOrder, 190, seed, undefined, base)
  // Speak to somebody halfway through, exactly as a wicket break does.
  const cut = 27 * RULES.ballsPerOver
  const after = simulateBattingInnings(opp, chaseOrder, 190, seed, undefined, [
    ...base,
    ...chaseOrder.map((p) => ({ at: cut, playerId: p.id, intent: 'attack' })),
  ])
  for (const a of before.overSummaries) {
    if (a.fromBall >= cut) break
    const b = after.overSummaries.find((o) => o.over === a.over)
    if (!b) continue
    if (a.total !== b.total || a.totalWkts !== b.totalWkts || a.balls.join() !== b.balls.join()) {
      prefixDrift++
    }
  }
}
check('re-simulation keeps the earlier balls', prefixDrift, 0, 0, (v) => v)

// An order given at a wicket has to reach the new man's **first** ball. Play
// stops on the wicket rather than at the end of the over for exactly this
// reason: otherwise he faces up to five deliveries under somebody else's
// instructions before anybody speaks to him.
//
// Note this can't be checked ball for ball. An order moves the *probabilities*,
// not the outcomes — the same roll often lands in the same bucket either way,
// so "the very next ball must differ" fails two thirds of the time for a
// perfectly correct engine. What it must do is bite when it's given, so compare
// the same order given at the wicket against given at the end of that over.
let prefixLeak = 0, timingBit = 0, wicketsTested = 0
for (let i = 0; i < 400; i++) {
  const opp = evenOpponents[i % evenOpponents.length]
  const seed = i * 7919 + 31
  const plain = simulateBattingInnings(opp, chaseOrder, 400, seed)
  const fall = plain.fow.find((f) => f.incoming !== undefined && f.ball > 30)
  if (!fall) continue
  const over = plain.overSummaries.find(
    (o) => o.fromBall < fall.ball && o.fromBall + o.balls.length >= fall.ball,
  )
  // Only interesting when he actually has balls left to face in that over.
  const endOfOver = over ? over.fromBall + over.balls.filter((t) => t !== 'wd' && t !== 'nb').length : 0
  if (!over || endOfOver - fall.ball < 2) continue
  wicketsTested++

  const at = (ball) => simulateBattingInnings(opp, chaseOrder, 400, seed, undefined,
    [{ at: ball, playerId: fall.incoming.playerId, intent: 'defend' }])
  const onTime = at(fall.ball)
  const late = at(endOfOver)

  // Every over that *finished* before the wicket is untouched. The over the
  // wicket falls in isn't, and mustn't be — that's the point.
  for (const a of plain.overSummaries) {
    if (a.fromBall + a.balls.length > fall.ball) break
    const b = onTime.overSummaries.find((o) => o.over === a.over)
    if (b && a.balls.join() !== b.balls.join()) prefixLeak++
  }
  if (onTime.runs !== late.runs || onTime.wickets !== late.wickets) timingBit++
}
check('a wicket order never leaks backwards', prefixLeak, 0, 0, (v) => v)
// The floor is low on purpose and the arithmetic says why: most of these
// wickets leave only two or three balls in the over, and a single ball changes
// its outcome maybe one time in eight even under a completely different order,
// because the roll has to cross a bucket boundary to show up at all. Two balls
// at one in eight is about a fifth. What would fail here is the thing worth
// catching — an order that quietly doesn't apply until the next over.
check(
  'and when it lands changes the innings',
  wicketsTested === 0 ? 0 : (timingBit / wicketsTested) * 100, 10, 100, (v) => v.toFixed(0) + '%',
)
console.log(`  \x1b[90m${wicketsTested} wickets with balls left in the over\x1b[0m`)

console.log('\n\x1b[1mFresh air and squad churn\x1b[0m')
check('fresh air games per match', mean(freshAirPerMatch), 0.5, 3, (v) => v.toFixed(2))
check('form stays in range', formOutOfRange, 0, 0, (v) => v)
// Squad-wide form now sits *below* neutral by design: only eleven play each
// week and everyone else goes stale, so a 27-man squad averages down. What
// matters is that it settles rather than collapsing to the rust floor.
check('squad form settles below neutral', mean(seasonForms_), 34, 48, (v) => v.toFixed(1))
check('fallouts per season', seasonFallouts / SEASONS, 2, 11, (v) => v.toFixed(1))
check('never short of a legal XI', seasonUnpickable, 0, 0, (v) => v)

rmSync(outdir, { recursive: true, force: true })

console.log(
  failures === 0
    ? '\n\x1b[32m\x1b[1mAll checks passed.\x1b[0m\n'
    : `\n\x1b[31m\x1b[1m${failures} check(s) failed.\x1b[0m\n`,
)
process.exit(failures === 0 ? 0 : 1)
