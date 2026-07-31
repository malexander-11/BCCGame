import { useMemo } from 'react'
import { allocatedOvers, RULES, spellEnd } from '../data/types'
import type { BowlingPlan as Plan, Club, Player, Spell } from '../data/types'
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

const PHASES = [
  { key: 'powerplay', label: 'NEW BALL', from: 1, to: RULES.powerplayUntil },
  { key: 'middle', label: 'MIDDLE', from: RULES.powerplayUntil + 1, to: RULES.deathFrom - 1 },
  { key: 'death', label: 'DEATH', from: RULES.deathFrom, to: RULES.overs },
] as const

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
  const allocated = plan.reduce((s, a) => s + allocatedOvers(a), 0)
  const remaining = RULES.overs - allocated
  const issues = validatePlan(plan, xi)

  // buildRota is the first thing to draw on the match rng, so seeding it the
  // same way reproduces exactly the rota the innings will use — this is a
  // preview, not an estimate.
  const rota = useMemo(
    () => (issues.length > 0 ? [] : buildRota(plan, makeRng(seed))),
    [plan, seed, issues.length],
  )

  /** Replace one bowler's spells, dropping him entirely when none are left. */
  const setSpells = (playerId: string, spells: Spell[]) => {
    const without = plan.filter((a) => a.playerId !== playerId)
    onChange(spells.length === 0 ? without : [...without, { playerId, spells }])
  }

  const editSpell = (playerId: string, i: number, patch: Partial<Spell>) => {
    const current = byId.get(playerId)?.spells ?? []
    setSpells(playerId, current.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  /** Add a spell starting at the first over this bowler isn't already down for. */
  const addSpell = (p: Player) => {
    const current = byId.get(p.id)?.spells ?? []
    const used = allocatedOvers({ playerId: p.id, spells: current })
    const room = Math.min(remaining, RULES.maxOversPerBowler - used)
    if (room <= 0) return
    const after = current.length > 0
      ? Math.max(...current.map(spellEnd)) + 1
      : 1
    const overs = Math.min(room, 3)
    // Keep it inside the innings even if that means starting earlier.
    const from = Math.min(Math.max(after, 1), RULES.overs - (overs - 1) * 2)
    if (from < 1) return
    setSpells(p.id, [...current, { from, overs }])
  }

  const bumpOvers = (p: Player, i: number, delta: number) => {
    const current = byId.get(p.id)?.spells ?? []
    const s = current[i]
    if (!s) return
    const used = allocatedOvers({ playerId: p.id, spells: current })
    const next = s.overs + delta
    if (next < 1) { setSpells(p.id, current.filter((_, j) => j !== i)); return }
    if (delta > 0 && (remaining <= 0 || used >= RULES.maxOversPerBowler)) return
    if (spellEnd({ ...s, overs: next }) > RULES.overs) return
    editSpell(p.id, i, { overs: next })
  }

  const bumpFrom = (p: Player, i: number, delta: number) => {
    const current = byId.get(p.id)?.spells ?? []
    const s = current[i]
    if (!s) return
    const from = s.from + delta
    if (from < 1) return
    if (spellEnd({ ...s, from }) > RULES.overs) return
    editSpell(p.id, i, { from })
  }

  // What each phase of the innings will actually look like, read straight off
  // the rota rather than estimated from intentions.
  const shape = useMemo(() => PHASES.map((ph) => {
    let def = 0, att = 0, swing = 0, overs = 0, spinOvers = 0
    for (let over = ph.from; over <= ph.to; over++) {
      const p = xi.find((x) => x.id === rota[over - 1])
      if (!p) continue
      def += p.bowl.def; att += p.bowl.att; swing += p.swing ?? 0
      if (p.bowlType === 'spin') spinOvers++
      overs++
    }
    if (overs === 0) return { ...ph, def: 0, att: 0, swing: 0, overs: 0, spinOvers: 0 }
    return {
      ...ph,
      def: Math.round(def / overs), att: Math.round(att / overs),
      swing: Math.round(swing / overs), overs, spinOvers,
    }
  }), [rota, xi])

  const renderBowler = (p: Player, i: number) => {
    const alloc = byId.get(p.id)
    const spells = alloc?.spells ?? []
    const overs = alloc ? allocatedOvers(alloc) : 0
    const on = overs > 0
    const spin = p.bowlType === 'spin'
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
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: spin ? theme.sky : theme.faint }}>
              {spin ? 'SPIN' : 'PACE'}
              {on && <span style={{ color: theme.gold }}> · {overs} OV</span>}
            </div>
          </div>

          <div className="flex gap-1.5 shrink-0">
            <StatBar label="DEF" value={p.bowl.def} width={40} />
            <StatBar label="ATT" value={p.bowl.att} width={40} />
            {(p.swing ?? 0) > 0 && <StatBar label="SWG" value={p.swing!} width={40} />}
          </div>

          <button
            onClick={() => addSpell(p)}
            disabled={remaining <= 0 || overs >= RULES.maxOversPerBowler}
            aria-label={`Give ${p.name} a spell`}
            className="disp w-11 h-11 shrink-0 rounded-lg text-xl font-bold
                       active:scale-90 transition-transform disabled:opacity-30"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
          >
            +
          </button>
        </div>

        {spells.map((s, si) => {
          const last = spellEnd(s)
          const newBall = s.from <= RULES.powerplayUntil
          const death = last >= RULES.deathFrom
          return (
            <div
              key={si}
              className="slide-in mt-2 rounded-lg px-2.5 py-2"
              style={{ background: theme.bg, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>
                    SPELL {si + 1}
                  </div>
                  <div className="disp num text-[12px] font-bold mt-0.5">
                    OVERS <span style={{ color: theme.gold }}>{s.from}–{last}</span>
                    <span className="font-normal ml-1.5" style={{ color: theme.faint }}>
                      {newBall ? 'new ball' : death ? 'at the death' : 'middle'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSpells(p.id, spells.filter((_, j) => j !== si))}
                  aria-label={`Remove ${p.name}'s spell ${si + 1}`}
                  className="disp w-9 h-9 shrink-0 rounded-lg text-[13px] active:scale-90 transition-transform"
                  style={{ color: theme.red }}
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-2 mt-1.5">
                {([
                  ['COMES ON', s.from, (d: number) => bumpFrom(p, si, d), `${p.name} on earlier`, `${p.name} on later`],
                  ['OVERS', s.overs, (d: number) => bumpOvers(p, si, d), `One fewer over for ${p.name}`, `One more over for ${p.name}`],
                ] as const).map(([label, value, bump, lessLabel, moreLabel]) => (
                  <div key={label} className="flex-1">
                    <div className="disp text-[8.5px] tracking-widest mb-1" style={{ color: theme.faint }}>
                      {label}
                    </div>
                    <div className="flex items-center">
                      <button
                        onClick={() => bump(-1)}
                        aria-label={lessLabel}
                        className="disp w-11 h-11 rounded-lg text-xl font-bold active:scale-90 transition-transform"
                        style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.muted }}
                      >
                        −
                      </button>
                      <div className="disp num flex-1 text-center text-lg font-bold" style={{ color: theme.gold }}>
                        {value}
                      </div>
                      <button
                        onClick={() => bump(+1)}
                        aria-label={moreLabel}
                        className="disp w-11 h-11 rounded-lg text-xl font-bold active:scale-90 transition-transform"
                        style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {on && (p.swing ?? 0) >= 50 && !spells.some((s) => s.from <= RULES.powerplayUntil) && (
          <div className="text-[10px] mt-1.5 px-1" style={{ color: theme.pitch }}>
            {p.name} swings it — that's worth most with the new ball, and it's gone by over 13.
          </div>
        )}
        {on && spin && spells.some((s) => spellEnd(s) >= RULES.deathFrom) && (
          <div className="text-[10px] mt-1.5 px-1" style={{ color: theme.pitch }}>
            A spinner at the death goes for about a run an over more. He's worth far
            more squeezing the middle.
          </div>
        )}
        {on && !spin && spells.every((s) => s.from > RULES.powerplayUntil && spellEnd(s) < RULES.deathFrom) && (
          <div className="text-[10px] mt-1.5 px-1" style={{ color: theme.faint }}>
            Seamers leak through the middle once the shine's gone — he's better
            with the new ball or at the end.
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
        <GhostButton onClick={onAuto} className="!px-4 !py-2.5">AUTO</GhostButton>
        <GhostButton onClick={() => onChange([])} className="!px-4 !py-2.5">CLEAR</GhostButton>
        <div className="flex-1 text-[11px] leading-snug self-center px-1" style={{ color: theme.muted }}>
          Max {RULES.maxOversPerBowler} each · {RULES.minBowlers}-{RULES.maxBowlers} bowlers
        </div>
      </div>

      <div className="text-[11px] leading-relaxed mb-3 px-1" style={{ color: theme.muted }}>
        Give a bowler a <span style={{ color: theme.gold }}>spell</span>: when he comes on
        and how long for. Ends change every over, so a five-over spell from over 1
        means overs 1, 3, 5, 7 and 9. Bring him back later with a second spell.
      </div>

      <Eyebrow>WHO BOWLS, AND WHEN</Eyebrow>
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
          <Eyebrow>YOUR INNINGS SHAPE</Eyebrow>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {shape.map((ph) => (
              <div
                key={ph.key}
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
                      {ph.spinOvers > 0 && (
                        <span className="text-[10px] font-normal ml-1" style={{ color: theme.sky }}>
                          {ph.spinOvers} spin
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      <StatBar label="DEF" value={ph.def} width={36} />
                      <StatBar label="ATT" value={ph.att} width={36} />
                    </div>
                    {ph.key === 'powerplay' && (
                      <div className="mt-1"><StatBar label="SWING" value={ph.swing} width={80} /></div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <Eyebrow>HOW IT WILL BOWL</Eyebrow>
          <div
            className="rounded-xl px-2.5 py-2 flex flex-wrap gap-x-1.5 gap-y-1 mb-1.5"
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
          <div className="text-[10.5px] leading-snug mb-4 px-1" style={{ color: theme.faint }}>
            Blue background is the powerplay, red the death; blue names are spinners.
            This is exactly who bowls each over — if a spell couldn't fit where you
            asked, you'll see where he actually ended up.
          </div>
        </>
      )}

      <div className="text-[11px] leading-relaxed mb-3 px-1" style={{ color: theme.muted }}>
        Wickets come from <span style={{ color: theme.gold }}>ATT</span> and runs are saved by{' '}
        <span style={{ color: theme.gold }}>DEF</span>. Seamers own the new ball and the
        death; spinners squeeze the middle and get carted at either end.{' '}
        <span style={{ color: theme.gold }}>SWING</span> only counts for the first dozen overs.
      </div>

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
