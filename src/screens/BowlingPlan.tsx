import { useMemo } from 'react'
import { RULES } from '../data/types'
import type { BowlerAllocation, BowlingPlan as Plan, Club, Player, SpellPref } from '../data/types'
import { buildRota, validatePlan } from '../engine/rota'
import { availableBowlers } from '../engine/ratings'
import { makeRng } from '../engine/rng'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar, StickyFooter,
} from '../components/ui'

const PREFS: [SpellPref, string, string][] = [
  ['new-ball', 'NEW BALL', 'Overs 1-12'],
  ['middle', 'MIDDLE', 'Overs 10-35'],
  ['death', 'DEATH', 'Overs 36-45'],
]

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
  // part-timers below a divider so the five you'll really use are together.
  const { frontline, partTime } = useMemo(() => {
    const all = [...availableBowlers(xi)].sort((a, b) => bowlIndex(b) - bowlIndex(a))
    return {
      frontline: all.filter((p) => bowlIndex(p) >= FRONTLINE),
      partTime: all.filter((p) => bowlIndex(p) < FRONTLINE),
    }
  }, [xi])
  const byId = useMemo(() => new Map(plan.map((a) => [a.playerId, a])), [plan])
  const allocated = plan.reduce((s, a) => s + a.overs, 0)
  const remaining = RULES.overs - allocated
  const issues = validatePlan(plan, xi)

  // buildRota is the first thing to draw on the match rng, so seeding it the
  // same way reproduces exactly the rota the innings will use — this is a
  // preview, not an estimate.
  const rota = useMemo(
    () => (issues.length > 0 ? [] : buildRota(plan, makeRng(seed))),
    [plan, seed, issues.length],
  )

  const set = (playerId: string, patch: Partial<BowlerAllocation>) => {
    const existing = byId.get(playerId)
    const next: Plan = existing
      ? plan.map((a) => (a.playerId === playerId ? { ...a, ...patch } : a))
      : [...plan, { playerId, overs: 0, prefs: ['middle' as SpellPref], ...patch }]
    onChange(next.filter((a) => a.overs > 0 || a.playerId === playerId))
  }

  const bump = (p: Player, delta: number) => {
    const current = byId.get(p.id)?.overs ?? 0
    const next = Math.max(0, Math.min(RULES.maxOversPerBowler, current + delta))
    if (delta > 0 && remaining <= 0) return
    if (next === current) return
    set(p.id, { overs: next })
  }

  /** Toggle a phase on or off. A bowler with overs must keep at least one. */
  const togglePhase = (playerId: string, pref: SpellPref) => {
    const current = byId.get(playerId)?.prefs ?? []
    const next = current.includes(pref)
      ? current.filter((x) => x !== pref)
      : [...current, pref]
    set(playerId, { prefs: next })
  }

  // What each phase of the innings actually looks like under this plan. A
  // bowler set to two phases splits his overs between them, which is the
  // honest reading — the rota will spread him across both windows.
  const phaseProfile = useMemo(() => {
    const used = plan.filter((a) => a.overs > 0 && a.prefs.length > 0)
    const build = (pref: SpellPref) => {
      let def = 0, att = 0, swing = 0, overs = 0
      for (const a of used) {
        if (!a.prefs.includes(pref)) continue
        const p = xi.find((x) => x.id === a.playerId)
        if (!p) continue
        const share = a.overs / a.prefs.length
        def += p.bowl.def * share
        att += p.bowl.att * share
        swing += (p.swing ?? 0) * share
        overs += share
      }
      if (overs === 0) return null
      return {
        def: Math.round(def / overs),
        att: Math.round(att / overs),
        swing: Math.round(swing / overs),
        overs: Math.round(overs * 10) / 10,
      }
    }
    return PREFS.map(([pref, label]) => ({
      label, pref, ...(build(pref) ?? { def: 0, att: 0, swing: 0, overs: 0 }),
    }))
  }, [plan, xi])

  const renderBowler = (p: Player, i: number) => {
    const alloc = byId.get(p.id)
    const overs = alloc?.overs ?? 0
    const on = overs > 0
    return (
      <div
        key={p.id}
        className="px-3 py-2.5"
        style={{
          background: on ? 'rgba(233,185,73,.08)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
          borderTop: i > 0 ? `1px solid ${theme.border}66` : 'none',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold truncate" style={{ color: on ? theme.gold : theme.cream }}>
              {p.name}
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: theme.faint }}>
              {(p.bowlType ?? 'pace').toUpperCase()}
            </div>
          </div>

          <div className="flex gap-1.5 shrink-0">
            <StatBar label="DEF" value={p.bowl.def} width={40} />
            <StatBar label="ATT" value={p.bowl.att} width={40} />
            {(p.swing ?? 0) > 0 && <StatBar label="SWG" value={p.swing!} width={40} />}
          </div>

          {/* The most-tapped control in the game — worth a real target. */}
          <div className="flex items-center shrink-0 ml-1">
            <button
              onClick={() => bump(p, -1)}
              aria-label={`One fewer over for ${p.name}`}
              className="disp w-11 h-11 rounded-lg text-xl font-bold active:scale-90 transition-transform"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.muted }}
            >
              −
            </button>
            <div
              className="disp num w-8 text-center text-lg font-bold"
              style={{ color: on ? theme.gold : theme.faint }}
            >
              {overs}
            </div>
            <button
              onClick={() => bump(p, +1)}
              aria-label={`One more over for ${p.name}`}
              disabled={remaining <= 0 || overs >= RULES.maxOversPerBowler}
              className="disp w-11 h-11 rounded-lg text-xl font-bold active:scale-90 transition-transform disabled:opacity-35"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
            >
              +
            </button>
          </div>
        </div>

        {on && (
          <div className="slide-in">
            <div className="flex gap-1.5 mt-2">
              {PREFS.map(([pref, label]) => (
                <GhostButton
                  key={pref}
                  active={alloc?.prefs.includes(pref) ?? false}
                  onClick={() => togglePhase(p.id, pref)}
                  className="flex-1 !px-1 !py-2.5 !text-[10px] text-center"
                >
                  {label}
                </GhostButton>
              ))}
            </div>
            {(alloc?.prefs.length ?? 0) === 0 && (
              <div className="text-[10px] mt-1.5 px-1" style={{ color: theme.red }}>
                Pick at least one spell for {p.name}.
              </div>
            )}
            {(p.swing ?? 0) >= 50 && !alloc?.prefs.includes('new-ball') && (
              <div className="text-[10px] mt-1.5 px-1" style={{ color: theme.pitch }}>
                {p.name} swings it — that's worth most with the new ball.
              </div>
            )}
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
              style={{ color: remaining === 0 ? theme.gold : remaining < 0 ? theme.red : theme.cream }}
            >
              {allocated}<span style={{ color: theme.faint }}>/{RULES.overs}</span>
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: theme.faint }}>
              {remaining > 0 ? `${remaining} LEFT` : remaining === 0 ? 'SET' : 'OVER'}
            </div>
          </div>
        }
      />

      <div className="flex gap-2 mb-3">
        <GhostButton onClick={onAuto} className="!px-4">AUTO</GhostButton>
        <GhostButton onClick={() => onChange([])} className="!px-4">CLEAR</GhostButton>
        <div className="flex-1 text-[11px] leading-snug self-center px-1" style={{ color: theme.muted }}>
          Max {RULES.maxOversPerBowler} each · {RULES.minBowlers}-{RULES.maxBowlers} bowlers
        </div>
      </div>

      <Eyebrow>WHO BOWLS, AND HOW MUCH</Eyebrow>
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

      <Eyebrow>YOUR INNINGS SHAPE</Eyebrow>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {phaseProfile.map((ph) => (
          <div
            key={ph.pref}
            className="rounded-lg px-2.5 py-2"
            style={{
              background: theme.surface,
              border: `1px solid ${ph.overs === 0 ? `${theme.red}55` : theme.border}`,
            }}
          >
            <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>{ph.label}</div>
            {ph.overs === 0 ? (
              <div className="disp text-[12px] font-bold mt-1" style={{ color: theme.red }}>NOBODY</div>
            ) : (
              <>
                <div className="disp num text-[15px] font-bold mt-0.5">
                  {ph.overs}<span className="text-[10px] font-normal" style={{ color: theme.faint }}> ov</span>
                </div>
                <div className="flex gap-1.5 mt-1">
                  <StatBar label="DEF" value={ph.def} width={36} />
                  <StatBar label="ATT" value={ph.att} width={36} />
                </div>
                {ph.pref === 'new-ball' && (
                  <div className="mt-1">
                    <StatBar label="SWING" value={ph.swing} width={80} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="text-[11px] leading-relaxed mb-3 px-1" style={{ color: theme.muted }}>
        Wickets come from <span style={{ color: theme.gold }}>ATT</span> and runs are saved by{' '}
        <span style={{ color: theme.gold }}>DEF</span>, so squeeze the middle with your miser and
        strike at the death. <span style={{ color: theme.gold }}>SWING</span> only counts for the
        first dozen overs — a swing bowler held back has wasted his best asset. Pick more than one
        spell to keep a bowler available across both windows.
      </div>

      {rota.length > 0 && (
        <div className="mb-4">
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
                    color: theme.muted,
                  }}
                >
                  <span className="num" style={{ color: theme.faint }}>{over}</span>{' '}
                  {p?.name.split(' ').slice(-1)[0] ?? '?'}
                </span>
              )
            })}
          </div>
          <div className="text-[10.5px] leading-snug mt-1.5 px-1" style={{ color: theme.faint }}>
            Blue is the powerplay, red the death. This is the order they'll actually
            come on — check your swing bowlers are in the blue.
          </div>
        </div>
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
