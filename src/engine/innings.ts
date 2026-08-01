import {
  blockOf, fieldAt, fieldPush, intentPush, orderFor, phaseOf, RING_PUSH, RULES,
} from '../data/types'
import type {
  BallEvent, BatterCard, BowlerCard, Dismissal, DismissalKind, Extras, FieldOrder, FowEntry,
  InningsResult, Order, OverSummary, Player, Rota,
} from '../data/types'
import {
  clamp, duel, makeBatterState, makeBowlerState, swingBoost,
  RUNS_DAMPING, SWING_WINDOW, WICKET_DAMPING,
} from './ratings'
import type { BatterState, BowlerState } from './ratings'
import { autoField, autoIntent } from './ai'
import { hashString, makeRng, pickIndex, weighted } from './rng'
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
  /**
   * What each batter was told, and when. Only read when chasing — a side
   * setting a total plays to its own judgement.
   *
   * A batter with nothing said to him reads the game for himself off the live
   * state. That covers the opposition, the auto manager, and everyone ahead of
   * wherever the breaks have got to.
   */
  orders?: Order[]
  /** Where the fielders were told to stand, and when. Filled the same way. */
  fields?: FieldOrder[]
  /**
   * Tracked season form by player id, for either side. Absent in a friendly,
   * where the streaky per-innings roll is used instead.
   */
  forms?: Record<string, number>
  rng: Rng
  /**
   * Seed for the per-player form rolls.
   *
   * These deliberately do *not* come out of `rng`. Who is in the attack now
   * changes mid-innings — that's the whole point of picking bowlers a block at
   * a time — and drawing their form from the ball stream meant adding a sixth
   * bowler at the twenty-seventh over shifted every delivery back to the first,
   * silently re-bowling overs you had already watched. Each player rolls from
   * his own stream instead, so the ball sequence depends only on the balls.
   */
  stateSeed: number
}

// ---------------------------------------------------------------- base rates
//
// Per legal ball, for an average batter (60) against an average bowler (60).
//
// Tuned to **Division 6 West**, where par is 160-200 rather than the 210-230
// these used to produce. That earlier target was what good limited-overs
// cricket looks like; this is what Saturday afternoon in Surrey actually looks
// like. Boundaries took most of the cut — village outfields are slow, the
// ropes are long, and runs come in ones far more than in fours.
//
// Median first innings ~171, middle half 145-200. See scripts/bench.mjs.
//
// `wicket` came down from 0.0235 when the new ball was made to matter. The
// swing boost and the non-opener penalty both add wickets in the first dozen
// overs; this pays for them, so the total falling across an innings is
// unchanged and only *when* they fall has moved.

const BASE = {
  one: 0.2484,
  two: 0.0478,
  three: 0.0055,
  four: 0.0460,
  six: 0.00846,
  wicket: 0.0315,
} as const

const PHASE = {
  powerplay: { boundary: 1.05, wicket: 1.00, single: 0.92 },
  middle: { boundary: 0.88, wicket: 1.00, single: 1.06 },
  death: { boundary: 1.45, wicket: 1.40, single: 0.98 },
} as const

/**
 * What a seamer and a spinner are actually *for*.
 *
 * Multiplies the phase rates above, so the same DEF and ATT produce a different
 * innings depending on who is holding the ball:
 *
 *   pace   owns the new ball and the death, leaks through the middle once the
 *          shine has gone and the batters are in
 *   spin   gets carted in the powerplay — there's a reason nobody opens with a
 *          spinner — squeezes hard through the middle, and is a liability once
 *          the batters start swinging at the end
 *
 * Spin's middle-over squeeze got sharper when confidence replaced the old
 * "a spinner gets the set batter" wrinkle. That wrinkle was where a lot of
 * spin's value lived; without it the numbers have to carry it directly.
 *
 * Roughly balanced across a whole innings — an all-pace and an all-spin attack
 * on identical ratings concede within a couple of runs of each other — so this
 * changes *when* a bowler is worth having rather than making one type flatly
 * better. The bench guards that; widening these numbers without checking it is
 * how you accidentally make spin strictly worse and delete half the decision.
 *
 * The amplitude here is deliberately large. Narrow versions of this table and of
 * `swingBoost` were most of why the bowling plan didn't matter: a good
 * deployment beat a thoughtless one by two and a half runs, so the screen with
 * the most controls in the game governed about 1% of an innings. It's about
 * fourteen runs now, and getting a single call wrong — opening with the spinner,
 * holding the swing bowlers back — costs between seven and eighteen.
 */
