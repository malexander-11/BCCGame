import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BowlingPlan as Plan, Club, InningsResult, MatchResult, Player } from './data/types'
import { autoBattingOrder, autoSelectXI } from './engine/ai'
import { buildMatchResult, simulateBattingInnings, simulateFieldingInnings } from './engine/match'
import { autoPlan } from './engine/rota'
import { randomSeed } from './engine/rng'
import {
  loadRecord, loadSquad, recordMatch, resetSquad, saveSquad, usingCustomSquad,
} from './storage'
import type { Record as SeasonRecord } from './storage'
import { Home } from './screens/Home'
import { Selection } from './screens/Selection'
import { BowlingPlan } from './screens/BowlingPlan'
import { Sim } from './screens/Sim'
import { InningsBreak } from './screens/InningsBreak'
import { BattingOrder } from './screens/BattingOrder'
import { Result } from './screens/Result'
import { Squad } from './screens/Squad'

type Screen =
  | 'home' | 'squad' | 'selection' | 'plan'
  | 'sim1' | 'break' | 'order' | 'sim2' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [squad, setSquad] = useState<Player[]>(loadSquad)
  const [custom, setCustom] = useState(usingCustomSquad)
  const [record, setRecord] = useState<SeasonRecord>(loadRecord)

  const [opponent, setOpponent] = useState<Club | null>(null)
  const [seed, setSeed] = useState(randomSeed)
  const [xi, setXi] = useState<Player[]>([])
  const [plan, setPlan] = useState<Plan>([])
  const [order, setOrder] = useState<Player[]>([])
  const [first, setFirst] = useState<InningsResult | null>(null)
  const [second, setSecond] = useState<InningsResult | null>(null)
  const [result, setResult] = useState<MatchResult | null>(null)

  // Scroll back to the top on every screen change — long scorecards otherwise
  // drop you into the middle of the next screen.
  useEffect(() => { window.scrollTo({ top: 0 }) }, [screen])

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

  const startMatch = useCallback((club: Club) => {
    const picked = autoSelectXI(squad)
    setOpponent(club)
    setSeed(randomSeed())
    setXi(picked)
    setPlan(autoPlan(picked))
    setFirst(null)
    setSecond(null)
    setResult(null)
    setScreen('selection')
  }, [squad])

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
    setFirst(simulateFieldingInnings(opponent, xi, plan, seed))
    setScreen('sim1')
  }, [opponent, xi, plan, seed])

  const startChase = useCallback(() => {
    if (!opponent || !first) return
    const innings = simulateBattingInnings(opponent, order, first.runs + 1, seed)
    setSecond(innings)
    const built = buildMatchResult(seed, opponent, first, innings)
    setResult(built)
    setRecord((r) => recordMatch(r, built.outcome, innings.runs, opponent.name))
    setScreen('sim2')
  }, [opponent, first, order, seed])

  const sortedSquad = useMemo(
    () => [...squad].sort((a, b) => a.positions[0] - b.positions[0]),
    [squad],
  )

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

      case 'selection':
        return opponent && (
          <Selection
            squad={sortedSquad}
            opponent={opponent}
            selected={xi}
            onToggle={toggle}
            onAuto={() => {
              const picked = autoSelectXI(squad)
              setXi(picked)
              setPlan(autoPlan(picked))
            }}
            onBack={() => setScreen('home')}
            onNext={() => {
              setXi((prev) => autoBattingOrder(prev))
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
            onNext={() => {
              setOrder(autoBattingOrder(xi))
              setScreen('order')
            }}
          />
        )

      case 'order':
        return first && (
          <BattingOrder
            order={order}
            target={first.runs + 1}
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
            onAgain={() => setScreen('home')}
            onHome={() => setScreen('home')}
          />
        )

      case 'home':
      default:
        return (
          <Home
            record={record}
            squadSize={squad.length}
            squadValue={squad.reduce((sum, p) => sum + p.value, 0)}
            onStart={startMatch}
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
