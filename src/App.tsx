import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BowlingPlan as Plan, ChasePlan, Club, InningsResult, MatchResult, Player,
} from './data/types'
import { autoBattingOrder, autoSelectXI } from './engine/ai'
import { buildMatchResult, simulateBattingInnings, simulateFieldingInnings } from './engine/match'
import { autoPlan } from './engine/rota'
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
import { BowlingPlan } from './screens/BowlingPlan'
import { Sim } from './screens/Sim'
import { InningsBreak } from './screens/InningsBreak'
import { BattingOrder } from './screens/BattingOrder'
import { Result } from './screens/Result'
import { Squad } from './screens/Squad'

type Screen =
  | 'home' | 'squad' | 'season' | 'stats' | 'selection' | 'plan'
  | 'sim1' | 'break' | 'order' | 'sim2' | 'result'

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
  const [plan, setPlan] = useState<Plan>([])
  const [order, setOrder] = useState<Player[]>([])
  const [chasePlan, setChasePlan] = useState<ChasePlan>('as-it-comes')
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
      case 'plan': return 'selection'
      case 'sim1': return 'break'
      case 'break': return 'break'
      case 'order': return 'break'
      case 'sim2': return 'result'
      case 'result': return inLeague ? 'season' : 'home'
    }
  }, [inLeague])

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
    setPlan([])
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
      const planAuto = autoPlan(xiAuto)
      const matchSeed = randomSeed()
      const f = seasonForms(running)
      const one = simulateFieldingInnings(club, xiAuto, planAuto, matchSeed, f)
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
      const next = prev.filter((a) => ids.has(a.playerId))
      return next.length === prev.length ? prev : next
    })
  }, [xi])

  const bowlFirst = useCallback(() => {
    if (!opponent) return
    setFirst(simulateFieldingInnings(opponent, xi, plan, seed, forms))
    setScreen(prefs.instant ? 'break' : 'sim1')
  }, [opponent, xi, plan, seed, forms, prefs.instant])

  const startChase = useCallback(() => {
    if (!opponent || !first) return
    const innings = simulateBattingInnings(
      opponent, order, first.runs + 1, seed, forms, chasePlan,
    )
    setSecond(innings)
    const built = buildMatchResult(seed, opponent, first, innings)
    setResult(built)
    setRecord((r) => recordMatch(r, built.outcome, innings.runs, opponent.name))
    saveLastXI(order)
    // A league fixture updates the table — and plays out the rest of its round.
    if (inLeague && season) persistSeason(recordRound(season, built, squad, xi))
    setScreen(prefs.instant ? 'result' : 'sim2')
  }, [opponent, first, order, seed, forms, chasePlan, xi, inLeague, season, squad,
      persistSeason, prefs.instant])

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
            onAuto={() => {
              const picked = autoSelectXI(pickable)
              setXi(picked)
              // Only fill the attack if there isn't one. Coming back to
              // selection and tapping AUTO shouldn't bin a plan you built by
              // hand — the effect below drops any bowler who's no longer in.
              setPlan((prev) => (prev.length === 0 ? autoPlan(picked) : prev))
            }}
            onBack={() => setScreen(homeScreen)}
            onNext={() => {
              setOrder(xi)
              if (plan.length === 0) setPlan(autoPlan(xi))
              setScreen('plan')
            }}
          />
        )

      case 'plan':
        return opponent && (
          <BowlingPlan
            xi={xi}
            opponent={opponent}
            plan={plan}
            seed={seed}
            onChange={setPlan}
            onAuto={() => setPlan(autoPlan(xi))}
            onBack={() => setScreen('selection')}
            onNext={bowlFirst}
          />
        )

      case 'sim1':
        return first && opponent && (
          <Sim
            innings={first}
            eyebrow="FIRST INNINGS · YOU ARE IN THE FIELD"
            title={`${opponent.name} batting`}
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
            chasePlan={chasePlan}
            onChasePlan={setChasePlan}
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
            onDone={() => setScreen('result')}
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