const TYPE = {
  pace: {
    powerplay: { boundary: 0.90, wicket: 1.20 },
    middle: { boundary: 1.10, wicket: 0.90 },
    death: { boundary: 0.92, wicket: 1.16 },
  },
  spin: {
    powerplay: { boundary: 1.22, wicket: 0.82 },
    middle: { boundary: 0.84, wicket: 1.16 },
    death: { boundary: 1.30, wicket: 0.80 },
  },
} as const

/**
 * Getting in.
 *
 * The main story of a batting innings, and for a long time the engine barely
 * had it: a new batter was 40% more likely to get out for his first six balls
 * and after that nothing changed. So everybody scored the same 8 and the
 * distribution came out with a 39% bulge between one and nine.
 *
 * Now confidence runs the whole way from walking out to fully in, and it is a
 * three-fold swing in risk — the first ball is roughly twice as dangerous as
 * the baseline, a set batter a little over half. Most of it is won early:
 * survive a dozen balls and you have done the hard part.
 *
 * That is what makes the field decision real. A new man is there to be had and
 * a set one isn't, so the same attacking field is a good idea against one and an
 * expensive one against the other — and losing a set batter genuinely hurts,
 * because whoever replaces him starts again at the bottom of the curve.
 */
const SET_AT_BALLS = 26
const NEW_RISK = 1.05
const SET_RISK = 0.52
const NEW_SCORING = 0.55
const SET_SCORING = 1.18

/**
 * How settled a batter is, 0 walking out to 1 fully in.
 *
 * Squared easing so the curve is steep at the start and flattens: about half way
 * in after eight balls, three quarters after thirteen.
 */
export function confidence(balls: number): number {
  const t = clamp(balls / SET_AT_BALLS, 0, 1)
  return 1 - (1 - t) * (1 - t)
}

/**
 * ...and how freely he's scoring, which is a different and much faster curve.
 *
 * A batter will nudge a single off his third ball long before he's happy
 * driving, and tying the two together is what produced a 22% duck rate: hold
 * scoring down for as long as you hold safety down and a new man sits on nought
 * for twenty balls, which is twenty chances to be dismissed for nought.
 */
const SCORING_AT_BALLS = 12
const scoringConfidence = (balls: number) => Math.sqrt(clamp(balls / SCORING_AT_BALLS, 0, 1))

/**
 * Nobody stays at their sharpest forever.
 *
 * Without this the curve only ever runs one way, so a batter who got in stayed
 * twice as hard to dismiss for the rest of the afternoon and the innings came
 * out polarised: a fat bulge of single figures and a handful of ninety-odds,
 * with almost nothing in the twenties and thirties where club cricket actually
 * lives. Getting out having got in is the most familiar dismissal there is.
 */
const LAPSE_PER_BALL = 0.007

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * What it costs to face the new ball without being an opener.
 *
 * Seeing off the shine is a different discipline from batting in the middle
 * overs, and a middle-order player pushed up carries about a third more risk in
 * the first over of it. Fades on the same twelve-over curve as the swing itself.
 *
 * Deliberately applied to *whoever is facing*, not to slots one and two — lose
 * both openers cheaply and your number four is exposed to the new ball whether
 * you planned it that way or not, which is exactly what happens on a Saturday.
 */
const NON_OPENER_RISK = 0.35

/**
 * ...and what a specialist is worth doing it.
 *
 * Being an opener has to be a positive, not merely the absence of a penalty.
 * Without this the top of the order was strictly the worst place to bat — a
 * number five outscored an opener by three runs, which is the wrong way round
 * in every real scorebook, because openers face by far the most deliveries.
 */
const OPENER_EDGE = 0.34

/** How new the ball still is, 1 at the start and 0 once the shine has gone. */
const newBallShine = (over: number) => clamp(1 - (over - 1) / SWING_WINDOW, 0, 1)

/**
 * What an instruction is actually worth to the man carrying it out.
 *
 * Intent is how many shots he plays. Turning that into runs takes power, and
 * surviving it takes technique — so the same order is a good trade for one
 * batter and a terrible one for another. That asymmetry is the whole point:
 *
 *   ATTACK  a 90-PWR / 83-SKILL striker  ~ +100% boundaries for  +28% risk
 *   ATTACK  a tailender                  ~  +35% boundaries for  +77% risk
 *   DEFEND  an 82-SKILL batter           ~ cuts his risk by about a quarter
 *   DEFEND  a 35-SKILL bowler            ~ cuts it by a tenth; he's out anyway
 *
 * Defending is symmetrical on the run side — anybody can stop playing shots —
 * so only the upside is scaled by power.
 */
