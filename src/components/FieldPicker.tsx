import { FIELDS, fieldPush } from '../data/types'
import type { Field } from '../data/types'
import { fieldEffect } from '../engine/innings'
import { theme } from '../theme'
import { Eyebrow } from './ui'

/** Just enough of a bowler to price up a field for him. */
export interface FieldBowler {
  name: string
  def: number
  att: number
}

const pc = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

/**
 * Where the fielders go, with the recommendation pre-selected and — the bit
 * that makes it a decision rather than a dial — what it's actually worth to the
 * men who have to bowl to it.
 *
 * The same field is a bargain behind a strike bowler and a waste behind a
 * part-timer, so showing the numbers per bowler is the whole explanation.
 */
export function FieldPicker({
  value, recommended, bowlers, settled = 0.5, onChange,
  heading = 'WHERE DO THE FIELDERS GO?',
}: {
  value: Field
  recommended: Field
  /** Who is bowling this block. Empty is fine — the trade panel just hides. */
  bowlers: FieldBowler[]
  /**
   * How set the men at the crease are, 0-1. Attacking a new batter is a bargain
   * and attacking a set one is expensive, so the numbers below move as the
   * innings does.
   */
  settled?: number
  onChange: (f: Field) => void
  heading?: string
}) {
  const chosen = FIELDS.find((f) => f.id === value)!
  const push = fieldPush(value)

  return (
    <>
      <Eyebrow colour={theme.gold}>{heading}</Eyebrow>
      <div className="flex gap-1.5 mb-2">
        {FIELDS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className="disp flex-1 rounded-lg font-bold tracking-[0.06em] px-1 text-[10px]
                       active:scale-[0.97] transition-all"
            style={{
              minHeight: 46,
              background: value === f.id ? theme.gold : 'rgba(24,43,33,0.6)',
              color: value === f.id ? '#1A1405' : theme.muted,
              border: `1px solid ${
                value === f.id ? theme.gold : f.id === recommended ? `${theme.gold}66` : theme.border
              }`,
            }}
          >
            {f.label}
            {f.id === recommended && (
              <div
                className="text-[7.5px] tracking-widest font-normal mt-0.5"
                style={{ color: value === f.id ? '#1A1405' : theme.goldDim }}
              >
                SUGGESTED
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="text-[11px] leading-snug mb-2 px-1" style={{ color: theme.muted }}>
        {chosen.blurb}
      </div>

      {bowlers.length > 0 && (
        <div
          className="rounded-lg overflow-hidden mb-3"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          <div
            className="disp text-[8.5px] tracking-widest px-2.5 py-1.5"
            style={{ color: theme.faint, background: theme.surface2 }}
          >
            WHAT THAT'S WORTH TO THEM
          </div>
          {bowlers.map((b, i) => {
            const e = fieldEffect(push, b.def, b.att, settled)
            const d = push - 1
            // Does this field suit *him*? Bringing men up is a good deal when
            // his penetration buys more than the gaps cost; pushing them back is
            // only worth it if he's disciplined enough to bowl to it.
            const suits = d > 0
              ? e.wicket - 1 >= (e.boundary - 1) * 1.15
              : d < 0 && 1 - e.boundary >= 0.14
            return (
              <div
                key={b.name}
                className="px-2.5 py-1.5 flex items-baseline gap-2 text-[11px]"
                style={{ borderTop: i > 0 ? `1px solid ${theme.border}55` : 'none' }}
              >
                <span className="flex-1 truncate font-semibold">{b.name}</span>
                {/* Coloured by whether it's good news for you, not by column. */}
                <span
                  className="disp num shrink-0 w-16 text-right"
                  style={{ color: e.wicket >= 1 ? theme.green : theme.pitch }}
                >
                  {pc(e.wicket)} wkts
                </span>
                <span
                  className="disp num shrink-0 w-16 text-right"
                  style={{ color: e.boundary > 1 ? theme.red : theme.green }}
                >
                  {pc(e.boundary)} fours
                </span>
                <span
                  className="disp text-[13px] w-3 text-center shrink-0"
                  title={suits ? `Suits ${b.name}` : undefined}
                  style={{ color: suits ? theme.green : theme.faint }}
                >
                  {suits ? '✓' : '·'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
