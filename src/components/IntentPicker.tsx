import { INTENTS, intentPush } from '../data/types'
import type { Intent } from '../data/types'
import { intentEffect } from '../engine/innings'
import { theme } from '../theme'
import { Eyebrow } from './ui'

/** Just enough of a batter to price up an instruction for him. */
export interface IntentBatter {
  name: string
  skill: number
  pwr: number
}

const pc = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

/**
 * The four intents, with the recommendation pre-selected and — the bit that
 * makes this a decision rather than a dial — what the highlighted one is
 * actually worth to the men out there.
 *
 * The same order is a good trade for a striker and a bad one for a tailender,
 * so showing the numbers per batter is the whole explanation.
 */
export function IntentPicker({
  value, recommended, batters, onChange, heading = 'HOW DO THEY PLAY IT?',
}: {
  value: Intent
  recommended: Intent
  /** Who it applies to right now. Empty is fine — the trade panel just hides. */
  batters: IntentBatter[]
  onChange: (i: Intent) => void
  heading?: string
}) {
  const chosen = INTENTS.find((i) => i.id === value)!
  const push = intentPush(value)

  return (
    <>
      <Eyebrow colour={theme.gold}>{heading}</Eyebrow>
      <div className="flex gap-1.5 mb-2">
        {INTENTS.map((i) => (
          <button
            key={i.id}
            onClick={() => onChange(i.id)}
            className="disp flex-1 rounded-lg font-bold tracking-[0.06em] px-1 text-[10px]
                       active:scale-[0.97] transition-all"
            style={{
              minHeight: 46,
              background: value === i.id ? theme.gold : 'rgba(24,43,33,0.6)',
              color: value === i.id ? '#1A1405' : theme.muted,
              border: `1px solid ${
                value === i.id ? theme.gold : i.id === recommended ? `${theme.gold}66` : theme.border
              }`,
            }}
          >
            {i.label}
            {i.id === recommended && (
              <div
                className="text-[7.5px] tracking-widest font-normal mt-0.5"
                style={{ color: value === i.id ? '#1A1405' : theme.goldDim }}
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

      {batters.length > 0 && (
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
          {batters.map((b, i) => {
            const e = intentEffect(push, b.skill, b.pwr)
            const d = push - 1
            // Does this order suit *him*? Attacking is a good deal when his
            // power buys more than his technique pays for; defending is only
            // worth ordering if he can actually bat time.
            const suits = d > 0
              ? e.boundary - 1 >= (e.wicket - 1) * 1.4
              : d < 0 && 1 - e.wicket >= 0.08
            return (
              <div
                key={b.name}
                className="px-2.5 py-1.5 flex items-baseline gap-2 text-[11px]"
                style={{ borderTop: i > 0 ? `1px solid ${theme.border}55` : 'none' }}
              >
                <span className="flex-1 truncate font-semibold">{b.name}</span>
                {/* Coloured by whether it's good news, not by which column. */}
                <span
                  className="disp num shrink-0 w-16 text-right"
                  style={{ color: e.boundary >= 1 ? theme.green : theme.pitch }}
                >
                  {pc(e.boundary)} runs
                </span>
                <span
                  className="disp num shrink-0 w-16 text-right"
                  style={{ color: e.wicket > 1 ? theme.red : theme.green }}
                >
                  {pc(e.wicket)} risk
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
