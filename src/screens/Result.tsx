import { useState } from 'react'
import type { MatchResult } from '../data/types'
import { formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { Scorecard } from '../components/Scorecard'
import { Card, Eyebrow, GhostButton, PrimaryButton } from '../components/ui'
import { TEAM_NAME } from '../engine/match'

const OUTCOME_STYLE = {
  win: { label: 'WON', colour: theme.green },
  loss: { label: 'LOST', colour: theme.red },
  tie: { label: 'TIED', colour: theme.pitch },
} as const

export function Result({
  result, onAgain, onHome,
}: {
  result: MatchResult
  onAgain: () => void
  onHome: () => void
}) {
  const [tab, setTab] = useState<'first' | 'second'>('second')
  const style = OUTCOME_STYLE[result.outcome]
  const innings = tab === 'first' ? result.first : result.second

  return (
    <div className="pt-8 pb-4 pop">
      <div
        className="rounded-2xl px-5 py-6 text-center"
        style={{ background: theme.surface, border: `1px solid ${style.colour}66` }}
      >
        <div className="disp tracking-[0.3em] text-[11px]" style={{ color: theme.muted }}>
          v {result.opponentName.toUpperCase()}
        </div>
        <div
          className="brandface leading-none mt-2"
          style={{ fontSize: 52, color: style.colour }}
        >
          {style.label}
        </div>
        <div className="disp text-[15px] mt-1.5 tracking-wide" style={{ color: theme.cream }}>
          {result.margin}
        </div>

        <div className="flex items-center justify-center gap-4 mt-5">
          <div className="text-right flex-1">
            <div className="disp text-[11px] truncate" style={{ color: theme.muted }}>
              {result.opponentName}
            </div>
            <div className="disp num text-2xl font-bold">
              {result.first.runs}/{result.first.wickets}
            </div>
            <div className="disp text-[10px]" style={{ color: theme.faint }}>
              {formatOvers(result.first.balls)} ov
            </div>
          </div>
          <div className="disp text-[13px]" style={{ color: theme.faint }}>v</div>
          <div className="text-left flex-1">
            <div className="disp text-[11px] truncate" style={{ color: theme.muted }}>{TEAM_NAME}</div>
            <div className="disp num text-2xl font-bold" style={{ color: theme.gold }}>
              {result.second.runs}/{result.second.wickets}
            </div>
            <div className="disp text-[10px]" style={{ color: theme.faint }}>
              {formatOvers(result.second.balls)} ov
            </div>
          </div>
        </div>
      </div>

      <Card className="mt-3 px-4 py-3">
        <Eyebrow>MAN OF THE MATCH</Eyebrow>
        <div className="flex items-baseline justify-between">
          <div className="min-w-0">
            <div className="disp text-[17px] font-bold truncate">{result.motm.name}</div>
            <div className="text-[11px]" style={{ color: theme.faint }}>{result.motm.team}</div>
          </div>
          <div className="disp num text-xl font-bold shrink-0 ml-3" style={{ color: theme.gold }}>
            {result.motm.line}
          </div>
        </div>
      </Card>

      <div className="text-[13px] leading-relaxed text-center mt-4 px-3" style={{ color: theme.muted }}>
        {result.analysis}
      </div>

      <div className="flex gap-2 mt-5 mb-3">
        <GhostButton
          active={tab === 'first'}
          onClick={() => setTab('first')}
          className="flex-1 text-center !py-2.5"
        >
          {result.opponentName.toUpperCase()}
        </GhostButton>
        <GhostButton
          active={tab === 'second'}
          onClick={() => setTab('second')}
          className="flex-1 text-center !py-2.5"
        >
          BAGSHOT
        </GhostButton>
      </div>

      <div key={tab} className="pop">
        <Scorecard innings={innings} />
      </div>

      <div className="mt-6 grid gap-2">
        <PrimaryButton onClick={onAgain}>NEXT FIXTURE</PrimaryButton>
        <PrimaryButton onClick={onHome} tone="quiet">CLUBHOUSE</PrimaryButton>
      </div>

      <div className="disp num text-[10px] text-center mt-4 tracking-widest" style={{ color: theme.faint }}>
        MATCH SEED {result.seed}
      </div>
    </div>
  )
}
