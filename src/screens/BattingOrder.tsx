import { useState } from 'react'
import { RULES } from '../data/types'
import type { Player } from '../data/types'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, PrimaryButton, ScreenHeader, StatBar, roleColour, roleOf,
} from '../components/ui'

/**
 * Tap one player, tap another, they swap. Simplest reliable reorder on a phone
 * — no drag handles to miss.
 */
export function BattingOrder({
  order, target, onChange, onAuto, onBack, onNext,
}: {
  order: Player[]
  target: number
  onChange: (order: Player[]) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const [held, setHeld] = useState<number | null>(null)

  const tap = (i: number) => {
    if (held === null) { setHeld(i); return }
    if (held === i) { setHeld(null); return }
    const next = [...order]
    const a = next[held]
    next[held] = next[i]
    next[i] = a
    onChange(next)
    setHeld(null)
  }

  const outOfPosition = order.filter((p, i) => {
    const slot = i + 1
    return slot < p.positions[0] || slot > p.positions[1]
  }).length

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="BATTING ORDER"
        subtitle={`Chasing ${target} from ${RULES.overs} overs`}
        onBack={onBack}
        right={
          <div className="text-right">
            <div className="disp num text-xl font-bold leading-none" style={{ color: theme.gold }}>
              {(target / RULES.overs).toFixed(2)}
            </div>
            <div className="disp text-[10px] tracking-wider" style={{ color: theme.faint }}>PER OVER</div>
          </div>
        }
      />

      <div className="flex gap-2 mb-3">
        <GhostButton onClick={onAuto} className="!px-4">AUTO</GhostButton>
        <div className="flex-1 text-[11px] leading-snug self-center px-1" style={{ color: theme.muted }}>
          {held === null
            ? 'Tap a player, then tap another to swap them.'
            : `Swapping ${order[held].name} — tap where he should bat.`}
        </div>
      </div>

      <Eyebrow>THE ORDER</Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        {order.map((p, i) => {
          const slot = i + 1
          const oop = slot < p.positions[0] || slot > p.positions[1]
          const selected = held === i
          const role = roleOf(p)
          return (
            <button
              key={p.id}
              onClick={() => tap(i)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.995] transition-all"
              style={{
                background: selected
                  ? 'rgba(233,185,73,.18)'
                  : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < order.length - 1 ? `1px solid ${theme.border}66` : 'none',
                outline: selected ? `1px solid ${theme.gold}` : 'none',
                outlineOffset: -1,
              }}
            >
              <div
                className="disp num w-6 text-center text-[15px] font-bold shrink-0"
                style={{ color: selected ? theme.gold : theme.faint }}
              >
                {slot}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold truncate" style={{ color: selected ? theme.gold : theme.cream }}>
                  {p.name}
                  {p.wk && (
                    <span className="disp text-[9px] ml-1.5 tracking-wider" style={{ color: theme.sky }}>†</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                    style={{ background: `${roleColour(role)}22`, color: roleColour(role) }}
                  >
                    {role}
                  </span>
                  <span
                    className="disp text-[10px]"
                    style={{ color: oop ? theme.red : theme.faint }}
                  >
                    bats {p.positions[0]}–{p.positions[1]}{oop ? ' · out of position' : ''}
                  </span>
                </div>
              </div>

              <div className="flex gap-1.5 shrink-0">
                <StatBar label="SKL" value={p.bat.skill} width={42} />
                <StatBar label="PWR" value={p.bat.pwr} width={42} />
              </div>
            </button>
          )
        })}
      </div>

      <div className="text-[11px] leading-relaxed mt-3 px-1" style={{ color: theme.muted }}>
        {outOfPosition > 0 ? (
          <>
            <span style={{ color: theme.red }}>{outOfPosition} out of position.</span>{' '}
            They can still bat there, they just won't be as good at it.
          </>
        ) : (
          <>Everyone is batting where they bat. Early wickets cost you the chase, so protect the top order.</>
        )}
      </div>

      <div className="mt-4">
        <PrimaryButton onClick={onNext}>GO OUT AND BAT</PrimaryButton>
      </div>
    </div>
  )
}
