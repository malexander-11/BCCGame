import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BLOCK_OVERS, BREAK_OVERS, fieldAt, orderFor, RULES } from './data/types'
import type {
  BowlingPlan as Plan, Club, Field, FieldOrder, InningsResult, Intent, MatchResult,
  Order, Player,
} from './data/types'
import {
  autoBattingOrder, autoBlock, autoField, autoSelectXI, emptyPlan, openingIntent,
} from './engine/ai'
import { buildMatchResult, simulateBattingInnings, simulateFieldingInnings } from './engine/match'
import { oversBowled } from './engine/rota'
import { randomSeed } from './engine/rng'
import { DIV6_WEST } from './data/league'
import {
  createSeason, nextFixture, recordRound, seasonComplete, seasonForms,
} from './engine/season'
import type { Season as SeasonState } from './engine/season'
import { availablePlayers, unavailableMap } from './engine/availability'
import {
  loadLastXI, loadPrefs, loadRecord, loadSeason, loadSquad, recordMatch,
  resetSquad, saveLastXI, savePrefs, saveSeason, saveSquad, usingCustomSquad,
} from './storage'
import type { Record as SeasonRecord } from './storage'
import { fieldLabel, intentLabel, LiveField, LiveIntent } from './components/LiveOrders'
import { Home } from './screens/Home'
import { Season } from './screens/Season'
import { SeasonStats } from './screens/SeasonStats'
import { Selection } from './screens/Selection'
import { Attack } from './screens/Attack'
import { Sim } from './screens/Sim'
import { InningsBreak } from './screens/InningsBreak'
import { BattingOrder } from './screens/BattingOrder'
import { DrinksBreak } from './screens/DrinksBreak'
import { WicketBreak } from './screens/WicketBreak'
import { Result } from './screens/Result'
import { Squad } from './screens/Squad'

