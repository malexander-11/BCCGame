import { useState } from 'react'
import { RULES, settledLabel } from '../data/types'
import type { InningsResult, Intent, Player } from '../data/types'
import { autoIntent } from '../engine/ai'
import { dlsPar } from '../engine/dls'
import { formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { IntentPicker } from '../components/IntentPicker'
import type { IntentBatter } from '../components/IntentPicker'
import { Eyebrow, PrimaryButton } from '../components/ui'

/**
 * A break in the chase, every nine overs.
 *
 * The one screen where you get to react to what's actually happening rather
 * than to a plan you made before a ball was bowled. It opens on what a sensible
 * captain would call for, so agreeing is a single tap and you only spend
 * attention on the ones where you don't.
 */
export function DrinksBreak({
  innings, order, afterOver, standing, onPlayOn,
}: {
  innings: InningsResult
  /** The batting order, for looking up the ratings of whoever is in. */
  order: Player[]
  /** The over just completed — 9, 18, 27 or 36. */
  afterOver: number
  /** What each man is already under orders to do, if anything. */
  standing: (playerId: string) => Intent | null
  onPlayOn: (orders: Record<string, Intent>) => void
}) {
  const summary = innings.overSummaries.find((o) => o.over === afterOver)
  const runs = summary?.total ?? 0
  const wkts = summary?.totalWkts ?? 0
  const balls = afterOver * RULES.ballsPerOver
  const target = innings.target ?? 0
  const need = Math.max(0, target - runs)
  const ballsLeft = Math.max(0, RULES.balls - balls)
  const rrr = ballsLeft > 0 ? (need / ballsLeft) * 6 : 0
  const par = dlsPar(target - 1, runs, wkts, balls)

  const crease = summary?.atCrease ?? []
  // One suggestion per man, because how set he is changes what to tell him.
  const suggest = (settled: number) => autoIntent(need, ballsLeft, wkts, settled)

  const [chosen, setChosen] = useState<Record<string, Intent>>(() =>
    Object.fromEntries(crease.map((b) => [
      b.playerId, standing(b.playerId) ?? suggest(b.settled),
    ])))

  const batters: IntentBatter[] = crease
    .map((b) => {
      const p = order.find((x) => x.id === b.playerId)
      if (!p) return null
      return {
        playerId: b.playerId,
        name: b.name,
        skill: p.bat.skill,
        pwr: p.bat.pwr,
        value: chosen[b.playerId] ?? suggest(b.settled),
        recommended: suggest(b.settled),
      }
    })
    .filter((b): b is IntentBatter => b !== null)

  return (
    <div className="pt-8 pb-4 pop">
      <div className="disp tracking-[0.3em] text-[10px] text-center mb-1" style={{ color: theme.muted }}>
        DRINKS · AFTER {afterOver} OVERS
      </div>
      <div className="disp text-center text-lg font-bold tracking-wide mb-4">
        {need === 0 ? 'Target reached' : `Bagshot need ${need}`}
      </div>

      <div
        className="rounded-2xl px-6 py-5 text-center mb-2"
        style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
      >
        <div className="disp num font-extrabold leading-none" style={{ fontSize: 58 }}>
          {runs}
          <span style={{ color: theme.faint }}>/</span>
          <span style={{ color: wkts >= 8 ? theme.red : theme.cream }}>{wkts}</span>
        </div>
        <div className="disp text-[15px] mt-1 tracking-wide" style={{ color: theme.muted }}>
          {formatOvers(balls)} overs · {RULES.overs - afterOver} to go
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>REQUIRED RATE</div>
          <div
            className="disp num text-xl font-bold"
            style={{ color: rrr > 9 ? theme.red : rrr > 6.5 ? theme.pitch : theme.green }}
          >
            {need === 0 ? '—' : rrr.toFixed(2)}
          </div>
          <div className="disp text-[10px]" style={{ color: theme.faint }}>
            {need} off {ballsLeft}
          </div>
        </div>
        <div
          className="rounded-xl px-3 py-2.5 text-center"
          style={{
            background: theme.surface,
            border: `1px solid ${par.diff >= 0 ? `${theme.green}66` : `${theme.red}66`}`,
          }}
        >
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>ON DLS PAR</div>
          <div
            className="disp num text-xl font-bold"
            style={{ color: par.diff >= 0 ? theme.green : theme.red }}
          >
            {par.diff >= 0 ? '+' : ''}{par.diff}
          </div>
          <div className="disp text-[10px]" style={{ color: theme.faint }}>par {par.par}</div>
        </div>
      </div>

      {crease.length > 0 && (
        <div className="mb-3">
          <Eyebrow>AT THE CREASE</Eyebrow>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            {crease.map((b, i) => (
              <div
                key={b.playerId}
                className="px-3 py-1.5 flex items-center gap-2"
                style={{ borderTop: i > 0 ? `1px solid ${theme.border}55` : 'none' }}
              >
                <span
                  className="text-[13px] font-semibold truncate flex-1"
                  style={{ color: b.onStrike ? theme.gold : theme.cream }}
                >
                  {b.name}{b.onStrike && <span className="disp ml-1">*</span>}
                </span>
                <span className="disp num text-[15px] font-bold shrink-0">
                  {b.runs}
                  <span className="text-[11px] font-normal ml-1" style={{ color: theme.faint }}>
                    ({b.balls})
                  </span>
                </span>
                <span
                  className="disp text-[8px] tracking-widest w-[4.6rem] text-right shrink-0"
                  style={{ color: b.settled >= 0.85 ? theme.gold : b.settled < 0.22 ? theme.pitch : theme.muted }}
                >
                  {settledLabel(b.settled)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <IntentPicker
        batters={batters}
        onChange={(playerId, intent) => setChosen((prev) => ({ ...prev, [playerId]: intent }))}
        heading={`NEXT ${Math.min(9, RULES.overs - afterOver)} OVERS`}
      />

      <PrimaryButton onClick={() => onPlayOn(chosen)}>PLAY ON</PrimaryButton>
    </div>
  )
}