const EDGE = (v: number) => clamp(v / 60, 0.5, 1.5)
/** What attacking costs, before the batter's technique is priced in. */
const ATTACK_RISK = 0.55
/** How much blocking is worth, before his technique is priced in. */
const DEFEND_SAFETY = 0.50

export function intentEffect(push: number, skill: number, pwr: number) {
  const d = push - 1
  const pwrEdge = EDGE(pwr)
  const skillEdge = EDGE(skill)
  return {
    // Playing more shots only pays if you can hit them.
    boundary: d > 0 ? 1 + d * pwrEdge : 1 + d,
    // ...and only a good player can do it without getting out.
    wicket: d > 0
      ? 1 + (d * ATTACK_RISK) / skillEdge
      : 1 + d * DEFEND_SAFETY * skillEdge,
    // Hard hitting costs you the strike rotation; blocking gives some back.
    single: clamp(1 - d * 0.16, 0.78, 1.18),
  }
}

/**
 * What a field setting is worth to the man bowling to it.
 *
 * The bowling side's half of the intent decision, and it works the same way:
 * the setting is how many men are up, not how many wickets you get, and turning
 * that into wickets takes ATT while surviving the gaps it leaves takes DEF.
 *
 *   ATTACK  behind an 88-ATT strike bowler ~ +58% wickets for +36% boundaries
 *   ATTACK  behind a 45-ATT part-timer     ~ +33% wickets for the same +36%
 *   SPREAD  behind an 83-DEF stock bowler  ~ cuts boundaries by about a third
 *   SPREAD  behind a 40-DEF trundler       ~ cuts them by a sixth; he'll be hit anyway
 *
 * Singles are the honest cost on both sides. A ring field is the tightest thing
 * there is; bring the catchers in *or* push the sweepers back and they milk you
 * for ones, which is why CONTAIN is the baseline rather than SPREAD.
 */
/** What men round the bat buy, before the bowler's penetration is priced in. */
const ATTACK_FIELD = 0.31
/** ...and what they cost, which is the same whoever is bowling. */
const FIELD_GAPS = 0.34
/** What pushing everyone back saves, before his discipline is priced in. */
const SPREAD_SAVING = 0.44
/** ...and what it costs in wickets, which is again the same for everyone. */
const SPREAD_TOOTHLESS = 0.55
/** How much any field other than a ring leaks in ones. */
const SINGLE_LEAK = 0.13

/**
 * ...and it depends just as much on *who is in*.
 *
 * Men round the bat are a bargain against someone who has just walked out and
 * an expensive indulgence against someone who is set — he'll simply hit through
 * the gaps you've left. Pushing everyone back is the other way round: pointless
 * against a new batter who isn't going to clear the ring anyway, and the right
 * call once somebody is away.
 *
 * Without this, attacking was flatly the best field at every moment of every
 * innings, which is no decision at all. It's also why the attack screen shows
 * you how set the two men are before it asks.
 */
const NEW_MAN_BONUS = 0.45
const SET_MAN_COST = 0.50

export function fieldEffect(push: number, def: number, att: number, settled = 0.5) {
  const d = push - 1
  // 1 against a new batter, 0 against a set one.
  const fresh = clamp(1 - settled, 0, 1)
  return {
    // Catchers only pay for a bowler who finds the edge — and only against
    // somebody who might edge it.
    wicket: d > 0
      ? 1 + d * ATTACK_FIELD * EDGE(att) * (1 - NEW_MAN_BONUS + NEW_MAN_BONUS * 2 * fresh)
      : 1 + d * SPREAD_TOOTHLESS,
    // ...and the gaps they leave cost most against a man who can find them.
    boundary: d > 0
      ? 1 + d * FIELD_GAPS * (1 - SET_MAN_COST + SET_MAN_COST * 2 * settled)
      : 1 + d * SPREAD_SAVING * EDGE(def) * (0.6 + 0.8 * settled),
    // Tightest in the ring, leakier the further either way you go.
    single: clamp(1 + Math.abs(push - RING_PUSH) * SINGLE_LEAK, 1, 1.22),
  }
}

