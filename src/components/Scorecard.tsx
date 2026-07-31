import { RULES } from '../data/types'
import type { InningsResult } from '../data/types'
import { formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { Eyebrow } from './ui'

export function Scorecard({ innings }: { innings: InningsResult }) {
  const batted = innings.batting.filter((b) => b.batted)
  const dnb = innings.batting.filter((b) => !b.batted)

  return (
    <div>
      <Eyebrow>BATTING</Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        <div
          className="disp grid text-[10px] tracking-widest px-3 py-2"
          style={{ gridTemplateColumns: '1fr 3rem 3rem 2rem 2rem', color: theme.faint, background: theme.surface2 }}
        >
          <span>BATTER</span>
          <span className="text-right">R</span>
          <span className="text-right">B</span>
          <span className="text-right">4s</span>
          <span className="text-right">6s</span>
        </div>

        {batted.map((b, i) => (
          <div
            key={b.playerId}
            className="grid px-3 py-2 items-baseline"
            style={{
              gridTemplateColumns: '1fr 3rem 3rem 2rem 2rem',
              background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
            }}
          >
            <span className="min-w-0 pr-2">
              <span className="text-[13px] font-semibold block truncate">
                {b.name}
                {b.outOfPosition && (
                  <span className="disp text-[9px] ml-1.5 tracking-wider" style={{ color: theme.red }}>
                    OOP
                  </span>
                )}
              </span>
              <span className="text-[10.5px] block truncate" style={{ color: theme.muted }}>
                {b.out ? b.out.text : 'not out'}
              </span>
            </span>
            <span
              className="disp num text-right text-[15px] font-bold"
              style={{ color: b.runs >= 50 ? theme.gold : theme.cream }}
            >
              {b.runs}{!b.out && '*'}
            </span>
            <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>{b.balls}</span>
            <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>{b.fours}</span>
            <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>{b.sixes}</span>
          </div>
        ))}

        <div
          className="flex justify-between px-3 py-2 text-[12px]"
          style={{ background: 'rgba(255,255,255,.02)', color: theme.muted }}
        >
          <span>
            Extras
            <span className="ml-2 text-[11px]" style={{ color: theme.faint }}>
              (w {innings.extras.wides}, nb {innings.extras.noBalls}, b {innings.extras.byes}, lb {innings.extras.legByes})
            </span>
          </span>
          <span className="disp num font-bold" style={{ color: theme.cream }}>{innings.extras.total}</span>
        </div>

        <div
          className="flex justify-between items-baseline px-3 py-2.5"
          style={{ background: theme.surface2, borderTop: `1px solid ${theme.border}` }}
        >
          <span className="disp tracking-widest text-[12px] font-bold">
            TOTAL
            <span className="ml-2 text-[11px] font-normal" style={{ color: theme.muted }}>
              {formatOvers(innings.balls)} ov · RR {innings.runRate.toFixed(2)}
            </span>
          </span>
          <span className="disp num text-xl font-extrabold" style={{ color: theme.gold }}>
            {innings.runs}/{innings.wickets}
          </span>
        </div>
      </div>

      {dnb.length > 0 && (
        <div className="text-[11px] mt-2 px-1" style={{ color: theme.faint }}>
          <span style={{ color: theme.muted }}>Did not bat: </span>
          {dnb.map((b) => b.name).join(', ')}
        </div>
      )}

      <div className="mt-4">
        <Eyebrow>BOWLING</Eyebrow>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
          <div
            className="disp grid text-[10px] tracking-widest px-3 py-2"
            style={{ gridTemplateColumns: '1fr 3rem 2rem 3rem 2rem 3.2rem', color: theme.faint, background: theme.surface2 }}
          >
            <span>BOWLER</span>
            <span className="text-right">O</span>
            <span className="text-right">M</span>
            <span className="text-right">R</span>
            <span className="text-right">W</span>
            <span className="text-right">ECON</span>
          </div>
          {innings.bowling.map((b, i) => {
            const overs = b.balls / RULES.ballsPerOver
            const econ = overs > 0 ? b.runs / overs : 0
            return (
              <div
                key={b.playerId}
                className="grid px-3 py-2 items-baseline"
                style={{
                  gridTemplateColumns: '1fr 3rem 2rem 3rem 2rem 3.2rem',
                  background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                }}
              >
                <span className="text-[13px] font-semibold truncate pr-2">{b.name}</span>
                <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>
                  {formatOvers(b.balls)}
                </span>
                <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>{b.maidens}</span>
                <span className="disp num text-right text-[13px]" style={{ color: theme.muted }}>{b.runs}</span>
                <span
                  className="disp num text-right text-[15px] font-bold"
                  style={{ color: b.wickets >= 3 ? theme.gold : theme.cream }}
                >
                  {b.wickets}
                </span>
                <span
                  className="disp num text-right text-[13px]"
                  style={{ color: econ < 4 ? theme.green : econ > 6.5 ? theme.red : theme.muted }}
                >
                  {econ.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {innings.fow.length > 0 && (
        <div className="mt-4">
          <Eyebrow>FALL OF WICKETS</Eyebrow>
          <div className="text-[11.5px] leading-relaxed" style={{ color: theme.muted }}>
            {innings.fow.map((f, i) => (
              <span key={i}>
                <span style={{ color: theme.cream }}>{f.score}-{f.wkt}</span>
                {' '}({f.batter}, {f.at}){i < innings.fow.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
