import { useMemo, useState } from 'react'
import { RULES } from '../data/types'
import type { PlayerSeasonStats, Season as SeasonState } from '../engine/season'
import { formatOvers } from '../engine/innings'
import { formBand } from '../engine/form'
import { theme } from '../theme'
import { Eyebrow, GhostButton, ScreenHeader } from '../components/ui'

type Tab = 'batting' | 'bowling' | 'fielding'

const TABS: [Tab, string][] = [
  ['batting', 'BATTING'], ['bowling', 'BOWLING'], ['fielding', 'FIELDING'],
]

const battingAverage = (p: PlayerSeasonStats) => {
  const dismissals = p.innings - p.notOuts
  return dismissals > 0 ? p.runs / dismissals : p.runs > 0 ? Infinity : 0
}
const strikeRate = (p: PlayerSeasonStats) =>
  p.ballsFaced > 0 ? (p.runs / p.ballsFaced) * 100 : 0
const bowlingAverage = (p: PlayerSeasonStats) =>
  p.wickets > 0 ? p.runsConceded / p.wickets : Infinity
const economy = (p: PlayerSeasonStats) => {
  const overs = p.ballsBowled / RULES.ballsPerOver
  return overs > 0 ? p.runsConceded / overs : 0
}
const num = (v: number, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : '—')

export function SeasonStats({
  season, onBack,
}: {
  season: SeasonState
  onBack: () => void
}) {
  const [tab, setTab] = useState<Tab>('batting')
  const all = useMemo(() => Object.values(season.players), [season.players])

  const rows = useMemo(() => {
    switch (tab) {
      case 'bowling':
        return all.filter((p) => p.ballsBowled > 0)
          .sort((a, b) => b.wickets - a.wickets || bowlingAverage(a) - bowlingAverage(b))
      case 'fielding':
        return all.filter((p) => p.catches + p.stumpings + p.runOuts > 0)
          .sort((a, b) =>
            (b.catches + b.stumpings + b.runOuts) - (a.catches + a.stumpings + a.runOuts))
      default:
        return all.filter((p) => p.innings > 0)
          .sort((a, b) => b.runs - a.runs || battingAverage(b) - battingAverage(a))
    }
  }, [all, tab])

  const played = season.results.length
  const freshAir = all.filter((p) => p.freshAirGames > 0)
    .sort((a, b) => b.freshAirGames - a.freshAirGames)

  const cols = tab === 'batting'
    ? '1fr 1.5rem 1.5rem 2.6rem 2rem 2.6rem 2.8rem'
    : tab === 'bowling'
      ? '1fr 2.4rem 1.5rem 2.4rem 1.5rem 2.6rem 2.8rem'
      : '1fr 2rem 2rem 2rem 2.4rem'

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="SEASON STATS"
        subtitle={`Division 6 West · ${played} of ${season.schedule.length} played`}
        onBack={onBack}
      />

      <div className="flex gap-1.5 mb-3">
        {TABS.map(([t, label]) => (
          <GhostButton
            key={t}
            active={tab === t}
            onClick={() => setTab(t)}
            className="flex-1 !px-1 text-center"
          >
            {label}
          </GhostButton>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        <div
          className="disp grid text-[9.5px] tracking-widest px-2.5 py-2"
          style={{ gridTemplateColumns: cols, color: theme.faint, background: theme.surface2 }}
        >
          {tab === 'batting' && (
            <>
              <span>PLAYER</span>
              <span className="text-right">M</span>
              <span className="text-right">I</span>
              <span className="text-right">RUNS</span>
              <span className="text-right">HS</span>
              <span className="text-right">AVG</span>
              <span className="text-right">SR</span>
            </>
          )}
          {tab === 'bowling' && (
            <>
              <span>PLAYER</span>
              <span className="text-right">O</span>
              <span className="text-right">M</span>
              <span className="text-right">R</span>
              <span className="text-right">W</span>
              <span className="text-right">AVG</span>
              <span className="text-right">ECON</span>
            </>
          )}
          {tab === 'fielding' && (
            <>
              <span>PLAYER</span>
              <span className="text-right">CT</span>
              <span className="text-right">ST</span>
              <span className="text-right">RO</span>
              <span className="text-right">TOTAL</span>
            </>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-3 py-5 text-[12px] text-center" style={{ color: theme.faint }}>
            Nothing yet — play a fixture.
          </div>
        ) : rows.map((p, i) => {
          const band = formBand(p.form)
          return (
            <div
              key={p.playerId}
              className="grid px-2.5 py-2 items-baseline"
              style={{
                gridTemplateColumns: cols,
                background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < rows.length - 1 ? `1px solid ${theme.border}55` : 'none',
              }}
            >
              <span className="min-w-0 pr-2">
                <span className="text-[12.5px] font-semibold block truncate">{p.name}</span>
                <span
                  className="disp text-[8.5px] font-bold tracking-wider"
                  style={{ color: band.colour }}
                >
                  {band.label}
                </span>
              </span>

              {tab === 'batting' && (
                <>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.matches}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.innings}</span>
                  <span className="disp num text-right text-[14px] font-bold" style={{ color: theme.gold }}>{p.runs}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>
                    {p.best}{p.best > 0 && p.notOuts > 0 && p.best === p.runs && p.innings === 1 ? '*' : ''}
                  </span>
                  <span className="disp num text-right text-[12px]">{num(battingAverage(p), 1)}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{num(strikeRate(p), 0)}</span>
                </>
              )}

              {tab === 'bowling' && (
                <>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{formatOvers(p.ballsBowled)}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.maidens}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.runsConceded}</span>
                  <span className="disp num text-right text-[14px] font-bold" style={{ color: theme.gold }}>{p.wickets}</span>
                  <span className="disp num text-right text-[12px]">{num(bowlingAverage(p), 1)}</span>
                  <span
                    className="disp num text-right text-[12px]"
                    style={{ color: economy(p) < 4 ? theme.green : economy(p) > 6.5 ? theme.red : theme.muted }}
                  >
                    {num(economy(p))}
                  </span>
                </>
              )}

              {tab === 'fielding' && (
                <>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.catches}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.stumpings}</span>
                  <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{p.runOuts}</span>
                  <span className="disp num text-right text-[14px] font-bold" style={{ color: theme.gold }}>
                    {p.catches + p.stumpings + p.runOuts}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {tab === 'bowling' && rows.length > 0 && (
        <div className="text-[11px] mt-2 px-1" style={{ color: theme.faint }}>
          Best figures:{' '}
          {[...rows]
            .filter((p) => p.bestWickets >= 0)
            .sort((a, b) => b.bestWickets - a.bestWickets || a.bestRuns - b.bestRuns)
            .slice(0, 3)
            .map((p) => `${p.name.split(' ')[0]} ${p.bestWickets}-${p.bestRuns}`)
            .join(' · ')}
        </div>
      )}

      {freshAir.length > 0 && (
        <div className="mt-5">
          <Eyebrow colour={theme.red}>FRESH AIR GAMES</Eyebrow>
          <div className="rounded-xl px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            {freshAir.map((p) => (
              <div key={p.playerId} className="flex justify-between items-baseline py-1">
                <span className="text-[12.5px] truncate pr-2">{p.name}</span>
                <span className="disp num text-[13px] font-bold shrink-0" style={{ color: theme.red }}>
                  {p.freshAirGames}
                </span>
              </div>
            ))}
            <div className="text-[10.5px] leading-snug mt-1.5" style={{ color: theme.faint }}>
              Picked, then neither batted nor bowled. Do it to someone twice and he is very
              likely to walk.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
