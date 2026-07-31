import { RULES } from '../data/types'
import type { Club, InningsResult } from '../data/types'
import { formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { Card, Eyebrow, PrimaryButton } from '../components/ui'

/** Reads the fielding innings back to you before you go out to bat. */
function verdict(innings: InningsResult): string {
  const rr = innings.runRate
  if (innings.allOut && innings.runs < 160) return 'Rolled them over. That is a very gettable total.'
  if (innings.allOut) return 'Bowled them out — the attack did its job.'
  if (rr >= 6) return 'They got away from you at the death. That is a big chase.'
  if (rr >= 5.2) return 'Par plus. You will need the top order to fire.'
  if (rr <= 4) return 'Strangled. Excellent work in the field, and a modest chase.'
  return 'A fair total. This is a proper game of cricket.'
}

export function InningsBreak({
  innings, opponent, onNext,
}: {
  innings: InningsResult
  opponent: Club
  onNext: () => void
}) {
  const target = innings.runs + 1
  const best = [...innings.bowling].sort(
    (a, b) => b.wickets - a.wickets || a.runs - b.runs,
  ).slice(0, 3)

  return (
    <div className="pt-10 pop">
      <div className="disp tracking-[0.3em] text-[10px] text-center mb-3" style={{ color: theme.muted }}>
        INNINGS BREAK
      </div>

      <div
        className="rounded-2xl px-6 py-6 text-center"
        style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
      >
        <div className="disp text-lg font-bold tracking-wide truncate">{opponent.name}</div>
        <div className="disp num font-extrabold leading-none mt-2" style={{ fontSize: 66 }}>
          {innings.runs}
          <span style={{ color: theme.faint }}>/</span>
          <span style={{ color: innings.allOut ? theme.red : theme.cream }}>{innings.wickets}</span>
        </div>
        <div className="disp text-base mt-1" style={{ color: theme.muted }}>
          {formatOvers(innings.balls)} overs · RR {innings.runRate.toFixed(2)}
        </div>
      </div>

      <div
        className="rounded-2xl px-6 py-5 text-center mt-3"
        style={{ background: 'rgba(233,185,73,.10)', border: `1px solid ${theme.gold}66` }}
      >
        <div className="disp tracking-[0.25em] text-[10px]" style={{ color: theme.gold }}>
          BAGSHOT NEED
        </div>
        <div className="disp num font-extrabold leading-none mt-1" style={{ fontSize: 56, color: theme.gold }}>
          {target}
        </div>
        <div className="disp text-[13px] mt-1" style={{ color: theme.cream }}>
          from {RULES.overs} overs · {((target / RULES.overs)).toFixed(2)} an over
        </div>
      </div>

      <Card className="mt-3 px-4 py-3">
        <Eyebrow>PICK OF THE ATTACK</Eyebrow>
        {best.map((b) => (
          <div key={b.playerId} className="flex justify-between items-baseline py-1">
            <span className="text-[13px] font-semibold truncate pr-2">{b.name}</span>
            <span className="disp num text-[14px] font-bold shrink-0" style={{ color: b.wickets >= 3 ? theme.gold : theme.cream }}>
              {b.wickets}–{b.runs}
              <span className="text-[11px] font-normal ml-1" style={{ color: theme.faint }}>
                ({formatOvers(b.balls)})
              </span>
            </span>
          </div>
        ))}
      </Card>

      <div className="text-[12.5px] leading-relaxed text-center mt-4 px-3" style={{ color: theme.muted }}>
        {verdict(innings)}
      </div>

      <div className="mt-5">
        <PrimaryButton onClick={onNext}>SET YOUR ORDER</PrimaryButton>
      </div>
    </div>
  )
}
