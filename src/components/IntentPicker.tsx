import { INTENTS, intentPush } from '../data/types'
import type { Intent } from '../data/types'
import { intentEffect } from '../engine/innings'
import { theme } from '../theme'
import { Eyebrow } from './ui'

/** One man at the crease, and what he's currently been told. */
export interface IntentBatter {
  playerId: string
  name: string
  skill: number
  pwr: number
  value: Intent
  recommended: Intent
}

const pc = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

/**
 * The four intents, **one row per batter**, with the recommendation
 * pre-selected and — the bit that makes this a decision rather than a dial —
 * what the highlighted one is actually worth to that man.
 *
 * Per batter because that's how the engine has always priced it: power turns
 * shots into runs, technique keeps you in while you play them, so the same
 * order is a good trade for a striker and close to suicide for a tailender.
 * For a while this screen showed you both sets of numbers and then applied one
 * order to both of them, which is the wrong way round.
 */
export function IntentPicker({
  batters, onChange, heading = 'HOW DO THEY PLAY IT?',
}: {
  batters: IntentBatter[]
  onChange: (playerId: string, intent: Intent) => void
  heading?: string
}) {
  if (batters.length === 0) return null

  return (
    <>
      <Eyebrow colour={theme.gold}>{heading}</Eyebrow>
      <div className="mb-3">
        {batters.map((b, n) => {
          const e = intentEffect(intentPush(b.value), b.skill, b.pwr)
          const d = intentPush(b.value) - 1
          const chosen = INTENTS.find((i) => i.id === b.value)!
          // Does this order suit *him*? Attacking is a good deal when his power
          // buys more than his technique pays for; defending is only worth
          // ordering if he can actually bat time.
          const suits = d > 0
            ? e.boundary - 1 >= (e.wicket - 1) * 1.4
            : d < 0 && 1 - e.wicket >= 0.08

          return (
            <div key={b.playerId} className={n > 0 ? 'mt-2.5' : ''}>
              <div className="flex items-baseline gap-2 px-1 mb-1">
                <span className="text-[13px] font-semibold truncate flex-1">{b.name}</span>
                {/* Coloured by whether it's good news, not by which column. */}
                <span
                  className="disp num text-[10.5px] shrink-0"
                  style={{ color: e.boundary >= 1 ? theme.green : theme.pitch }}
                >
                  {pc(e.boundary)} runs
                </span>
                <span
                  className="disp num text-[10.5px] shrink-0"
                  style={{ color: e.wicket > 1 ? theme.red : theme.green }}
                >
                  {pc(e.wicket)} risk
                </span>
                <span
                  className="disp text-[12px] w-3 text-center shrink-0"
                  title={suits ? `Suits ${b.name}` : undefined}
                  style={{ color: suits ? theme.green : theme.faint }}
                >
                  {suits ? '✓' : '·'}
                </span>
              </div>

              <div className="flex gap-1.5">
                {INTENTS.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => onChange(b.playerId, i.id)}
                    aria-label={`${b.name}: ${i.label}`}
                    className="disp flex-1 rounded-lg font-bold tracking-[0.06em] px-1 text-[10px]
                               active:scale-[0.97] transition-all"
                    style={{
                      minHeight: 44,
                      background: b.value === i.id ? theme.gold : 'rgba(24,43,33,0.6)',
                      color: b.value === i.id ? '#1A1405' : theme.muted,
                      border: `1px solid ${
                        b.value === i.id
                          ? theme.gold
                          : i.id === b.recommended ? `${theme.gold}66` : theme.border
                      }`,
                    }}
                  >
                    {i.label}
                    {i.id === b.recommended && (
                      <div
                        className="text-[7.5px] tracking-widest font-normal mt-0.5"
                        style={{ color: b.value === i.id ? '#1A1405' : theme.goldDim }}
                      >
                        SUGGESTED
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* One blurb is enough when there's only one man to brief. */}
              {batters.length === 1 && (
                <div className="text-[11px] leading-snug mt-1.5 px-1" style={{ color: theme.muted }}>
                  {chosen.blurb}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
