import { RULES } from '../data/types'
import type {
  BallEvent, BatterCard, BowlerCard, Dismissal, DismissalKind,
  Extras, FowEntry, InningsResult, OverSummary, Player, Rota,
} from '../data/types'
import {
  clamp, duel, makeBatterState, makeBowlerState,
  RUNS_DAMPING, WICKET_DAMPING,
} from './ratings'
import type { BatterState, BowlerState } from './ratings'
import { pickIndex, weighted } from './rng'
import type { Rng } from './rng'

/**
 * The ball-by-ball engine. Both innings run through here — the only difference
 * is whether `target` is set, which switches the batting side from "post a
 * total" tempo to "chase it" tempo.
 *
 * Nothing about the outcome is decided in advance. The total is whatever the
 * balls produce.
 */

export interface InningsInput {
  battingTeamName: string
  fieldingTeamName: string
  /** Eleven players, in the order they will bat. */
  battingOrder: Player[]
  /** The fielding eleven — used for catchers and the keeper. */
  fieldingXI: Player[]
  /** One bowler id per over. */
  rota: Rota
  /** Runs required to win. Null in the first innings. */
  target: number | null
  rng: Rng
}

// ---------------------------------------------------------------- base rates
//
// Per legal ball, for an average batter (60) against an average bowler (60).
// Tuned so a 45-over innings lands around 210-230 — see scripts/bench.mjs.

const BASE = {
  one: 0.284,
  two: 0.064,
  three: 0.007,
  four: 0.069,
  six: 0.0155,
  wicket: 0.0225,
} as const

const PHASE = {
  powerplay: { boundary: 1.05, wicket: 1.10, single: 0.92 },
  middle: { boundary: 0.88, wicket: 0.92, single: 1.06 },
  death: { boundary: 1.45, wicket: 1.40, single: 0.98 },
} as const

/** Relative frequency of each way of getting out. */
const DISMISSALS: readonly (readonly [DismissalKind, number])[] = [
  ['c', 0.42], ['b', 0.25], ['lbw', 0.16],
  ['run out', 0.08], ['c & b', 0.05], ['st', 0.04],
]

/** Chances kept down are chances put down. */
const DROP_CHANCE: Partial<Record<DismissalKind, number>> = {
  c: 0.085, 'c & b': 0.05, st: 0.045,
}

const TEAM_MILESTONES = [50, 100, 150, 200, 250, 300, 350, 400]

export const formatOvers = (balls: number) =>
  `${Math.floor(balls / RULES.ballsPerOver)}.${balls % RULES.ballsPerOver}`

function phaseFor(over: number) {
  if (over <= RULES.powerplayUntil) return PHASE.powerplay
  if (over >= RULES.deathFrom) return PHASE.death
  return PHASE.middle
}

// ---------------------------------------------------------------- the innings

