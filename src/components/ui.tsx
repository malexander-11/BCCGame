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

/** Colour a 0-10 availability score. Green turns up, red barely plays. */
export function availabilityColour(v: number): string {
  if (v >= 9) return theme.green
  if (v >= 7) return theme.cream
  if (v >= 5) return theme.pitch
  if (v >= 3) return theme.gold
  return theme.red
}
