import { useEffect, useRef, useState } from 'react'
import { RULES } from '../data/types'
import type { BallEvent, InningsResult, OverSummary } from '../data/types'
import { formatOvers } from '../engine/innings'
import { dlsPar } from '../engine/dls'
import { theme } from '../theme'
import { Eyebrow, GhostButton } from '../components/ui'

/** Over-by-over playback. Slows down when something actually happens. */
const TICK_MS = 380
const TICK_BIG_MS = 950
const FEED_LENGTH = 14

function colourFor(type: BallEvent['type']): string {
  switch (type) {
    case 'wicket': return theme.red
    case 'drop': return theme.sky
    case 'ton': case 'win': return theme.gold
    case 'fifty': case 'team': return theme.pitch
    case 'maiden': return theme.green
    default: return theme.muted
  }
}

/** Scorebook token colouring — a wicket should jump out of the strip. */
function tokenStyle(token: string): { colour: string; weight: number } {
  if (token === 'W') return { colour: theme.red, weight: 800 }
  if (token === '4' || token === '6') return { colour: theme.gold, weight: 800 }
  if (token === '.') return { colour: theme.faint, weight: 400 }
  if (/[a-z]/.test(token)) return { colour: theme.sky, weight: 600 }  // wd, nb, b, lb
  return { colour: theme.cream, weight: 600 }
}

const BIG_EVENTS: BallEvent['type'][] = ['wicket', 'ton', 'win', 'drop']

/**
 * The feed mixes two things: a scorebook strip for each completed over, and the
 * notable moments inside it. The strip means every single ball is visible
 * without the playback having to tick 270 times an innings.
 */
type FeedItem =
  | { kind: 'over'; key: string; over: OverSummary }
  | { kind: 'event'; key: string; event: BallEvent }

