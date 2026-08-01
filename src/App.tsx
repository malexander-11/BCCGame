import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BLOCK_COUNT, BLOCK_OVERS, BREAK_OVERS } from './data/types'
import type {
  BowlingPlan as Plan, Club, Field, InningsResult, Intent, MatchResult, Player,
} from './data/types'
import {
  autoBattingOrder, autoBlock, autoField, autoIntents, autoSelectXI, emptyPlan,
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
import { Home } from './screens/Home'
import { Season } from './screens/Season'
import { SeasonStats } from './screens/SeasonStats'
import { Selection } from './screens/Selection'
import { Attack } from './screens/Attack'
import { Sim } from './screens/Sim'
import { InningsBreak } from './screens/InningsBreak'
import { BattingOrder } from './screens/BattingOrder'
import { DrinksBreak } from './screens/DrinksBreak'
import { Result } from './screens/Result'
import { Squad } from './screens/Squad'

type Screen =
  | 'home' | 'squad' | 'season' | 'stats' | 'selection' | 'plan'
  | 'sim1' | 'break' | 'order' | 'sim2' | 'drinks' | 'result'

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
  /** Where the fielders stand, one per block. */
  const [fields, setFields] = useState<(Field | null)[]>(
    () => Array<Field | null>(BLOCK_COUNT).fill(null),
  )
  /** The block the attack screen is currently setting, 0-4. */
  const [block, setBlock] = useState(0)
  const [order, setOrder] = useState<Player[]>([])
  /** One intent per nine-over block. Null means "nobody has called it yet". */
  const [intents, setIntents] = useState<(Intent | null)[]>(
    () => Array<Intent | null>(BLOCK_COUNT).fill(null),
  )
  /** The over we're stopped at for drinks, if any. */
  const [drinksAt, setDrinksAt] = useState<number | null>(null)
  /** Overs already watched, so resuming after drinks doesn't replay the chase. */
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
      // Drinks is a decision you have to make — there's nowhere behind it, and
      // the overs it follows have already been bowled.
      case 'drinks': return 'drinks'
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
    setFields(Array<Field | null>(BLOCK_COUNT).fill(null))
    setBlock(0)
    setIntents(Array<Intent | null>(BLOCK_COUNT).fill(null))
    setWatchedTo(0)
    setWatchedTo1(0)
    setDrinksAt(null)
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

  const toggle = useCallback((p: Player) => {
    setXi((prev) => {
      const has = prev.some((x) => x.id === p.id)
      if (has) return prev.filter((x) => x.id !== p.id)
      if (prev.length >= 11) return prev
      return [...prev, p]
    })
  }, [])

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

  const simulateField = useCallback((blocks: Plan, fs: (Field | null)[]) => {
    if (!opponent) return null
    return simulateFieldingInnings(opponent, xi, blocks, seed, forms, fs)
  }, [opponent, xi, seed, forms])

  /** The next break the innings actually reaches. Null once it's over. */
  const nextBreak = useCallback((innings: InningsResult, after: number) => {
    const last = innings.overSummaries[innings.overSummaries.length - 1]?.over ?? 0
    return BREAK_OVERS.find((o) => o > after && o < last) ?? null
  }, [])

  /** Take the field for the block just set, and run to the next break. */
  const bowlOn = useCallback(() => {
    const innings = simulateField(plan, fields)
    if (!innings) return
    setFirst(innings)
    const from = block * BLOCK_OVERS
    setWatchedTo1(from)
    // Instant results skips the playback, not the management — the breaks are
    // the game, so they still happen.
    if (prefs.instant) {
      const nb = nextBreak(innings, from)
      if (nb !== null) { setBlock(nb / BLOCK_OVERS); return }
      setScreen('break')
      return
    }
    setScreen('sim1')
  }, [simulateField, plan, fields, block, prefs.instant, nextBreak])

  /**
   * Stopped at a drinks break in the field: work out which block is next and
   * open the attack screen on it, pre-filled with what the auto captain would
   * do so tapping straight through is always a sensible option.
   */
  const fieldBreak = useCallback((over: number) => {
    setBlock(over / BLOCK_OVERS)
    setScreen('plan')
  }, [])

  /**
   * Run the chase with the intents decided so far.
   *
   * Called again after every drinks break. The RNG is seeded and consumed in
   * order, so everything before the block you just changed comes out ball for
   * ball identical — which is what lets the break be a genuine mid-innings
   * decision rather than a plan made before the openers walked out.
   */
  const simulateChase = useCallback((list: (Intent | null)[]) => {
    if (!opponent || !first) return null
    const target = first.runs + 1
    const auto = autoIntents(target)
    const resolved = list.map((v, i) => v ?? auto[i])
    return simulateBattingInnings(opponent, order, target, seed, forms, resolved)
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
    const innings = simulateChase(intents)
    if (!innings) return
    setSecond(innings)
    setWatchedTo(0)
    // Instant results skips the playback, not the management — the breaks are
    // the game, so they still happen.
    if (prefs.instant) {
      const nb = nextBreak(innings, 0)
      if (nb !== null) { setDrinksAt(nb); setScreen('drinks'); return }
      finishChase(innings)
      setScreen('result')
      return
    }
    setScreen('sim2')
  }, [simulateChase, intents, prefs.instant, nextBreak, finishChase])

  /** Coming out of drinks with an instruction for the next nine overs. */
  const playOn = useCallback((intent: Intent) => {
    if (drinksAt === null) return
    const next = [...intents]
    next[Math.floor(drinksAt / BLOCK_OVERS)] = intent
    setIntents(next)
    const innings = simulateChase(next)
    if (!innings) return
    setSecond(innings)
    setWatchedTo(drinksAt)
    setDrinksAt(null)
    if (prefs.instant) {
      const nb = nextBreak(innings, drinksAt)
      if (nb !== null) { setDrinksAt(nb); return }
      finishChase(innings)
      setScreen('result')
      return
    }
    setScreen('sim2')
  }, [drinksAt, intents, simulateChase, prefs.instant, nextBreak, finishChase])

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
            onToggle={toggle}
            onReorder={setXi}
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
            field={fields[block] ?? suggestedField}
            suggestedField={suggestedField}
            innings={block === 0 ? null : first}
            seed={seed}
            onChange={(b) => setPlan((prev) => prev.map((v, i) => (i === block ? b : v)))}
            onField={(f) => setFields((prev) => prev.map((v, i) => (i === block ? f : v)))}
            onAuto={() => setPlan((prev) => prev.map((v, i) => (
              i === block ? autoBlock(xi, block, bowledSoFar, lastBowler) : v
            )))}
            onBack={block === 0 ? () => setScreen('selection') : undefined}
            onNext={bowlOn}
          />
        )

      case 'sim1':
        return first && opponent && (
          <Sim
            innings={first}
            eyebrow="FIRST INNINGS · YOU ARE IN THE FIELD"
            title={`${opponent.name} batting`}
            breakAfter={BREAK_OVERS}
            startAt={watchedTo1}
            onBreak={fieldBreak}
            onDone={() => setScreen('break')}
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
            intent={intents[0] ?? autoIntents(first.runs + 1)[0]}
            suggested={autoIntents(first.runs + 1)[0]}
            onIntent={(i) => setIntents((prev) => { const n = [...prev]; n[0] = i; return n })}
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
            breakAfter={BREAK_OVERS}
            startAt={watchedTo}
            onBreak={(over) => { setDrinksAt(over); setScreen('drinks') }}
            onDone={() => { finishChase(second); setScreen('result') }}
          />
        )

      case 'drinks':
        return second && drinksAt !== null && (
          <DrinksBreak
            innings={second}
            order={order}
            afterOver={drinksAt}
            onPlayOn={playOn}
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