export function simulateInnings(input: InningsInput): InningsResult {
  const { battingOrder, fieldingXI, rota, target, rng } = input
  const chasing = target !== null

  const batters: BatterState[] = battingOrder.map((p, i) => makeBatterState(p, i + 1, rng))
  const cards: BatterCard[] = battingOrder.map((p, i) => ({
    playerId: p.id, name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0,
    out: null, batted: i < 2, outOfPosition: batters[i].outOfPosition,
  }))

  const bowlerStates = new Map<string, BowlerState>()
  const bowlerCards = new Map<string, BowlerCard>()
  for (const id of new Set(rota)) {
    const p = fieldingXI.find((x) => x.id === id)
    if (!p) continue
    bowlerStates.set(id, makeBowlerState(p, rng))
    bowlerCards.set(id, {
      playerId: id, name: p.name, balls: 0, maidens: 0,
      runs: 0, wickets: 0, wides: 0, noBalls: 0, dots: 0,
    })
  }

  const keeper = fieldingXI.find((p) => p.wk) ?? fieldingXI[fieldingXI.length - 1]

  const extras: Extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0 }
  const events: BallEvent[] = []
  const fow: FowEntry[] = []
  const overSummaries: OverSummary[] = []
  const seen = new Set<string>()

  let runs = 0
  let wickets = 0
  let balls = 0
  let striker = 0
  let nonStriker = 1
  let nextIn = 2

  const say = (type: BallEvent['type'], text: string, over: number) => {
    events.push({ ball: balls, over, type, text, score: runs, wkts: wickets })
  }

  const inningsOver = () =>
    balls >= RULES.balls ||
    wickets >= RULES.wickets ||
    (chasing && runs >= target!)

  for (let over = 1; over <= RULES.overs && !inningsOver(); over++) {
    const bowlerId = rota[over - 1]
    const bowler = bowlerStates.get(bowlerId)
    const bowlerCard = bowlerCards.get(bowlerId)
    if (!bowler || !bowlerCard) continue

    const phase = phaseFor(over)
    let ballsThisOver = 0
    let runsThisOver = 0
    let wktsThisOver = 0
    let bowlerRunsThisOver = 0
    let freeHit = false

    while (ballsThisOver < RULES.ballsPerOver && !inningsOver()) {
      const batter = batters[striker]
      const card = cards[striker]

      // --- how hard is the batting side trying right now? -----------------
      let aggression: number
      if (chasing) {
        const need = target! - runs
        const ballsLeft = RULES.balls - balls
        const reqRate = ballsLeft > 0 ? (need / ballsLeft) * 6 : 99
        aggression = clamp(reqRate / 5.0, 0.70, 2.20)
        if (aggression > 1 && reqRate <= 9) {
          // Wickets in hand buy you the right to take risks.
          const caution = clamp((RULES.wickets - wickets) / 4, 0.55, 1)
          aggression = 1 + (aggression - 1) * caution
        }
      } else {
        // Setting a total: bat to be about seven down at the close. Wickets in
        // hand licence you to push; wickets lost pull you back.
        const parLost = 7 * (balls / RULES.balls)
        aggression = clamp(1 + (parLost - wickets) * 0.055, 0.74, 1.28)
      }

      const aggBoundary = aggression
      const aggSingle = clamp(1.15 - aggression * 0.15, 0.75, 1.15)
      const aggWicket = clamp(0.5 + 0.5 * aggression, 0.6, 1.9)

      // --- extras come before anything else -------------------------------
      const looseness = 1 / Math.pow(bowler.def, 0.6)
      if (rng() < 0.030 * looseness) {
        runs++; extras.wides++; extras.total++
        bowlerCard.wides++; bowlerCard.runs++
        runsThisOver++; bowlerRunsThisOver++
        continue
      }
      if (rng() < 0.0075 * looseness) {
        runs++; extras.noBalls++; extras.total++
        bowlerCard.noBalls++; bowlerCard.runs++
        runsThisOver++; bowlerRunsThisOver++
        freeHit = true
        continue
      }

      // --- the two duels ---------------------------------------------------
      const wicketFactor = duel(bowler.att, batter.sk, WICKET_DAMPING)
      const runsFactor = duel(batter.pw, bowler.def, RUNS_DAMPING)

      // A new batter plays himself in.
      const faced = card.balls
      const settleRuns = faced >= 6 ? 1 : 0.55 + (faced / 6) * 0.45
      const settleWicket = faced >= 6 ? 1 : 1.40 - (faced / 6) * 0.40

      let pWicket = BASE.wicket * wicketFactor * phase.wicket * aggWicket * settleWicket
      let pFour = BASE.four * runsFactor * phase.boundary * aggBoundary * settleRuns
      let pSix = BASE.six * Math.pow(runsFactor, 1.15) * phase.boundary * aggBoundary * settleRuns
      const rot = Math.pow(runsFactor, 0.25)
      let pOne = BASE.one * rot * phase.single * aggSingle
      let pTwo = BASE.two * rot * aggSingle
      let pThree = BASE.three * rot

      if (freeHit) pWicket = 0
      pWicket = Math.min(pWicket, 0.35)
      const boundaries = pFour + pSix
      if (boundaries > 0.55) {
        const scale = 0.55 / boundaries
        pFour *= scale; pSix *= scale
      }
      const scoring = pWicket + pOne + pTwo + pThree + pFour + pSix
      if (scoring > 0.97) {
        const scale = 0.97 / scoring
        pWicket *= scale; pOne *= scale; pTwo *= scale
        pThree *= scale; pFour *= scale; pSix *= scale
      }

      // --- roll -------------------------------------------------------------
      const roll = rng()
      let outcome: 'W' | 0 | 1 | 2 | 3 | 4 | 6 = 0
      let acc = pWicket
      if (roll < acc) outcome = 'W'
      else if (roll < (acc += pOne)) outcome = 1
      else if (roll < (acc += pTwo)) outcome = 2
      else if (roll < (acc += pThree)) outcome = 3
      else if (roll < (acc += pFour)) outcome = 4
      else if (roll < (acc += pSix)) outcome = 6

      balls++
      ballsThisOver++
      card.balls++
      bowlerCard.balls++
      freeHit = false

      if (outcome === 'W') {
        const kind = weighted(rng, DISMISSALS)
        const dropRate = DROP_CHANCE[kind]

        if (dropRate !== undefined && rng() < dropRate) {
          // Put down. Give the batter a run or two for the trouble.
          const gift = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 4
          runs += gift; card.runs += gift
          runsThisOver += gift; bowlerRunsThisOver += gift
          bowlerCard.runs += gift
          if (gift === 4) card.fours++
          const grassed = kind === 'st'
            ? bowler.player.bowlType === 'spin'
              ? `${keeper.name} misses the stumping`
              : `${keeper.name} shells one behind the stumps`
            : `${fielderName(fieldingXI, bowler.player, keeper, kind, rng)} puts down ${card.name}`
          say('drop', `DROPPED! ${grassed}`, over)
          if (gift % 2 === 1) [striker, nonStriker] = [nonStriker, striker]
          continue
        }

        wickets++
        wktsThisOver++
        const dismissal = makeDismissal(kind, fieldingXI, bowler.player, keeper, rng)
        card.out = dismissal
        if (kind !== 'run out') bowlerCard.wickets++

        fow.push({
          score: runs, wkt: wickets, batter: card.name, at: formatOvers(balls),
        })
        say('wicket', `OUT! ${card.name} ${dismissal.text} — ${card.runs} (${card.balls})`, over)

        if (wickets >= RULES.wickets || nextIn >= battingOrder.length) break
        striker = nextIn
        cards[nextIn].batted = true
        nextIn++
        continue
      }

      // --- runs -------------------------------------------------------------
      const scored = outcome as 0 | 1 | 2 | 3 | 4 | 6

      if (scored === 0) {
        bowlerCard.dots++
        // Byes and leg byes: runs the bowler isn't charged for.
        if (rng() < 0.015) {
          const bye = weighted(rng, [[1, 0.85], [2, 0.10], [4, 0.05]] as const)
          const leg = rng() < 0.65
          runs += bye
          if (leg) extras.legByes += bye
          else extras.byes += bye
          extras.total += bye
          runsThisOver += bye
          if (bye % 2 === 1) [striker, nonStriker] = [nonStriker, striker]
        }
      } else {
        runs += scored
        card.runs += scored
        runsThisOver += scored
        bowlerRunsThisOver += scored
        bowlerCard.runs += scored
        if (scored === 4) card.fours++
        if (scored === 6) card.sixes++

        const key50 = `f${striker}`
        const key100 = `h${striker}`
        if (card.runs >= 100 && !seen.has(key100)) {
          seen.add(key100)
          say('ton', `💯 ${card.name} brings up a HUNDRED (${card.balls} balls)`, over)
        } else if (card.runs >= 50 && !seen.has(key50)) {
          seen.add(key50)
          say('fifty', `${card.name} reaches fifty (${card.balls} balls)`, over)
        }

        for (const m of TEAM_MILESTONES) {
          if (runs >= m && !seen.has(`t${m}`)) {
            seen.add(`t${m}`)
            say('team', `${m} up in ${formatOvers(balls)} overs`, over)
          }
        }

        if (chasing && runs >= target! && !seen.has('win')) {
          seen.add('win')
          say('win', `🏆 TARGET CHASED — ${runs}/${wickets}`, over)
        }

        if (scored % 2 === 1) [striker, nonStriker] = [nonStriker, striker]
      }
    }

    if (bowlerRunsThisOver === 0 && ballsThisOver === RULES.ballsPerOver) {
      bowlerCard.maidens++
      say('maiden', `Maiden over — ${bowlerCard.name}`, over)
    }

    overSummaries.push({
      over,
      bowlerName: bowlerCard.name,
      runs: runsThisOver,
      wkts: wktsThisOver,
      total: runs,
      totalWkts: wickets,
    })

    // Ends change at the end of every completed over.
    if (ballsThisOver === RULES.ballsPerOver) {
      ;[striker, nonStriker] = [nonStriker, striker]
    }
  }

  const allOut = wickets >= RULES.wickets
  const chased = chasing && runs >= target!

  return {
    teamName: input.battingTeamName,
    runs,
    wickets,
    balls,
    batting: cards,
    bowling: [...bowlerCards.values()].filter((b) => b.balls > 0 || b.wides > 0 || b.noBalls > 0),
    extras,
    fow,
    overSummaries,
    events,
    allOut,
    chased,
    target,
    runRate: balls > 0 ? (runs / balls) * 6 : 0,
  }
}