/**
 * Relative frequency of each way of getting out, by bowler type.
 *
 * Seamers bowl people and trap them in front; spinners get catches in the ring
 * and the occasional stumping. Nobody is stumped off a seamer — `makeDismissal`
 * rescores that as caught behind if it ever slips through.
 */
const DISMISSALS_BY_TYPE = {
  pace: [
    ['c', 0.40], ['b', 0.28], ['lbw', 0.17],
    ['run out', 0.08], ['c & b', 0.05], ['st', 0.02],
  ],
  spin: [
    ['c', 0.46], ['b', 0.18], ['lbw', 0.14],
    ['run out', 0.08], ['c & b', 0.05], ['st', 0.09],
  ],
} as const satisfies Record<string, readonly (readonly [DismissalKind, number])[]>

/** Chances kept down are chances put down. */
const DROP_CHANCE: Partial<Record<DismissalKind, number>> = {
  c: 0.085, 'c & b': 0.05, st: 0.045,
}

const TEAM_MILESTONES = [50, 100, 150, 200, 250, 300, 350, 400]

export const formatOvers = (balls: number) =>
  `${Math.floor(balls / RULES.ballsPerOver)}.${balls % RULES.ballsPerOver}`

const phaseFor = (over: number) => PHASE[phaseOf(over)]

// ---------------------------------------------------------------- the innings