type Screen =
  | 'home' | 'squad' | 'season' | 'stats' | 'selection' | 'plan'
  | 'sim1' | 'wicket1' | 'break' | 'order' | 'sim2' | 'drinks' | 'wicket2' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [squad, setSquad] = useState<Player[]>(loadSquad)
  const [custom, setCustom] = useState(usingCustomSquad)
  const [record, setRecord] = useState<SeasonRecord>(loadRecord)
  const [season, setSeason] = useState<SeasonState | null>(loadSeason)
  const [prefs, setPrefs] = useState(loadPrefs)
  /** True while the current match is a league fixture rather than a friendly. */
  const [inLeague, setInLeague] = useState(false)

  const [opponent, setOpponent] = useState<Club | null>(null)
  const [seed, setSeed] = useState(randomSeed)
  const [xi, setXi] = useState<Player[]>([])
  /** Who bowls each nine-over block. Null means "nobody has called it yet". */
  const [plan, setPlan] = useState<Plan>(emptyPlan)
  /**
   * Where the fielders stand and what each batter is under orders to do —
   * both append-only logs stamped with the ball they were given on, so a
   * decision made at over 27 can never reach back and change over 3.
   *
   * Which is what lets either of them be changed from inside the playback, at
   * any point rather than only at a break: appending re-runs the innings, and
   * every ball already watched comes out identical.
   */
  const [fields, setFields] = useState<FieldOrder[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  /** What the openers are told before a ball is bowled, by id. */
  const [opening, setOpening] = useState<Record<string, Intent>>({})
  /** The block the attack screen is currently setting, 0-4. */
  const [block, setBlock] = useState(0)
  const [order, setOrder] = useState<Player[]>([])
  /** The ball we're stopped at, and which wicket stopped us. */
  const [drinksAt, setDrinksAt] = useState<number | null>(null)
  const [fallAt, setFallAt] = useState<number | null>(null)
  /** Balls already watched, so resuming after a break doesn't replay the chase. */
  const [watchedTo, setWatchedTo] = useState(0)
  /** ...and the same for the innings in the field. */
  const [watchedTo1, setWatchedTo1] = useState(0)
  const [first, setFirst] = useState<InningsResult | null>(null)
  const [second, setSecond] = useState<InningsResult | null>(null)
  const [result, setResult] = useState<MatchResult | null>(null)

  // Scroll back to the top on every screen change — long scorecards otherwise
  // drop you into the middle of the next screen.
  useEffect(() => { window.scrollTo({ top: 0 }) }, [screen])

  // ----------------------------------------------------------- browser back
  //
  // Without this the phone's back gesture leaves the app altogether and an
  // in-progress match is gone. One guard entry sits on the history stack
  // whenever we're off the home screen; back consumes it, we work out where to
  // go, and put another one back.

  const screenRef = useRef(screen)
  const guardRef = useRef(false)
  useEffect(() => { screenRef.current = screen }, [screen])

  /**
   * Where back goes from each screen. `null` means let the browser leave.
   *
   * Once the first innings has been bowled there is deliberately no route back
   * into selection or the plan: re-planning after seeing the total would be
   * bowling the innings twice. The sims instead treat back as SKIP, and the
   * innings break simply stays put rather than trapping you in a loop.
   */
  const backTarget = useCallback((from: Screen): Screen | null => {
    switch (from) {
      case 'home': return null
      case 'squad': return 'home'
      case 'season': return 'home'
      case 'stats': return 'season'
      case 'selection': return inLeague ? 'season' : 'home'
      // The attack screen is selection's next step before the toss and a
      // decision you have to make at every break after it — so back only goes
      // anywhere while it's still the new ball.
      case 'plan': return block === 0 ? 'selection' : 'plan'
      case 'sim1': return 'break'
      case 'break': return 'break'
      case 'order': return 'break'
      case 'sim2': return 'result'
      // A break is a decision you have to make — there's nowhere behind it, and
      // the balls it follows have already been bowled.
      case 'drinks': return 'drinks'
      case 'wicket1': return 'wicket1'
      case 'wicket2': return 'wicket2'
      case 'result': return inLeague ? 'season' : 'home'
    }
  }, [inLeague, block])

  const backTargetRef = useRef(backTarget)
  useEffect(() => { backTargetRef.current = backTarget }, [backTarget])

  useEffect(() => {
    const onPop = () => {
      guardRef.current = false          // the browser just consumed our guard
      const from = screenRef.current
      const to = backTargetRef.current(from)
      if (to === null) return           // already home — let them actually go
      window.history.pushState({ bccGuard: true }, '')
      guardRef.current = true
      if (to !== from) {
        if (to === 'home') setInLeague(false)
        setScreen(to)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (screen !== 'home' && !guardRef.current) {
      window.history.pushState({ bccGuard: true }, '')
      guardRef.current = true
    }
  }, [screen])

  const persistSquad = useCallback((next: Player[]) => {
    setSquad(next)
    saveSquad(next)
    setCustom(true)
  }, [])

  const doResetSquad = useCallback(() => {
    resetSquad()
    setSquad(loadSquad())
    setCustom(false)
  }, [])

  /**
   * Selection opens on the side you picked last week, in the order you picked
   * it, minus anyone now unavailable — so a settled side is a glance and a tap
   * rather than eleven decisions from nothing. It's your own last XI, not an
   * auto-optimal one, so every choice is still yours to change.
   *
   * With nothing saved — a first ever match — fall back to the best XI on
   * ratings, which is the shipped default team.
   */
  const startMatch = useCallback((club: Club, league = false) => {
    const pool = league && season ? availablePlayers(squad, season.availability) : squad
    const byId = new Map(pool.map((p) => [p.id, p]))
    const saved = loadLastXI()
      .map((id) => byId.get(id))
      .filter((p): p is Player => p !== undefined)
    // Gaps are deliberate: if three of last week's side are away you get eight
    // picked and three to fill, not three silent replacements.
    const preset = saved.length > 0 ? saved : autoSelectXI(pool)

    setOpponent(club)
    setInLeague(league)
    setSeed(randomSeed())
    setXi(preset)
    setOrder(preset)
    setPlan(emptyPlan())
    setFields([])
    setBlock(0)
    setOrders([])
    setOpening({})
    setWatchedTo(0)
    setWatchedTo1(0)
    setDrinksAt(null)
    setFallAt(null)
    setFirst(null)
    setSecond(null)
    setResult(null)
    setScreen('selection')
  }, [squad, season])

  const persistSeason = useCallback((next: SeasonState | null) => {
    setSeason(next)
    saveSeason(next)
  }, [])

  const openSeason = useCallback(() => {
    if (!season) persistSeason(createSeason(randomSeed(), squad))
    setScreen('season')
  }, [season, squad, persistSeason])

  /** Play the next league fixture yourself. */
  const playFixture = useCallback(() => {
    if (!season) return
    const fixture = nextFixture(season)
    const club = fixture && DIV6_WEST.find((c) => c.id === fixture.opponentId)
    if (club) startMatch(club, true)
  }, [season, startMatch])

  /** Hand the rest of the season to the auto manager. */
  const simRestOfSeason = useCallback(() => {
    if (!season) return
    let running = season
    while (!seasonComplete(running)) {
      const fixture = nextFixture(running)
      if (!fixture) break
      const club = DIV6_WEST.find((c) => c.id === fixture.opponentId)
      if (!club) break
      // The auto manager is bound by the same team news you are.
      const fit = availablePlayers(squad, running.availability)
      const xiAuto = autoSelectXI(fit)
      const matchSeed = randomSeed()
      const f = seasonForms(running)
      // Nothing called means the auto captain reads every block for himself.
      const one = simulateFieldingInnings(club, xiAuto, emptyPlan(), matchSeed, f)
      const two = simulateBattingInnings(club, autoBattingOrder(xiAuto), one.runs + 1, matchSeed, f)
      running = recordRound(running, buildMatchResult(matchSeed, club, one, two), squad, xiAuto)
    }
    persistSeason(running)
  }, [season, squad, persistSeason])

  /** Tracked form for the season, or undefined in a friendly. */
  const forms = useMemo(
    () => (inLeague && season ? seasonForms(season) : undefined),
    [inLeague, season],
  )

  // Dropping a bowler from the XI must drop his overs too.
  useEffect(() => {
    setPlan((prev) => {
      const ids = new Set(xi.map((p) => p.id))
      let touched = false
      const next = prev.map((b) => {
        if (b === null) return null
        const kept = b.filter((a) => ids.has(a.playerId))
        if (kept.length === b.length) return b
        touched = true
        // A block that no longer adds up falls back to the auto captain rather
        // than silently bowling eight overs.
        return null
      })
      return touched ? next : prev
    })
  }, [xi])

  // ------------------------------------------------------ the innings in the field
  //
  // Same shape as the chase: re-run the whole innings with whatever has been
  // decided so far. Each block's rota is dealt from its own seeded stream, so
  // the overs you have already watched come out ball for ball identical however
  // you change your mind at the break.

  const simulateField = useCallback((blocks: Plan, fs: FieldOrder[]) => {
    if (!opponent) return null
    return simulateFieldingInnings(opponent, xi, blocks, seed, forms, fs)
  }, [opponent, xi, seed, forms])

  /**
   * Every ball the innings should stop on: the four nine-over marks, and every
   * wicket that brings a new batter in.
   *
   * Counted in balls, because a wicket falls mid-over — the whole point of
   * stopping there is that the new man gets his instructions before his first
   * delivery rather than his sixth.
   */
  const stopsIn = useCallback((innings: InningsResult) => {
    const last = innings.balls
    const marks = BREAK_OVERS.map((o) => o * RULES.ballsPerOver)
    const falls = innings.fow.filter((f) => f.incoming !== undefined).map((f) => f.ball)
    return [...new Set([...marks, ...falls])].filter((b) => b > 0 && b < last).sort((a, b) => a - b)
  }, [])

  /** The next stop the innings actually reaches. Null once it's over. */
  const nextBreak = useCallback((innings: InningsResult, after: number) =>
    stopsIn(innings).find((b) => b > after) ?? null, [stopsIn])

  /** Send the manager wherever the ball we just stopped on belongs. */
  const openBreak = useCallback((innings: InningsResult, ball: number, side: 'field' | 'chase') => {
    const fall = innings.fow.find((f) => f.ball === ball && f.incoming !== undefined)
    if (fall) {
      setFallAt(ball)
      setScreen(side === 'field' ? 'wicket1' : 'wicket2')
      return
    }
    if (side === 'field') { setBlock(ball / (BLOCK_OVERS * RULES.ballsPerOver)); setScreen('plan'); return }
    setDrinksAt(ball)
    setScreen('drinks')
  }, [])

  /** Take the field for the block just set, and run to the next break. */
  const bowlOn = useCallback((extraField?: FieldOrder) => {
    const fs = extraField ? [...fields, extraField] : fields
    if (extraField) setFields(fs)
    const innings = simulateField(plan, fs)
    if (!innings) return
    setFirst(innings)
    const from = extraField ? extraField.at : block * BLOCK_OVERS * RULES.ballsPerOver
    setWatchedTo1(from)
    setFallAt(null)
    // Instant results skips the playback, not the management — the breaks are
    // the game, so they still happen.
    if (prefs.instant) {
      const nb = nextBreak(innings, from)
      if (nb !== null) { openBreak(innings, nb, 'field'); return }
      setScreen('break')
      return
    }
    setScreen('sim1')
  }, [simulateField, plan, fields, block, prefs.instant, nextBreak, openBreak])

  const fieldBreak = useCallback((ball: number) => {
    if (first) openBreak(first, ball, 'field')
  }, [first, openBreak])

  /**
   * Run the chase with the intents decided so far.
   *
   * Called again after every drinks break. The RNG is seeded and consumed in
   * order, so everything before the block you just changed comes out ball for
   * ball identical — which is what lets the break be a genuine mid-innings
   * decision rather than a plan made before the openers walked out.
   */
  const simulateChase = useCallback((list: Order[]) => {
    if (!opponent || !first) return null
    return simulateBattingInnings(opponent, order, first.runs + 1, seed, forms, list)
  }, [opponent, first, order, seed, forms])

  /** The chase is done — bank it. */
  const finishChase = useCallback((innings: InningsResult) => {
    if (!opponent || !first) return
    const built = buildMatchResult(seed, opponent, first, innings)
    setResult(built)
    setRecord((r) => recordMatch(r, built.outcome, innings.runs, opponent.name))
    saveLastXI(order)
    // A league fixture updates the table — and plays out the rest of its round.
    if (inLeague && season) persistSeason(recordRound(season, built, squad, xi))
  }, [opponent, first, seed, order, xi, inLeague, season, squad, persistSeason])

  const startChase = useCallback(() => {
    // What the openers were told on the order screen, stamped at ball zero.
    const opened: Order[] = Object.entries(opening).map(([playerId, intent]) => ({
      at: 0, playerId, intent,
    }))
    setOrders(opened)
    const innings = simulateChase(opened)
    if (!innings) return
    setSecond(innings)
    setWatchedTo(0)
    // Instant results skips the playback, not the management — the breaks are
    // the game, so they still happen.
    if (prefs.instant) {
      const nb = nextBreak(innings, 0)
      if (nb !== null) { openBreak(innings, nb, 'chase'); return }
      finishChase(innings)
      setScreen('result')
      return
    }
    setScreen('sim2')
  }, [simulateChase, opening, prefs.instant, nextBreak, openBreak, finishChase])

  /**
   * Coming out of a break with fresh instructions.
   *
   * Orders are appended, never replaced, so re-running the chase reproduces
   * every ball you've already watched — the earlier balls read exactly the
   * entries they read the first time.
   */
  const playOn = useCallback((at: number, given: Record<string, Intent>) => {
    const next = [
      ...orders,
      ...Object.entries(given).map(([playerId, intent]) => ({ at, playerId, intent })),
    ]
    setOrders(next)
    const innings = simulateChase(next)
    if (!innings) return
    setSecond(innings)
    setWatchedTo(at)
    setDrinksAt(null)
    setFallAt(null)
    if (prefs.instant) {
      const nb = nextBreak(innings, at)
      if (nb !== null) { openBreak(innings, nb, 'chase'); return }
      finishChase(innings)
      setScreen('result')
      return
    }
    setScreen('sim2')
  }, [orders, simulateChase, prefs.instant, nextBreak, openBreak, finishChase])

  const toggleInstant = useCallback(() => {
    setPrefs((p) => {
      const next = { ...p, instant: !p.instant }
      savePrefs(next)
      return next
    })
  }, [])

  const sortedSquad = useMemo(
    () => [...squad].sort(
      (a, b) => (0.62 * b.bat.skill + 0.38 * b.bat.pwr) - (0.62 * a.bat.skill + 0.38 * a.bat.pwr),
    ),
    [squad],
  )

  /** Who's missing this week. Only season fixtures have team news. */
  const unavailable = useMemo(() => {
    if (!inLeague || !season) return undefined
    const map = new Map<string, string>()
    for (const [id, a] of unavailableMap(season.availability)) map.set(id, a.reason)
    return map
  }, [inLeague, season])

  /** The pool AUTO and the selection screen may draw from. */
  const pickable = useMemo(
    () => (inLeague && season ? availablePlayers(squad, season.availability) : squad),
    [inLeague, season, squad],
  )

  /** Where the back arrow and the post-match buttons return you to. */
  const homeScreen: Screen = inLeague ? 'season' : 'home'

  // ----------------------------------------------- what the attack screen needs
  //
  // Overs already bowled and who bowled last come from the *blocks behind this
  // one*, not from the innings — so the screen shows the same state the rota
  // will be dealt against, whether or not the innings has been run yet.

  const bowledSoFar = useMemo(() => oversBowled(plan, block), [plan, block])

  /**
   * The last two bowlers before this block: the first can't open it, and the
   * second is the man whose end it is — so the preview only matches the rota
   * the innings really deals if both are carried across the join.
   */
  const [beforeLast, lastBowler] = useMemo(() => {
    if (block === 0 || !first) return [null, null]
    const done = first.overSummaries.filter((o) => o.over <= block * BLOCK_OVERS)
    const idOf = (name: string | undefined) =>
      (name === undefined ? null : xi.find((p) => p.name === name)?.id ?? null)
    return [idOf(done[done.length - 2]?.bowlerName), idOf(done[done.length - 1]?.bowlerName)]
  }, [block, first, xi])

  /** What a sensible captain would set, given how the innings is going. */
  const suggestedField = useMemo(() => {
    const at = first?.overSummaries.find((o) => o.over === block * BLOCK_OVERS)
    return autoField(block, at?.total ?? 0, at?.totalWkts ?? 0)
  }, [block, first])

  /** What the attack screen currently has selected, defaulting to the advice. */
  const [chosenField, setChosenField] = useState<Field | null>(null)
  const blockField = chosenField ?? suggestedField
  const setBlockField = useCallback((f: Field) => setChosenField(f), [])
  // A new block is a fresh decision — don't carry the last one's setting over.
  useEffect(() => { setChosenField(null) }, [block])

  const body = (() => {
    switch (screen) {
      case 'squad':
        return (
          <Squad
            squad={squad}
            isCustom={custom}
            onChange={persistSquad}
            onReset={doResetSquad}
            onBack={() => setScreen('home')}
          />
        )

      case 'stats':
        return season && (
          <SeasonStats season={season} onBack={() => setScreen('season')} />
        )

      case 'season':
        return season && (
          <Season
            season={season}
            instant={prefs.instant}
            onToggleInstant={toggleInstant}
            onPlay={playFixture}
            onSimRest={simRestOfSeason}
            onStats={() => setScreen('stats')}
            onAbandon={() => { persistSeason(null); setInLeague(false); setScreen('home') }}
            onBack={() => { setInLeague(false); setScreen('home') }}
          />
        )

      case 'selection':
        return opponent && (
          <Selection
            squad={sortedSquad}
            opponent={opponent}
            selected={xi}
            unavailable={unavailable}
            forms={forms}
            onSetXI={setXi}
            onAuto={() => setXi(autoSelectXI(pickable))}
            onBack={() => setScreen(homeScreen)}
            onNext={() => {
              setOrder(xi)
              setBlock(0)
              setScreen('plan')
            }}
          />
        )

      case 'plan':
        return opponent && (
          <Attack
            block={block}
            xi={xi}
            opponent={opponent}
            plan={plan[block] ?? autoBlock(xi, block, bowledSoFar, lastBowler)}
            used={bowledSoFar}
            previous={lastBowler}
            beforeThat={beforeLast}
            field={blockField}
            suggestedField={suggestedField}
            innings={block === 0 ? null : first}
            seed={seed}
            onChange={(b) => setPlan((prev) => prev.map((v, i) => (i === block ? b : v)))}
            onField={setBlockField}
            onAuto={() => setPlan((prev) => prev.map((v, i) => (
              i === block ? autoBlock(xi, block, bowledSoFar, lastBowler) : v
            )))}
            onBack={block === 0 ? () => setScreen('selection') : undefined}
            onNext={() => bowlOn({
              at: block * BLOCK_OVERS * RULES.ballsPerOver, field: blockField,
            })}
          />
        )

      case 'sim1':
        return first && opponent && (
          <Sim
            innings={first}
            eyebrow="FIRST INNINGS · YOU ARE IN THE FIELD"
            title={`${opponent.name} batting`}
            stopAt={stopsIn(first)}
            startAt={watchedTo1}
            onBreak={fieldBreak}
            orders={{
              label: 'THE FIELD',
              standing: (at) => fieldLabel(first, fields, at),
              panel: (at, close) => (
                <LiveField
                  innings={first}
                  xi={xi}
                  at={at}
                  standing={fieldAt(fields, at)}
                  onSet={(f) => { bowlOn({ at, field: f }); close() }}
                />
              ),
            }}
            onDone={() => setScreen('break')}
          />
        )

      case 'wicket1':
        return first && fallAt !== null && (
          <WicketBreak
            innings={first}
            fall={first.fow.find((f) => f.ball === fallAt)!}
            order={opponent?.xi ?? []}
            xi={xi}
            mode="fielding"
            onPlayOn={({ field }) => bowlOn({ at: fallAt, field: field! })}
          />
        )

      case 'break':
        return first && opponent && (
          <InningsBreak
            innings={first}
            opponent={opponent}
            onNext={() => setScreen('order')}
          />
        )

      case 'order':
        return first && (
          <BattingOrder
            order={order}
            target={first.runs + 1}
            didNotBowl={
              inLeague
                ? new Set(
                    xi.filter((p) => !first.bowling.some((b) => b.playerId === p.id && b.balls > 0))
                      .map((p) => p.id),
                  )
                : undefined
            }
            opening={opening}
            suggested={openingIntent(first.runs + 1)}
            onIntent={(playerId, i) => setOpening((prev) => ({ ...prev, [playerId]: i }))}
            onChange={setOrder}
            onAuto={() => setOrder(autoBattingOrder(xi))}
            onBack={() => setScreen('break')}
            onNext={startChase}
          />
        )

      case 'sim2':
        return second && (
          <Sim
            innings={second}
            eyebrow="SECOND INNINGS · THE CHASE"
            title={`Bagshot need ${second.target}`}
            stopAt={stopsIn(second)}
            startAt={watchedTo}
            onBreak={(ball) => openBreak(second, ball, 'chase')}
            orders={{
              label: 'ORDERS',
              standing: (at) => intentLabel(second, order, orders, at),
              panel: (at, close) => (
                <LiveIntent
                  innings={second}
                  order={order}
                  at={at}
                  standing={(id) => orderFor(orders, id, at)}
                  onSet={(given) => { playOn(at, given); close() }}
                />
              ),
            }}
            onDone={() => { finishChase(second); setScreen('result') }}
          />
        )

      case 'drinks':
        return second && drinksAt !== null && (
          <DrinksBreak
            innings={second}
            order={order}
            afterOver={drinksAt / RULES.ballsPerOver}
            standing={(id) => orderFor(orders, id, drinksAt)}
            onPlayOn={(given) => playOn(drinksAt, given)}
          />
        )

      case 'wicket2':
        return second && fallAt !== null && (
          <WicketBreak
            innings={second}
            fall={second.fow.find((f) => f.ball === fallAt)!}
            order={order}
            xi={opponent?.xi ?? []}
            mode="batting"
            onPlayOn={({ intent }) => playOn(
              fallAt,
              intent && second.fow.find((f) => f.ball === fallAt)?.incoming
                ? { [second.fow.find((f) => f.ball === fallAt)!.incoming!.playerId]: intent }
                : {},
            )}
          />
        )

      case 'result':
        return result && (
          <Result
            result={result}
            leagueMode={inLeague}
            onAgain={() => {
              if (inLeague) { setScreen('season'); return }
              setScreen('home')
            }}
            onHome={() => { setInLeague(false); setScreen('home') }}
          />
        )

      case 'home':
      default:
        return (
          <Home
            record={record}
            season={season}
            instant={prefs.instant}
            onToggleInstant={toggleInstant}
            squadSize={squad.length}
            squadAvailable={
              season ? availablePlayers(squad, season.availability).length : undefined
            }
            squadValue={squad.reduce((sum, p) => sum + p.value, 0)}
            onStart={(club) => startMatch(club, false)}
            onSeason={openSeason}
            onSquad={() => setScreen('squad')}
          />
        )
    }
  })()

  return (
    <>
      <div className="field-bg" />
      <div className="relative w-full max-w-md mx-auto px-4 pb-12" style={{ zIndex: 1 }}>
        {body}
      </div>
    </>
  )
}