// ------------------------------------------------------------------- helpers

function fielderName(
  xi: Player[], bowler: Player, keeper: Player, kind: DismissalKind, rng: Rng,
): string {
  if (kind === 'st') return keeper.name
  // Roughly a fifth of catches are taken behind the stumps.
  if (kind === 'c' && rng() < 0.2) return keeper.name
  const others = xi.filter((p) => p.id !== bowler.id)
  if (others.length === 0) return keeper.name
  return others[pickIndex(rng, others.length)].name
}

function makeDismissal(
  kind: DismissalKind, xi: Player[], bowler: Player, keeper: Player, rng: Rng,
): Dismissal {
  switch (kind) {
    case 'b':
      return { kind, bowlerName: bowler.name, text: `b ${bowler.name}` }
    case 'lbw':
      return { kind, bowlerName: bowler.name, text: `lbw b ${bowler.name}` }
    case 'c & b':
      return { kind, bowlerName: bowler.name, fielderName: bowler.name, text: `c & b ${bowler.name}` }
    case 'st': {
      // Nobody gets stumped off a seamer. Score it as caught behind instead.
      if (bowler.bowlType !== 'spin') {
        return {
          kind: 'c', bowlerName: bowler.name, fielderName: keeper.name,
          text: `c ${keeper.name} b ${bowler.name}`,
        }
      }
      return {
        kind, bowlerName: bowler.name, fielderName: keeper.name,
        text: `st ${keeper.name} b ${bowler.name}`,
      }
    }
    case 'run out': {
      const f = fielderName(xi, bowler, keeper, 'c', rng)
      return { kind, fielderName: f, text: `run out (${f})` }
    }
    case 'c':
    default: {
      const f = fielderName(xi, bowler, keeper, 'c', rng)
      return {
        kind: 'c', bowlerName: bowler.name, fielderName: f,
        text: `c ${f} b ${bowler.name}`,
      }
    }
  }
}
