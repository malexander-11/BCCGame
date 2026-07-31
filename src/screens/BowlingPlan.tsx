import { useMemo } from 'react'
import { RULES } from '../data/types'
import type { BowlerAllocation, BowlingPlan as Plan, Club, Player, SpellPref } from '../data/types'
import { validatePlan } from '../engine/rota'
import { isBowler } from '../engine/ratings'
import { theme } from '../theme'
import { Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar } from '../components/ui'

const PREFS: [SpellPref, string, string][] = [
  ['new-ball', 'NEW BALL', 'Overs 1-12'],
  ['middle', 'MIDDLE', 'Overs 10-35'],
  ['death', 'DEATH', 'Overs 36-45'],
]

export function BowlingPlan({
  xi, opponent, plan, onChange, onAuto, onBack, onNext,
}: {
  xi: Player[]
  opponent: Club
  plan: Plan
  onChange: (plan: Plan) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const bowlers = useMemo(() => xi.filter(isBowler), [xi])
  const byId = useMemo(() => new Map(plan.map((a) => [a.playerId, a])), [plan])
  const allocated = plan.reduce((s, a) => s + a.overs, 0)
  const remaining = RULES.overs - allocated
  const issues = validatePlan(plan, xi)

  const set = (playerId: string, patch: Partial<BowlerAllocation>) => {
    const existing = byId.get(playerId)
    const next: Plan = existing
      ? plan.map((a) => (a.playerId === playerId ? { ...a, ...patch } : a))
      : [...plan, { playerId, overs: 0, pref: 'middle' as SpellPref, ...patch }]
    onChange(next.filter((a) => a.overs > 0 || a.playerId === playerId))
  }

  const bump = (p: Player, delta: number) => {
    const current = byId.get(p.id)?.overs ?? 0
    const next = Math.max(0, Math.min(RULES.maxOversPerBowler, current + delta))
    if (delta > 0 && remaining <= 0) return
    if (next === current) return
    set(p.id, { overs: next })
  }

  // What each phase of the innings actually looks like under this plan.
  const phaseProfile = useMemo(() => {
    const used = plan.filter((a) => a.overs > 0)
    const build = (pref: SpellPref) => {
      const group = used.filter((a) => a.pref === pref)
      if (group.length === 0) return null
      let def = 0, att = 0, overs = 0
      for (const a of group) {
        const p = xi.find((x) => x.id === a.playerId)
        if (!p) continue
        def += p.bowl.def * a.overs
        att += p.bowl.att * a.overs
        overs += a.overs
      }
      if (overs === 0) return null
      return { def: Math.round(def / overs), att: Math.round(att / overs), overs }
    }
    return PREFS.map(([pref, label]) => ({ label, pref, ...(build(pref) ?? { def: 0, att: 0, overs: 0 }) }))
  }, [plan, xi])

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
        {bowlers.map((p, i) => {
          const alloc = byId.get(p.id)
          const overs = alloc?.overs ?? 0
          const on = overs > 0
          return (
            <div
              key={p.id}
              className="px-3 py-2.5"
              style={{
                background: on ? 'rgba(233,185,73,.08)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < bowlers.length - 1 ? `1px solid ${theme.border}66` : 'none',
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
                  <StatBar label="DEF" value={p.bowl.def} width={42} />
                  <StatBar label="ATT" value={p.bowl.att} width={42} />
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <button
                    onClick={() => bump(p, -1)}
                    aria-label={`One fewer over for ${p.name}`}
                    className="disp w-7 h-7 rounded-lg text-lg font-bold active:scale-90 transition-transform"
                    style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.muted }}
                  >
                    −
                  </button>
                  <div
                    className="disp num w-7 text-center text-lg font-bold"
                    style={{ color: on ? theme.gold : theme.faint }}
                  >
                    {overs}
                  </div>
                  <button
                    onClick={() => bump(p, +1)}
                    aria-label={`One more over for ${p.name}`}
                    disabled={remaining <= 0 || overs >= RULES.maxOversPerBowler}
                    className="disp w-7 h-7 rounded-lg text-lg font-bold active:scale-90 transition-transform disabled:opacity-35"
                    style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
                  >
                    +
                  </button>
                </div>
              </div>

              {on && (
                <div className="flex gap-1.5 mt-2 slide-in">
                  {PREFS.map(([pref, label]) => (
                    <GhostButton
                      key={pref}
                      active={alloc?.pref === pref}
                      onClick={() => set(p.id, { pref })}
                      className="flex-1 !px-1 !py-1.5 !text-[9.5px] text-center"
                    >
                      {label}
                    </GhostButton>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
                  <StatBar label="DEF" value={ph.def} width={38} />
                  <StatBar label="ATT" value={ph.att} width={38} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="text-[11px] leading-relaxed mb-3 px-1" style={{ color: theme.muted }}>
        Wickets come from <span style={{ color: theme.gold }}>ATT</span>, so give your strike bowlers
        the new ball and the death. Runs are saved by <span style={{ color: theme.gold }}>DEF</span> —
        put your miser through the middle overs and starve them.
      </div>

      {issues.length > 0 && (
        <div className="grid gap-2 mb-3">
          {issues.map((iss, i) => <Notice key={i}>{iss.message}</Notice>)}
        </div>
      )}

      <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
        START THE MATCH
      </PrimaryButton>
    </div>
  )
}
