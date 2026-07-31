import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { card, panel, ratingColour, theme } from '../theme'

/** Big gold call-to-action. The one button per screen that moves you forward. */
export function PrimaryButton({
  children, onClick, disabled, tone = 'gold',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'gold' | 'quiet'
}) {
  const gold = tone === 'gold'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="disp w-full py-4 rounded-xl text-2xl font-bold tracking-[0.18em]
                 active:scale-[0.98] transition-all disabled:cursor-not-allowed"
      style={{
        background: disabled ? theme.surface2 : gold ? theme.gold : theme.surface2,
        color: disabled ? theme.faint : gold ? '#1A1405' : theme.cream,
        border: `1px solid ${disabled ? theme.border : gold ? theme.gold : theme.border}`,
        boxShadow: disabled || !gold ? 'none' : '0 6px 28px rgba(233,185,73,.32)',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children, onClick, active, className = '', style,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      className={`disp rounded-lg font-bold tracking-[0.12em] px-3 py-2 text-[12px]
                  active:scale-[0.97] transition-all ${className}`}
      style={{
        background: active ? theme.gold : 'rgba(24,43,33,0.6)',
        color: active ? '#1A1405' : theme.muted,
        border: `1px solid ${active ? theme.gold : theme.border}`,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Section heading — the small spaced-out label above every block. */
export function Eyebrow({ children, colour = theme.pitch }: { children: ReactNode; colour?: string }) {
  return (
    <div className="disp tracking-[0.25em] text-[11px] mb-2 font-semibold" style={{ color: colour }}>
      {children}
    </div>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${className}`} style={panel}>
      {children}
    </div>
  )
}

export function Card({
  children, className = '', style,
}: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ ...card, ...style }}>
      {children}
    </div>
  )
}

/** A 0-100 rating as a labelled bar. The whole game is reading these. */
export function StatBar({
  label, value, width = 46,
}: { label: string; value: number; width?: number }) {
  const colour = ratingColour(value)
  return (
    <div className="shrink-0" style={{ width }}>
      <div className="flex items-baseline justify-between">
        <span className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>
          {label}
        </span>
        <span className="disp num text-[12px] font-bold" style={{ color: colour }}>
          {value}
        </span>
      </div>
      <div className="h-[3px] rounded-full mt-[2px]" style={{ background: 'rgba(255,255,255,.07)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: colour }}
        />
      </div>
    </div>
  )
}

/** Header bar: back arrow, title, and a step counter on the right. */
export function ScreenHeader({
  title, subtitle, onBack, right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-3 rounded-2xl px-4 py-3" style={panel}>
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="disp text-xl shrink-0 px-2 -ml-2 active:scale-95 transition-transform"
            style={{ color: theme.muted }}
          >
            ←
          </button>
        )}
        <div className="min-w-0">
          <div className="disp text-2xl font-bold tracking-wide leading-none truncate">{title}</div>
          {subtitle && (
            <div className="text-[11px] mt-1 truncate" style={{ color: theme.muted }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {right && <div className="shrink-0 ml-3">{right}</div>}
    </div>
  )
}

export function Brand() {
  return (
    <div className="text-center">
      <div className="brandface text-[42px] leading-none tracking-tight">
        BAGSHOT<span style={{ color: theme.gold }}>CC</span>
      </div>
      <div
        className="disp tracking-[0.3em] text-[11px] mt-1"
        style={{ color: theme.muted }}
      >
        BOWL FIRST · THEN CHASE
      </div>
    </div>
  )
}

/**
 * The screen's primary action, pinned to the bottom of the viewport.
 *
 * Selection runs to well over two thousand pixels on a phone. Without this you
 * scroll the whole squad twice — once to pick, once to reach the button.
 */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 pt-3 pb-3 mt-4"
      style={{
        // Fades the list out under the bar rather than cutting it off.
        background: `linear-gradient(to top, ${theme.bg} 68%, ${theme.bg}00)`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * A button that wants asking twice.
 *
 * Abandoning a season or resetting the squad throws away real work, and both
 * were a single tap. First tap arms and relabels, second commits, and it
 * disarms itself after a few seconds so it can't sit armed and catch you out.
 */
export function ConfirmButton({
  children, confirmLabel = 'SURE? TAP AGAIN', onConfirm, className = '', style,
}: {
  children: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  className?: string
  style?: CSSProperties
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <GhostButton
      onClick={() => {
        if (!armed) { setArmed(true); return }
        setArmed(false)
        onConfirm()
      }}
      className={className}
      style={armed ? { ...style, background: theme.redDeep, color: theme.cream, borderColor: theme.red } : style}
    >
      {armed ? confirmLabel : children}
    </GhostButton>
  )
}

/** Inline validation message. */
export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'ok' }) {
  const colour = tone === 'ok' ? theme.green : theme.red
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px] leading-snug"
      style={{ background: 'rgba(0,0,0,.25)', border: `1px solid ${colour}55`, color: colour }}
    >
      {children}
    </div>
  )
}

export function roleOf(p: { bat: { skill: number }; bowl: { def: number; att: number }; wk?: boolean }): string {
  if (p.wk) return 'WK'
  const bowls = p.bowl.def > 0 && p.bowl.att > 0
  const bowlAvg = (p.bowl.def + p.bowl.att) / 2
  if (!bowls) return 'BAT'
  if (p.bat.skill >= 55 && bowlAvg >= 60) return 'AR'
  if (bowlAvg >= 60) return 'BOWL'
  return 'BAT'
}

export function roleColour(role: string): string {
  switch (role) {
    case 'WK': return theme.sky
    case 'AR': return theme.gold
    case 'BOWL': return theme.red
    default: return theme.green
  }
}

/**
 * 1 → "1st", 2 → "2nd", 11 → "11th".
 *
 * The `(v - 20) % 10` index goes negative for anything under twenty, which is
 * exactly what we want for the teens — `s[-9]` is undefined so it falls through
 * to `s[v]` and 13 gets "th". Drop that second fallback and every position from
 * one to nine silently comes out as "1th".
 */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** Colour a 0-10 availability score. Green turns up, red barely plays. */
export function availabilityColour(v: number): string {
  if (v >= 9) return theme.green
  if (v >= 7) return theme.cream
  if (v >= 5) return theme.pitch
  if (v >= 3) return theme.gold
  return theme.red
}
