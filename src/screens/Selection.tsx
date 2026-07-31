import { useMemo, useState } from 'react'
import { RULES } from '../data/types'
import type { Club, Player } from '../data/types'
import { availableBowlers } from '../engine/ratings'
import { formBand } from '../engine/form'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar, roleColour, roleOf,
} from '../components/ui'

export interface SelectionIssue { message: string }

export function selectionIssues(xi: Player[], keeperAvailable = true): SelectionIssue[] {
  const issues: SelectionIssue[] = []
  if (xi.length !== 11) {
    issues.push({ message: `Pick exactly 11 — you have ${xi.length}.` })
  }
  // With both keepers unavailable somebody just has to put the gloves on, so
  // don't block selection — the engine charges for it in byes and dropped
  // chances instead.
  if (keeperAvailable && !xi.some((p) => p.wk)) {
    issues.push({ message: 'No wicketkeeper in the side.' })
  }
  // The keeper doesn't bowl, so he doesn't count towards the attack.
  const bowlers = availableBowlers(xi).length
  if (bowlers < RULES.minBowlers) {
    issues.push({ message: `Only ${bowlers} can bowl — you need ${RULES.minBowlers} to get through 45 overs.` })
  }
  return issues
}

type Sort = 'form' | 'batting' | 'bowling' | 'value'

const SORTS: [Sort, string][] = [
  ['form', 'FORM'], ['batting', 'BAT'], ['bowling', 'BWL'], ['value', '£'],
]

const batIndex = (p: Player) => 0.62 * p.bat.skill + 0.38 * p.bat.pwr
const bowlIndex = (p: Player) => 0.5 * p.bowl.def + 0.5 * p.bowl.att