export function Sim({
  innings, eyebrow, title, onDone,
}: {
  innings: InningsResult
  eyebrow: string
  title: string
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)

  const done = useRef(false)
  const seenOvers = useRef(new Set<number>())
  const overs = innings.overSummaries

  useEffect(() => {
    if (step >= overs.length) {
      if (!done.current) {
        done.current = true
        const t = setTimeout(onDone, 900)
        return () => clearTimeout(t)
      }
      return
    }

    const summary = overs[step]
    let delay = TICK_MS

    if (!seenOvers.current.has(summary.over)) {
      seenOvers.current.add(summary.over)
      const fresh = innings.events.filter((e) => e.over === summary.over)
      const items: FeedItem[] = [
        { kind: 'over', key: `o${summary.over}`, over: summary },
        ...fresh.slice().reverse().map((e, i) => ({
          kind: 'event' as const, key: `e${summary.over}-${i}`, event: e,
        })),
      ]
      setFeed((prev) => [...items, ...prev].slice(0, FEED_LENGTH))
      const big = fresh.find((e) => BIG_EVENTS.includes(e.type))
      if (big) {
        setFlash(`${big.type === 'wicket' ? 'red' : 'gold'}-${step}`)
        delay = TICK_BIG_MS
      }
    }

    // Pausing simply stops scheduling the next tick — the feed and the score
    // stay exactly where they are.
    if (paused) return
    const t = setTimeout(() => setStep((s) => s + 1), delay / speed)
    return () => clearTimeout(t)
  }, [step, speed, paused, overs, innings.events, onDone])

  const finished = step >= overs.length
  const now = overs[Math.min(step, overs.length - 1)]
  const runs = finished || !now ? innings.runs : now.total
  const wkts = finished || !now ? innings.wickets : now.totalWkts
  const ballsBowled = finished || !now ? innings.balls : now.over * RULES.ballsPerOver
  const oversDone = finished || !now ? innings.balls / 6 : now.over
  const rr = oversDone > 0 ? runs / oversDone : 0

  const chasing = innings.target !== null
  const need = chasing ? Math.max(0, innings.target! - runs) : 0
  const ballsLeft = Math.max(0, RULES.balls - ballsBowled)
  const rrr = chasing && ballsLeft > 0 ? (need / ballsLeft) * 6 : 0
  // Par prices in wickets as well as balls, which the required rate can't.
  const dls = chasing ? dlsPar(innings.target! - 1, runs, wkts, ballsBowled) : null

  const flashClass = flash ? (flash.startsWith('red') ? 'flash-red' : 'flash-gold') : ''
  // The two men in the middle, as they stood at the end of the last completed
  // over. The single most useful thing on this screen during a chase.
  const atCrease = finished || !now ? [] : now.atCrease

  return (
    <div className="pt-8 pop">
      <div className="disp tracking-[0.3em] text-[10px] text-center mb-1" style={{ color: theme.muted }}>
        {eyebrow}
      </div>
      <div className="disp text-center text-lg font-bold tracking-wide mb-4">{title}</div>

      <div
        className={`rounded-2xl px-6 py-6 text-center ${flashClass}`}
        style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        key={flash ?? 'idle'}
      >
        <div
          className="disp num font-extrabold leading-none"
          style={{ fontSize: 76, color: chasing && need === 0 ? theme.gold : theme.cream }}
          aria-live="polite"
          aria-atomic="true"
        >
          {runs}
          <span style={{ color: theme.faint }}>/</span>
          <span style={{ color: wkts >= 8 ? theme.red : theme.cream }}>{wkts}</span>
        </div>
        <div className="disp text-lg mt-1 tracking-wide" style={{ color: theme.muted }}>
          {formatOvers(ballsBowled)} overs · RR {rr.toFixed(2)}
        </div>
        {now && !finished && (
          <div className="disp text-[11px] mt-2 tracking-widest" style={{ color: theme.faint }}>
            BOWLING · {now.bowlerName.toUpperCase()}
          </div>
        )}
      </div>

      {atCrease.length > 0 && (
        <div
          className="rounded-xl mt-2 overflow-hidden"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          <div
            className="disp text-[9px] tracking-widest px-3 py-1.5"
            style={{ color: theme.faint, background: theme.surface2 }}
          >
            AT THE CREASE
          </div>
          {atCrease.map((b, i) => (
            <div
              key={b.name}
              className="px-3 py-1.5 flex items-baseline gap-2"
              style={{ borderTop: i > 0 ? `1px solid ${theme.border}55` : 'none' }}
            >
              <span
                className="text-[13px] font-semibold truncate flex-1"
                style={{ color: b.onStrike ? theme.gold : theme.cream }}
              >
                {b.name}
                {b.onStrike && <span className="disp ml-1" style={{ color: theme.gold }}>*</span>}
              </span>
              <span className="disp num text-[15px] font-bold shrink-0">
                {b.runs}
                <span className="text-[11px] font-normal ml-1" style={{ color: theme.faint }}>
                  ({b.balls})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {chasing && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>NEED</div>
            <div className="disp num text-xl font-bold" style={{ color: need === 0 ? theme.gold : theme.cream }}>
              {need === 0 ? 'DONE' : need}
            </div>
            {need > 0 && (
              <div className="disp text-[10px]" style={{ color: theme.faint }}>off {ballsLeft} balls</div>
            )}
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>REQUIRED RATE</div>
            <div
              className="disp num text-xl font-bold"
              style={{ color: rrr > 9 ? theme.red : rrr > 6.5 ? theme.pitch : theme.green }}
            >
              {need === 0 ? '—' : rrr.toFixed(2)}
            </div>
            <div className="disp text-[10px]" style={{ color: theme.faint }}>target {innings.target}</div>
          </div>
        </div>
      )}

      {dls && (
        <div
          className="rounded-xl px-4 py-2.5 mt-2 flex items-center justify-between"
          style={{
            background: theme.surface,
            border: `1px solid ${dls.diff >= 0 ? `${theme.green}66` : `${theme.red}66`}`,
          }}
        >
          <div>
            <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>
              DLS PAR
            </div>
            <div className="disp num text-lg font-bold leading-none mt-0.5">
              {dls.par}
              <span className="text-[11px] font-normal ml-2" style={{ color: theme.faint }}>
                {Math.round(dls.used)}% of resources used
              </span>
            </div>
          </div>
          <div
            className="disp num text-xl font-extrabold"
            style={{ color: dls.diff >= 0 ? theme.green : theme.red }}
          >
            {dls.diff >= 0 ? '+' : ''}{dls.diff}
          </div>
        </div>
      )}

      <div className="mt-4">
        <Eyebrow>BALL BY BALL</Eyebrow>
        <div className="rounded-xl px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          {feed.length === 0 ? (
            <div className="text-[12px] py-3 text-center" style={{ color: theme.faint }}>
              Players are out in the middle…
            </div>
          ) : (
            feed.map((item, i) => {
              const fading = { opacity: 1 - Math.min(i, 8) * 0.07 }
              const rule = i < feed.length - 1 ? `1px solid ${theme.border}44` : 'none'
              if (item.kind === 'over') {
                const o = item.over
                return (
                  <div
                    key={item.key}
                    className={`flex items-baseline gap-2 py-1.5 ${i === 0 ? 'slide-in' : ''}`}
                    style={{ borderBottom: rule, ...fading }}
                  >
                    <span className="disp num text-[11px] shrink-0 w-6" style={{ color: theme.faint }}>
                      {o.over}
                    </span>
                    <span
                      className="disp text-[10px] shrink-0 w-[4.5rem] truncate tracking-wide"
                      style={{ color: theme.muted }}
                    >
                      {o.bowlerName.split(' ').slice(-1)[0].toUpperCase()}
                    </span>
                    <span className="flex gap-1 flex-wrap flex-1">
                      {o.balls.map((t, bi) => {
                        const s = tokenStyle(t)
                        return (
                          <span
                            key={bi}
                            className="disp num text-[11.5px]"
                            style={{ color: s.colour, fontWeight: s.weight }}
                          >
                            {t}
                          </span>
                        )
                      })}
                    </span>
                    <span className="disp num text-[11px] shrink-0" style={{ color: theme.muted }}>
                      {o.runs}
                    </span>
                  </div>
                )
              }
              const e = item.event
              return (
                <div
                  key={item.key}
                  className="flex gap-2 py-1.5 text-[12.5px] leading-snug"
                  style={{ borderBottom: rule, ...fading }}
                >
                  <span className="disp num text-[11px] shrink-0 w-8" style={{ color: theme.faint }}>
                    {formatOvers(e.ball)}
                  </span>
                  <span style={{ color: colourFor(e.type) }}>{e.text}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {[1, 2, 4].map((s) => (
          <GhostButton key={s} active={speed === s} onClick={() => setSpeed(s)} className="flex-1 text-center !py-3">
            {s}×
          </GhostButton>
        ))}
        <GhostButton
          onClick={() => setPaused((p) => !p)}
          active={paused}
          className="flex-1 text-center !py-3"
        >
          {paused ? 'RESUME' : 'PAUSE'}
        </GhostButton>
        <GhostButton
          onClick={() => setStep(overs.length)}
          className="flex-1 text-center !py-3"
          style={{ color: theme.gold, borderColor: `${theme.gold}66` }}
        >
          SKIP
        </GhostButton>
      </div>

      <div className="h-1.5 rounded-full mt-4 overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.min(100, (step / Math.max(overs.length, 1)) * 100)}%`,
            background: theme.gold,
          }}
        />
      </div>
    </div>
  )
}