export function simulateInnings(input: InningsInput): InningsResult {
  const { battingOrder, fieldingXI, rota, target, rng, forms } = input
  const chasing = target !== null
  const orders = input.orders ?? []
  const fields = input.fields ?? []

  /** One private stream per player, so nobody's form depends on anyone else's. */
  const formRng = (p: Player) => makeRng((hashString(p.id) ^ input.stateSeed) >>> 0)

  const batters: BatterState[] = battingOrder.map(
    (p) => makeBatterState(p, formRng(p), forms?.[p.id]),
  )
  const cards: BatterCard[] = battingOrder.map((p, i) => ({
    playerId: p.id, name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0,
    out: null, batted: i < 2,
  }))

  const bowlerStates = new Map<string, BowlerState>()
  const bowlerCards = new Map<string, BowlerCard>()
  for (const id of new Set(rota)) {
    const p = fieldingXI.find((x) => x.id === id)
    if (!p) continue
    bowlerStates.set(id, makeBowlerState(p, formRng(p), forms?.[p.id]))
    bowlerCards.set(id, {
      playerId: id, name: p.name, balls: 0, maidens: 0,
      runs: 0, wickets: 0, wides: 0, noBalls: 0, dots: 0,
    })
  }

  // Somebody has to keep. If no specialist is available the gloves go to the
  // last man, and it shows: more byes, and more chances go down behind.
  const specialist = fieldingXI.find((p) => p.wk)
  const keeper = specialist ?? fieldingXI[fieldingXI.length - 1]
  const standIn = specialist === undefined

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
    // What this bowler is for: a seamer's new ball and death, a spinner's
    // middle-over squeeze. Same ratings, different innings.
    const kind = bowler.player.bowlType === 'spin' ? 'spin' : 'pace'
    const type = TYPE[kind][phaseOf(over)]
    // The new ball is worth something for a dozen overs, and only to a bowler
    // who can actually use it.
    const swing = swingBoost(bowler.player.swing, over)
    const effAtt = bowler.att * swing.att
    const effDef = bowler.def * swing.def
    // How much of the new ball is left, for the non-opener penalty below.
    const shine = newBallShine(over)

    const fromBall = balls
    let ballsThisOver = 0
    let runsThisOver = 0
    let wktsThisOver = 0
    let bowlerRunsThisOver = 0
    let freeHit = false
    /** Scorebook strip for this over — one token per delivery, extras included. */
    const ballTokens: string[] = []

    while (ballsThisOver < RULES.ballsPerOver && !inningsOver()) {
      const batter = batters[striker]
      const card = cards[striker]

      // --- how hard is the batting side trying right now? -----------------
      //
      // In a chase this is entirely the manager's call, block by block. There
      // is no rate-driven autopilot underneath: tell them to block out a chase
      // you could have won and they will, which is what makes the required rate
      // worth reading. Setting a total is still the side's own judgement.
      let push: number
      if (chasing) {
        // Per batter, and only the man on strike. Anyone nobody has spoken to
        // reads the game for himself off the live state — including how set he
        // is, because a man who has just walked in plays himself in. Still a
        // pure function of the score, so re-simulation stays reproducible.
        const called = orderFor(orders, batter.player.id, balls)
        push = intentPush(
          called
          ?? autoIntent(target! - runs, RULES.balls - balls, wickets, confidence(card.balls)),
        )
      } else {
        // Bat to be about seven down at the close. Wickets in hand licence you
        // to push; wickets lost pull you back.
        const parLost = 7 * (balls / RULES.balls)
        push = clamp(1 + (parLost - wickets) * 0.055, 0.74, 1.28)
      }

      const eff = intentEffect(push, batter.player.bat.skill, batter.player.bat.pwr)
      const aggBoundary = eff.boundary
      const aggSingle = eff.single
      const aggWicket = eff.wicket

      // --- extras come before anything else -------------------------------
      const looseness = 1 / Math.pow(effDef, 0.6)
      if (rng() < 0.030 * looseness) {
        runs++; extras.wides++; extras.total++
        bowlerCard.wides++; bowlerCard.runs++
        runsThisOver++; bowlerRunsThisOver++
        ballTokens.push('wd')
        continue
      }
      if (rng() < 0.0075 * looseness) {
        runs++; extras.noBalls++; extras.total++
        bowlerCard.noBalls++; bowlerCard.runs++
        runsThisOver++; bowlerRunsThisOver++
        freeHit = true
        ballTokens.push('nb')
        continue
      }

      // --- the two duels ---------------------------------------------------
      const wicketFactor = duel(effAtt, batter.sk, WICKET_DAMPING)
      const runsFactor = duel(batter.pw, effDef, RUNS_DAMPING)

      // Getting in. Twice as dangerous on the first ball as at the baseline,
      // a little over half as dangerous once he's properly in — and most of
      // that is won inside the first dozen balls.
      const conf = confidence(card.balls)
      const lapse = 1 + LAPSE_PER_BALL * Math.max(0, card.balls - SET_AT_BALLS)
      const settleWicket = lerp(NEW_RISK, SET_RISK, conf) * lapse

      // Where the fielders are. Read per ball rather than per over, because a
      // wicket falls mid-over and bringing the catchers in for the new man is
      // the whole reason play stops there. Anything nobody has called is read
      // off the score, so the opposition and the auto manager captain
      // themselves rather than standing in one shape all afternoon.
      const setting = fieldAt(fields, balls)
        ?? autoField(blockOf(over), runs, wickets)
      // ...and it's priced against the man actually facing it.
      const field = fieldEffect(
        fieldPush(setting), bowler.player.bowl.def, bowler.player.bowl.att, conf,
      )
      const settleRuns = lerp(NEW_SCORING, SET_SCORING, scoringConfidence(card.balls))

      // Facing the new ball is a specialist's job. Anyone else is out of his
      // depth until it stops doing anything.
      const newBall = batter.player.opener
        ? 1 - OPENER_EDGE * shine
        : 1 + NON_OPENER_RISK * shine

      let pWicket =
        BASE.wicket * wicketFactor * phase.wicket * type.wicket * field.wicket
        * aggWicket * settleWicket * newBall
      let pFour =
        BASE.four * runsFactor * phase.boundary * type.boundary * field.boundary
        * aggBoundary * settleRuns
      let pSix =
        BASE.six * Math.pow(runsFactor, 1.15) * phase.boundary * type.boundary * field.boundary
        * aggBoundary * settleRuns
      const rot = Math.pow(runsFactor, 0.25)
      let pOne = BASE.one * rot * phase.single * field.single * aggSingle
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
        const how = weighted(rng, DISMISSALS_BY_TYPE[kind])
        let dropRate = DROP_CHANCE[how]
        // A stand-in keeper shells the ones behind the stumps.
        if (standIn && dropRate !== undefined && (how === 'st' || how === 'c')) {
          dropRate *= 1.9
        }

        if (dropRate !== undefined && rng() < dropRate) {
          // Put down. Give the batter a run or two for the trouble.
          const gift = rng() < 0.55 ? 1 : rng() < 0.8 ? 2 : 4
          runs += gift; card.runs += gift
          runsThisOver += gift; bowlerRunsThisOver += gift
          bowlerCard.runs += gift
          if (gift === 4) card.fours++
          const grassed = how === 'st'
            ? kind === 'spin'
              ? `${keeper.name} misses the stumping`
              : `${keeper.name} shells one behind the stumps`
            : `${fielderOf(fieldingXI, bowler.player, keeper, how, rng).name} puts down ${card.name}`
          say('drop', `DROPPED! ${grassed}`, over)
          // A let-off is scored as the runs taken — the commentary carries the
          // drama, the strip just records what went on the board.
          ballTokens.push(String(gift))
          if (gift % 2 === 1) [striker, nonStriker] = [nonStriker, striker]
          continue
        }

        wickets++
        wktsThisOver++
        const dismissal = makeDismissal(how, fieldingXI, bowler.player, keeper, rng)
        card.out = dismissal
        if (how !== 'run out') bowlerCard.wickets++

        const next = wickets < RULES.wickets ? battingOrder[nextIn] : undefined
        fow.push({
          score: runs, wkt: wickets, batter: card.name, at: formatOvers(balls),
          // The exact ball, so play can stop on it rather than at the end of
          // the over — otherwise the new man faces up to five deliveries before
          // anybody gets to speak to him.
          ball: balls,
          incoming: next ? { playerId: next.id, name: next.name } : undefined,
        })
        say('wicket', `OUT! ${card.name} ${dismissal.text} — ${card.runs} (${card.balls})`, over)
        ballTokens.push('W')

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
        if (rng() < (standIn ? 0.038 : 0.015)) {
          const bye = weighted(rng, [[1, 0.85], [2, 0.10], [4, 0.05]] as const)
          const leg = rng() < 0.65
          runs += bye
          if (leg) extras.legByes += bye
          else extras.byes += bye
          extras.total += bye
          runsThisOver += bye
          ballTokens.push(`${bye}${leg ? 'lb' : 'b'}`)
          if (bye % 2 === 1) [striker, nonStriker] = [nonStriker, striker]
        } else {
          ballTokens.push('.')
        }
      } else {
        runs += scored
        card.runs += scored
        runsThisOver += scored
        bowlerRunsThisOver += scored
        bowlerCard.runs += scored
        ballTokens.push(String(scored))
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

    // Snapshot the crease *before* the ends change below, so `onStrike` means
    // "faced the last ball" rather than "will face the next one".
    const atCrease = [striker, nonStriker]
      .filter((i) => i < cards.length && cards[i].batted && cards[i].out === null)
      .map((i) => ({
        playerId: cards[i].playerId,
        name: cards[i].name,
        runs: cards[i].runs,
        balls: cards[i].balls,
        onStrike: i === striker,
        settled: confidence(cards[i].balls),
      }))

    overSummaries.push({
      over,
      bowlerId: bowlerCard.playerId,
      bowlerName: bowlerCard.name,
      runs: runsThisOver,
      wkts: wktsThisOver,
      total: runs,
      totalWkts: wickets,
      fromBall,
      balls: ballTokens,
      atCrease,
      // A copy, not the live card — it has to say what he had bowled *by then*.
      figures: {
        balls: bowlerCard.balls,
        maidens: bowlerCard.maidens,
        runs: bowlerCard.runs,
        wickets: bowlerCard.wickets,
      },
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

function fielderOf(
  xi: Player[], bowler: Player, keeper: Player, kind: DismissalKind, rng: Rng,
): Player {
  if (kind === 'st') return keeper
  // Roughly a fifth of catches are taken behind the stumps.
  if (kind === 'c' && rng() < 0.2) return keeper
  const others = xi.filter((p) => p.id !== bowler.id)
  if (others.length === 0) return keeper
  return others[pickIndex(rng, others.length)]
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
      return {
        kind, bowlerName: bowler.name, fielderName: bowler.name, fielderId: bowler.id,
        text: `c & b ${bowler.name}`,
      }
    case 'st': {
      // Nobody gets stumped off a seamer. Score it as caught behind instead.
      if (bowler.bowlType !== 'spin') {
        return {
          kind: 'c', bowlerName: bowler.name, fielderName: keeper.name, fielderId: keeper.id,
          text: `c ${keeper.name} b ${bowler.name}`,
        }
      }
      return {
        kind, bowlerName: bowler.name, fielderName: keeper.name, fielderId: keeper.id,
        text: `st ${keeper.name} b ${bowler.name}`,
      }
    }
    case 'run out': {
      const f = fielderOf(xi, bowler, keeper, 'c', rng)
      return { kind, fielderName: f.name, fielderId: f.id, text: `run out (${f.name})` }
    }
    case 'c':
    default: {
      const f = fielderOf(xi, bowler, keeper, 'c', rng)
      return {
        kind: 'c', bowlerName: bowler.name, fielderName: f.name, fielderId: f.id,
        text: `c ${f.name} b ${bowler.name}`,
      }
    }
  }
}
