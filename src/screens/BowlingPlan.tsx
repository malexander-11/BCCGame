import { useMemo, useState } from 'react'
import {
  allocatedOvers, NO_OVERS, RULES, windowCap, WINDOWS, windowSize,
} from '../data/types'
import type { BowlingPlan as Plan, Club, Player, Window } from '../data/types'
import { buildRota, validatePlan } from '../engine/rota'
import { availableBowlers } from '../engine/ratings'
import { makeRng } from '../engine/rng'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar, StickyFooter,
} from '../components/ui'

const bowlIndex = (p: Player) => 0.5 * p.bowl.def + 0.5 * p.bowl.att
/** Below this a legal bowler is really a part-timer, not part of the attack. */
const FRONTLINE = 60

export function BowlingPlan({
  xi, opponent, plan, seed, onChange, onAuto, onBack, onNext,
}: {
  xi: Player[]
  opponent: Club
  plan: Plan
  /** The match seed, so the preview is the rota you'll actually get. */
  seed: number
  onChange: (plan: Plan) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  // `xi` arrives in batting order, which puts your worst bowler at the top of
  // the attack list. Sort by what they're actually here for, and push the
  // part-timers below a divider.
  const { frontline, partTime } = useMemo(() => {
    const all = [...availableBowlers(xi)].sort((a, b) => bowlIndex(b) - bowlIndex(a))
    return {
      frontline: all.filter((p) => bowlIndex(p) >= FRONTLINE),
      partTime: all.filter((p) => bowlIndex(p) < FRONTLINE),
    }
  }, [xi])

  /** A bowler with no overs, opened up so he can be given some. */
  const [opened, setOpened] = useState<string | null>(null)

  const byId = useMemo(() => new Map(plan.map((a) => [a.playerId, a])), [plan])
  const allocated = plan.reduce((s, a) => s + allocatedOvers(a), 0)
  const issues = validatePlan(plan, xi)

  /** How many overs each window has been given, against what it needs. */
  const filled = useMemo(() => WINDOWS.map((w) => ({
    ...w,
    got: plan.reduce((s, a) => s + a.overs[w.key], 0),
    need: windowSize(w.key),
  })), [plan])

  // buildRota is deterministic in the seed, so this is the rota the innings
  // will actually use — a preview, not an estimate.
  const rota = useMemo(
    () => (issues.length > 0 ? [] : buildRota(plan, makeRng(seed))),
    [plan, seed, issues.length],
  )

  const oversOf = (id: string) => byId.get(id)?.overs ?? NO_OVERS

  const bump = (p: Player, w: Window, delta: number) => {
    const current = oversOf(p.id)
    const next = current[w] + delta
    if (next < 0) return
    const others = plan.filter((a) => a.playerId !== p.id)
    if (delta > 0) {
      const windowGot = plan.reduce((s, a) => s + a.overs[w], 0)
      if (windowGot >= windowSize(w)) return                 // window already full
      if (next > windowCap(w)) return                        // he'd bowl two in a row
      if (allocatedOvers({ playerId: p.id, overs: current }) >= RULES.maxOversPerBowler) return
    }
    const overs = { ...current, [w]: next }
    const total = overs.newBall + overs.middle + overs.death
    onChange(total === 0 ? others : [...others, { playerId: p.id, overs }])
  }

  const renderBowler = (p: Player, i: number) => {
    const overs = oversOf(p.id)
    const total = overs.newBall + overs.middle + overs.death
    const on = total > 0
    const spin = p.bowlType === 'spin'
    // Nobody needs three disabled steppers for a bowler who isn't in the
    // attack. He collapses to a single line until you tap him.
    const showControls = on || opened === p.id
    return (
      <div
        key={p.id}
        className="px-3 py-2.5"
        style={{
          background: on ? 'rgba(233,185,73,.08)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
          borderTop: i > 0 ? `1px solid ${theme.border}66` : 'none',
        }}
        onClick={!showControls ? () => setOpened(p.id) : undefined}
        role={!showControls ? 'button' : undefined}
        tabIndex={!showControls ? 0 : undefined}
        onKeyDown={!showControls
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpened(p.id) } }
          : undefined}
        aria-label={!showControls ? `Bring ${p.name} into the attack` : undefined}
      >
        <div className={`flex items-center gap-2${showControls ? ' mb-1.5' : ''}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold truncate" style={{ color: on ? theme.gold : theme.cream }}>
              {p.name}
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: spin ? theme.sky : theme.faint }}>
              {spin ? 'SPIN' : 'PACE'}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <StatBar label="DEF" value={p.bowl.def} width={38} />
            <StatBar label="ATT" value={p.bowl.att} width={38} />
            {(p.swing ?? 0) > 0 && <StatBar label="SWG" value={p.swing!} width={38} />}
          </div>
          <div
            className="disp num text-[15px] font-bold w-9 text-right shrink-0"
            style={{ color: on ? theme.gold : theme.faint }}
          >
            {showControls
              ? <>{total}<span className="text-[9px] font-normal" style={{ color: theme.faint }}>ov</span></>
              : <span style={{ color: theme.faint }}>▸</span>}
          </div>
        </div>

        {showControls && (
        <div className="flex gap-1.5">
          {WINDOWS.map((w) => {
            const v = overs[w.key]
            const windowGot = plan.reduce((s, a) => s + a.overs[w.key], 0)
            const canAdd =
              windowGot < windowSize(w.key) &&
              v < windowCap(w.key) &&
              total < RULES.maxOversPerBowler
            return (
              <div key={w.key} className="flex-1">
                <div
                  className="disp text-[8px] tracking-widest mb-1 text-center"
                  style={{ color: v > 0 ? theme.pitch : theme.faint }}
                >
                  {w.label}
                </div>
                <div className="flex items-center">
                  <button
                    onClick={() => bump(p, w.key, -1)}
                    disabled={v === 0}
                    aria-label={`One fewer ${w.label.toLowerCase()} over for ${p.name}`}
                    className="disp w-11 h-11 rounded-l-lg text-xl font-bold shrink-0
                               active:scale-90 transition-transform disabled:opacity-25"
                    style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.muted }}
                  >
                    −
                  </button>
                  <div
                    className="disp num flex-1 text-center text-[17px] font-bold"
                    style={{ color: v > 0 ? theme.gold : theme.faint }}
                  >
                    {v}
                  </div>
                  <button
                    onClick={() => bump(p, w.key, +1)}
                    disabled={!canAdd}
                    aria-label={`One more ${w.label.toLowerCase()} over for ${p.name}`}
                    className="disp w-11 h-11 rounded-r-lg text-xl font-bold shrink-0
                               active:scale-90 transition-transform disabled:opacity-25"
                    style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {showControls && !on && allocated >= RULES.overs && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.faint }}>
            Take overs off someone else first — all {RULES.overs} are spoken for.
          </div>
        )}

        {on && (p.swing ?? 0) >= 50 && overs.newBall === 0 && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.pitch }}>
            {p.name} swings it — worth most with the new ball, and gone by over 13.
          </div>
        )}
        {on && spin && overs.death > 0 && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.pitch }}>
            A spinner at the death goes for about a run an over more.
          </div>
        )}
        {on && !spin && overs.newBall === 0 && overs.death === 0 && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.faint }}>
            Seamers leak through the middle once the shine's gone.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="THE ATTACK"
        subtitle={`v ${opponent.name} · they bat first`}
        onBack={onBack}
        right={
          <div className="text-right">
            <div
              className="disp num text-xl font-bold leading-none"
              style={{ color: allocated === RULES.overs ? theme.gold : theme.cream }}
            >
              {allocated}<span style={{ color: theme.faint }}>/{RULES.overs}</span>
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: theme.faint }}>
              {allocated === RULES.overs ? 'SET' : 'OVERS'}
            </div>
          </div>
        }
      />

      {/* The plan checks itself: every window has to come out exact. */}
      <div className="flex gap-1.5 mb-2">
        {filled.map((w) => {
          const done = w.got === w.need
          const over = w.got > w.need
          const colour = over ? theme.red : done ? theme.green : theme.muted
          return (
            <div
              key={w.key}
              className="flex-1 rounded-lg px-2 py-1.5 text-center"
              style={{ background: theme.surface, border: `1px solid ${done ? colour : theme.border}` }}
            >
              <div className="disp text-[8px] tracking-widest" style={{ color: theme.faint }}>
                {w.label}
              </div>
              <div className="disp num text-[13px] font-bold" style={{ color: colour }}>
                {w.got}<span style={{ color: theme.faint }}>/{w.need}</span>
              </div>
            </div>
          )
        })}
        <GhostButton onClick={onAuto} className="!px-3 !py-2">AUTO</GhostButton>
        <GhostButton onClick={() => onChange([])} className="!px-3 !py-2">✕</GhostButton>
      </div>

      <div className="text-[11px] leading-snug mb-3 px-1" style={{ color: theme.muted }}>
        Say how many overs each bowler gets in each third. Seamers own the new
        ball and the death; spinners squeeze the middle.
      </div>

      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${theme.border}` }}>
        {frontline.length === 0 && (
          <div className="px-3 py-3 text-[12px] text-center" style={{ color: theme.faint }}>
            No frontline bowler in this side.
          </div>
        )}
        {frontline.map((p, i) => renderBowler(p, i))}
        {partTime.length > 0 && (
          <div
            className="disp text-[9.5px] tracking-widest px-3 py-1.5"
            style={{ color: theme.faint, background: theme.surface2, borderTop: `1px solid ${theme.border}` }}
          >
            PART-TIMERS · ONLY IF YOU HAVE TO
          </div>
        )}
        {partTime.map((p, i) => renderBowler(p, i))}
      </div>

      {rota.length > 0 && (
        <>
          <Eyebrow>HOW IT WILL BOWL</Eyebrow>
          <div
            className="rounded-xl px-2.5 py-2 flex flex-wrap gap-x-1.5 gap-y-1"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            {rota.map((id, i) => {
              const p = xi.find((x) => x.id === id)
              const over = i + 1
              const newBall = over <= RULES.powerplayUntil
              const death = over >= RULES.deathFrom
              return (
                <span
                  key={i}
                  className="disp text-[9.5px] px-1 py-0.5 rounded tracking-wide"
                  title={`Over ${over} — ${p?.name ?? id}`}
                  style={{
                    background: newBall ? 'rgba(90,169,230,.13)' : death ? 'rgba(224,74,64,.13)' : 'transparent',
                    color: p?.bowlType === 'spin' ? theme.sky : theme.muted,
                  }}
                >
                  <span className="num" style={{ color: theme.faint }}>{over}</span>{' '}
                  {p?.name.split(' ').slice(-1)[0] ?? '?'}
                </span>
              )
            })}
          </div>
          <div className="text-[10.5px] leading-snug mt-1.5 px-1" style={{ color: theme.faint }}>
            Exactly who bowls each over. Blue background is the powerplay, red the
            death; blue names are spinners.
          </div>
        </>
      )}

      <StickyFooter>
        {issues.length > 0 && (
          <div className="mb-2">
            <Notice>{issues[0].message}</Notice>
          </div>
        )}
        <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
          START THE MATCH
        </PrimaryButton>
      </StickyFooter>
    </div>
  )
}
