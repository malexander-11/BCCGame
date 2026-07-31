import { useMemo, useState } from 'react'
import { DEFAULT_AVAILABILITY, RULES } from '../data/types'
import type { Club, Player } from '../data/types'
import { availableBowlers } from '../engine/ratings'
import { formBand } from '../engine/form'
import { theme } from '../theme'
import {
  availabilityColour, Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader,
  StatBar, StickyFooter, roleColour, roleOf,
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

type Sort = 'form' | 'batting' | 'bowling' | 'avail' | 'value'

const SORTS: [Sort, string][] = [
  ['form', 'FORM'], ['batting', 'BAT'], ['bowling', 'BWL'], ['avail', 'AVL'], ['value', '£'],
]

const batIndex = (p: Player) => 0.62 * p.bat.skill + 0.38 * p.bat.pwr
const bowlIndex = (p: Player) => 0.5 * p.bowl.def + 0.5 * p.bowl.att
const availOf = (p: Player) => p.availability ?? DEFAULT_AVAILABILITY

export function Selection({
  squad, opponent, selected, unavailable, forms, onToggle, onReorder, onAuto, onBack, onNext,
}: {
  squad: Player[]
  opponent: Club
  selected: Player[]
  /** Player id → why they're missing this week. Empty outside season mode. */
  unavailable?: Map<string, string>
  /** Tracked season form by player id. Absent in a friendly. */
  forms?: Record<string, number>
  onToggle: (p: Player) => void
  /** The XI *is* the batting order, so reordering is reordering the array. */
  onReorder: (order: Player[]) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const [sort, setSort] = useState<Sort>('batting')
  const [pickedOnly, setPickedOnly] = useState(false)
  /** Hide players who can't play this week. On by default when there are any. */
  const [availableOnly, setAvailableOnly] = useState(true)
  /** Slot currently picked up, waiting for somewhere to go. */
  const [held, setHeld] = useState<number | null>(null)

  const swap = (i: number) => {
    if (held === null) { setHeld(i); return }
    if (held === i) { setHeld(null); return }
    const next = [...selected]
    const a = next[held]
    next[held] = next[i]
    next[i] = a
    onReorder(next)
    setHeld(null)
  }

  /** Nudge a player one place up or down the order. */
  const shift = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= selected.length) return
    const next = [...selected]
    const a = next[i]
    next[i] = next[j]
    next[j] = a
    onReorder(next)
    setHeld(null)
  }

  const out = unavailable ?? new Map<string, string>()
  const ids = useMemo(() => new Set(selected.map((p) => p.id)), [selected])
  const keeperAvailable = squad.some((p) => p.wk && !out.has(p.id))
  const issues = selectionIssues(selected, keeperAvailable)
  const bowlers = availableBowlers(selected).length
  const keeper = selected.some((p) => p.wk)

  const listed = useMemo(() => {
    const rows = pickedOnly
      ? squad.filter((p) => ids.has(p.id))
      // Anyone unavailable is dead weight between you and the button, so hide
      // them by default — the team news screen is where you read the reasons.
      : squad.filter((p) => !availableOnly || !out.has(p.id) || ids.has(p.id))
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
      case 'avail': return then((a, b) => availOf(b) - availOf(a) || batIndex(b) - batIndex(a))
      case 'form':
        return then((a, b) => (forms?.[b.id] ?? 50) - (forms?.[a.id] ?? 50) || batIndex(b) - batIndex(a))
      default:
        return then((a, b) => batIndex(b) - batIndex(a))
    }
  }, [squad, sort, pickedOnly, availableOnly, ids, out, forms])

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

      <Eyebrow colour={theme.gold}>
        YOUR XI · BATTING ORDER
      </Eyebrow>
      <div
        className="rounded-xl overflow-hidden mb-3"
        style={{ border: `1px solid ${selected.length === 11 ? theme.gold : theme.border}` }}
      >
        {selected.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-center" style={{ color: theme.faint }}>
            Tap players below to pick them. They bat in the order you add them.
          </div>
        ) : (
          selected.map((p, i) => {
            const holding = held === i
            return (
              <div
                key={p.id}
                className="flex items-stretch"
                style={{
                  background: holding
                    ? 'rgba(233,185,73,.20)'
                    : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                  borderBottom: i < selected.length - 1 ? `1px solid ${theme.border}55` : 'none',
                  outline: holding ? `1px solid ${theme.gold}` : 'none',
                  outlineOffset: -1,
                }}
              >
                <button
                  onClick={() => swap(i)}
                  className="text-left pl-3 pr-2 py-2 flex items-center gap-2.5 flex-1 min-w-0
                             active:scale-[0.995] transition-all"
                  style={{ minHeight: 44 }}
                >
                  <span
                    className="disp num w-5 text-center text-[13px] font-bold shrink-0"
                    style={{ color: holding ? theme.gold : theme.faint }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold truncate flex-1" style={{ color: holding ? theme.gold : theme.cream }}>
                    {p.name}
                    {p.wk && (
                      <span className="disp text-[9px] ml-1.5 tracking-wider" style={{ color: theme.sky }}>†</span>
                    )}
                  </span>
                  <span className="disp num text-[10px] shrink-0" style={{ color: theme.faint }}>
                    {p.bat.skill}/{p.bat.pwr}
                  </span>
                </button>

                {/* One place at a time. Tap-to-swap above still handles long moves. */}
                <div className="flex shrink-0">
                  {([[-1, '▲', 'up'], [1, '▼', 'down']] as const).map(([by, glyph, word]) => (
                    <button
                      key={word}
                      onClick={() => shift(i, by)}
                      disabled={by === -1 ? i === 0 : i === selected.length - 1}
                      aria-label={`Move ${p.name} ${word} the order`}
                      className="disp text-[11px] w-9 flex items-center justify-center
                                 active:scale-90 transition-transform disabled:opacity-25"
                      style={{ color: theme.muted, borderLeft: `1px solid ${theme.border}55` }}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selected.length > 0 && (
        <div className="text-[11px] leading-snug mb-3 px-1" style={{ color: theme.muted }}>
          {held === null
            ? 'Tap a name above to move him, then tap where he should bat.'
            : `Moving ${selected[held].name} — tap the slot he should take.`}
        </div>
      )}

      <div className="flex gap-1.5 mb-2">
        {SORTS.map(([s, label]) => (
          <GhostButton
            key={s}
            active={sort === s && !pickedOnly}
            onClick={() => { setSort(s); setPickedOnly(false) }}
            className="flex-1 !px-1 text-center !py-2.5"
          >
            {label}
          </GhostButton>
        ))}
      </div>
      <div className="flex gap-1.5 mb-3">
        <GhostButton
          active={pickedOnly}
          onClick={() => setPickedOnly((v) => !v)}
          className="flex-1 text-center !py-2.5"
        >
          PICKED ONLY
        </GhostButton>
        {out.size > 0 && (
          <GhostButton
            active={availableOnly}
            onClick={() => setAvailableOnly((v) => !v)}
            className="flex-1 text-center !py-2.5"
          >
            {availableOnly ? `HIDING ${out.size} OUT` : `SHOWING ${out.size} OUT`}
          </GhostButton>
        )}
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
                    <span
                      className="disp num text-[9px] font-bold px-1.5 rounded tracking-wider"
                      title={`Availability ${availOf(p)}/10 — how often he turns up`}
                      style={{
                        background: `${availabilityColour(availOf(p))}22`,
                        color: availabilityColour(availOf(p)),
                      }}
                    >
                      {availOf(p)}/10
                    </span>
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

      <StickyFooter>
        {issues.length > 0 && (
          <div className="mb-2">
            <Notice>{issues[0].message}</Notice>
          </div>
        )}
        <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
          {issues.length > 0 ? `${selected.length}/11 PICKED` : 'SET THE ATTACK'}
        </PrimaryButton>
      </StickyFooter>
    </div>
  )
}
