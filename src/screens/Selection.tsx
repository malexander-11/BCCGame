import { useMemo } from 'react'
import { RULES } from '../data/types'
import type { Club, Player } from '../data/types'
import { isBowler } from '../engine/ratings'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar, roleColour, roleOf,
} from '../components/ui'

export interface SelectionIssue { message: string }

export function selectionIssues(xi: Player[]): SelectionIssue[] {
  const issues: SelectionIssue[] = []
  if (xi.length !== 11) {
    issues.push({ message: `Pick exactly 11 — you have ${xi.length}.` })
  }
  if (!xi.some((p) => p.wk)) {
    issues.push({ message: 'No wicketkeeper in the side.' })
  }
  const bowlers = xi.filter(isBowler).length
  if (bowlers < RULES.minBowlers) {
    issues.push({ message: `Only ${bowlers} can bowl — you need ${RULES.minBowlers} to get through 45 overs.` })
  }
  return issues
}

export function Selection({
  squad, opponent, selected, onToggle, onAuto, onBack, onNext,
}: {
  squad: Player[]
  opponent: Club
  selected: Player[]
  onToggle: (p: Player) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const ids = useMemo(() => new Set(selected.map((p) => p.id)), [selected])
  const issues = selectionIssues(selected)
  const bowlers = selected.filter(isBowler).length
  const keeper = selected.some((p) => p.wk)

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
          <div className="disp text-[13px] font-bold" style={{ color: keeper ? theme.green : theme.red }}>
            {keeper ? 'YES' : 'NONE'}
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

      <Eyebrow>SQUAD</Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        {squad.map((p, i) => {
          const on = ids.has(p.id)
          const role = roleOf(p)
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 active:scale-[0.995] transition-all"
              style={{
                background: on ? 'rgba(233,185,73,.10)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < squad.length - 1 ? `1px solid ${theme.border}66` : 'none',
              }}
            >
              <div
                className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center disp text-[11px] font-bold"
                style={{
                  background: on ? theme.gold : 'transparent',
                  border: `1px solid ${on ? theme.gold : theme.border}`,
                  color: '#1A1405',
                }}
              >
                {on ? '✓' : ''}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold truncate" style={{ color: on ? theme.gold : theme.cream }}>
                  {p.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                    style={{ background: `${roleColour(role)}22`, color: roleColour(role) }}
                  >
                    {role}
                  </span>
                  <span className="disp text-[10px]" style={{ color: theme.faint }}>
                    {p.positions[0]}–{p.positions[1]}
                  </span>
                </div>
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