export function Selection({
  squad, opponent, selected, unavailable, forms, onToggle, onAuto, onBack, onNext,
}: {
  squad: Player[]
  opponent: Club
  selected: Player[]
  /** Player id → why they're missing this week. Empty outside season mode. */
  unavailable?: Map<string, string>
  /** Tracked season form by player id. Absent in a friendly. */
  forms?: Record<string, number>
  onToggle: (p: Player) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const [sort, setSort] = useState<Sort>('batting')
  const [pickedOnly, setPickedOnly] = useState(false)

  const out = unavailable ?? new Map<string, string>()
  const ids = useMemo(() => new Set(selected.map((p) => p.id)), [selected])
  const keeperAvailable = squad.some((p) => p.wk && !out.has(p.id))
  const issues = selectionIssues(selected, keeperAvailable)
  const bowlers = availableBowlers(selected).length
  const keeper = selected.some((p) => p.wk)

  const listed = useMemo(() => {
    const rows = pickedOnly ? squad.filter((p) => ids.has(p.id)) : [...squad]
    const byName = (a: Player, b: Player) => {
      // Unavailable players sink to the bottom of whatever sort is active.
      const oa = out.has(a.id) ? 1 : 0
      const ob = out.has(b.id) ? 1 : 0
      return oa - ob
    }
    const then = (cmp: (a: Player, b: Player) => number) =>
      rows.sort((a, b) => byName(a, b) || cmp(a, b))
    switch (sort) {
      case 'batting': return then((a, b) => batIndex(b) - batIndex(a))
      case 'bowling': return then((a, b) => bowlIndex(b) - bowlIndex(a))
      case 'value': return then((a, b) => b.value - a.value)
      case 'form':
        return then((a, b) => (forms?.[b.id] ?? 50) - (forms?.[a.id] ?? 50) || batIndex(b) - batIndex(a))
      default:
        return then((a, b) => batIndex(b) - batIndex(a))
    }
  }, [squad, sort, pickedOnly, ids, out, forms])

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="SELECTION"
        subtitle={`v ${opponent.name} · 45 overs`}
        onBack={onBack}
        right={
          <div className="disp num text-xl font-bold" style={{ color: selected.length === 11 ? theme.gold : theme.cream }}>
            {selected.length}
            <span style={{ color: theme.faint }}>/11</span>
          </div>
        }
      />

      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>KEEPER</div>
          <div
            className="disp text-[13px] font-bold"
            style={{ color: keeper ? theme.green : keeperAvailable ? theme.red : theme.pitch }}
          >
            {keeper ? 'YES' : keeperAvailable ? 'NONE' : 'STAND-IN'}
          </div>
        </div>
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>BOWLERS</div>
          <div
            className="disp num text-[13px] font-bold"
            style={{ color: bowlers >= RULES.minBowlers ? theme.green : theme.red }}
          >
            {bowlers}<span style={{ color: theme.faint }}> / {RULES.minBowlers} min</span>
          </div>
        </div>
        <GhostButton onClick={onAuto} className="!px-4">AUTO</GhostButton>
      </div>

      <div className="flex gap-1.5 mb-3">
        {SORTS.map(([s, label]) => (
          <GhostButton
            key={s}
            active={sort === s && !pickedOnly}
            onClick={() => { setSort(s); setPickedOnly(false) }}
            className="flex-1 !px-1 text-center"
          >
            {label}
          </GhostButton>
        ))}
        <GhostButton
          active={pickedOnly}
          onClick={() => setPickedOnly((v) => !v)}
          className="!px-3"
        >
          PICKED
        </GhostButton>
      </div>

      <Eyebrow>
        {pickedOnly
          ? 'YOUR XI'
          : `SQUAD · ${squad.length - out.size} AVAILABLE${out.size ? ` · ${out.size} OUT` : ''}`}
      </Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        {listed.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-center" style={{ color: theme.faint }}>
            Nobody picked yet.
          </div>
        )}
        {listed.map((p, i) => {
          const on = ids.has(p.id)
          const role = roleOf(p)
          const missing = out.get(p.id)
          return (
            <button
              key={p.id}
              onClick={() => { if (!missing) onToggle(p) }}
              disabled={!!missing}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-all
                         enabled:active:scale-[0.995] disabled:cursor-not-allowed"
              style={{
                background: on ? 'rgba(233,185,73,.10)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < listed.length - 1 ? `1px solid ${theme.border}66` : 'none',
                opacity: missing ? 0.45 : 1,
              }}
            >
              <div
                className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center disp text-[11px] font-bold"
                style={{
                  background: on ? theme.gold : 'transparent',
                  border: `1px solid ${on ? theme.gold : theme.border}`,
                  color: missing ? theme.red : '#1A1405',
                }}
              >
                {missing ? '✕' : on ? '✓' : ''}
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="text-[13.5px] font-semibold truncate"
                  style={{ color: on ? theme.gold : theme.cream }}
                >
                  {p.name}
                </div>
                {missing ? (
                  // Wraps rather than truncates — the reason is half the fun.
                  <div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: theme.red }}>
                    {missing}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                      style={{ background: `${roleColour(role)}22`, color: roleColour(role) }}
                    >
                      {role}
                    </span>
                    {forms && (
                      <span
                        className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                        style={{
                          background: `${formBand(forms[p.id] ?? 50).colour}22`,
                          color: formBand(forms[p.id] ?? 50).colour,
                        }}
                      >
                        {formBand(forms[p.id] ?? 50).label}
                      </span>
                    )}
                    <span className="disp num text-[10px]" style={{ color: theme.faint }}>
                      £{p.value}m
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-1.5 shrink-0">
                <StatBar label="SKL" value={p.bat.skill} width={40} />
                <StatBar label="PWR" value={p.bat.pwr} width={40} />
                <StatBar label="DEF" value={p.bowl.def} width={40} />
                <StatBar label="ATT" value={p.bowl.att} width={40} />
              </div>
            </button>
          )
        })}
      </div>

      {!keeperAvailable && (
        <div className="mt-3">
          <Notice>
            Both keepers are unavailable. Whoever bats last will put the gloves on —
            expect byes and a couple of chances down behind the stumps.
          </Notice>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mt-3 grid gap-2">
          {issues.map((iss, i) => <Notice key={i}>{iss.message}</Notice>)}
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
          SET THE ATTACK
        </PrimaryButton>
      </div>
    </div>
  )
}
