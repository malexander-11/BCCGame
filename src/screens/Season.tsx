import { useMemo } from 'react'
import { BAGSHOT_REAL_POINTS, BAGSHOT_REAL_POSITION, DIV6_WEST } from '../data/league'
import type { Season as SeasonState } from '../engine/season'
import { nextFixture, seasonComplete, standings, totalRounds } from '../engine/season'
import { formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { Card, Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader } from '../components/ui'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function Season({
  season, instant, onToggleInstant, onPlay, onSimRest, onAbandon, onBack,
}: {
  season: SeasonState
  instant: boolean
  onToggleInstant: () => void
  onPlay: () => void
  onSimRest: () => void
  onAbandon: () => void
  onBack: () => void
}) {
  const table = useMemo(() => standings(season), [season])
  const fixture = nextFixture(season)
  const done = seasonComplete(season)
  const rounds = totalRounds(season)
  const us = table.find((r) => r.isBagshot)!
  const opponent = fixture ? DIV6_WEST.find((c) => c.id === fixture.opponentId) : null

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="DIVISION 6 WEST"
        subtitle={done ? 'Season complete' : `Round ${season.results.length + 1} of ${rounds}`}
        onBack={onBack}
        right={
          <div className="text-right">
            <div className="disp num text-xl font-bold leading-none" style={{ color: theme.gold }}>
              {ordinal(us.position)}
            </div>
            <div className="disp text-[10px] tracking-wider" style={{ color: theme.faint }}>
              {us.points} PTS
            </div>
          </div>
        }
      />

      {!done && fixture && opponent && (
        <Card className="px-4 py-3 mb-3" style={{ borderColor: `${theme.gold}55` }}>
          <Eyebrow colour={theme.gold}>NEXT FIXTURE</Eyebrow>
          <div className="flex items-baseline justify-between">
            <div className="min-w-0">
              <div className="disp text-[19px] font-bold truncate">{opponent.name}</div>
              <div className="text-[11px] mt-0.5" style={{ color: theme.muted }}>
                {fixture.home ? 'Home' : 'Away'} · 45 overs · you bowl first
              </div>
            </div>
            <div className="disp num text-[13px] shrink-0 ml-3" style={{ color: theme.faint }}>
              R{fixture.round}
            </div>
          </div>
          <div className="mt-3">
            <PrimaryButton onClick={onPlay}>PLAY THE MATCH</PrimaryButton>
          </div>
        </Card>
      )}

      <div className="flex gap-2 mb-3">
        <GhostButton onClick={onToggleInstant} active={instant} className="flex-1 text-center">
          {instant ? 'INSTANT RESULTS ON' : 'INSTANT RESULTS OFF'}
        </GhostButton>
        {!done && (
          <GhostButton onClick={onSimRest} className="!px-3">SIM REST</GhostButton>
        )}
      </div>

      <Eyebrow>LEAGUE TABLE</Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        <div
          className="disp grid text-[10px] tracking-widest px-2.5 py-2"
          style={{
            gridTemplateColumns: '1.2rem 1fr 1.4rem 1.4rem 1.4rem 2.6rem 2.6rem',
            color: theme.faint, background: theme.surface2,
          }}
        >
          <span>#</span><span>CLUB</span>
          <span className="text-right">P</span>
          <span className="text-right">W</span>
          <span className="text-right">L</span>
          <span className="text-right">NRR</span>
          <span className="text-right">PTS</span>
        </div>
        {table.map((r, i) => (
          <div
            key={r.clubId}
            className="grid px-2.5 py-2 items-baseline"
            style={{
              gridTemplateColumns: '1.2rem 1fr 1.4rem 1.4rem 1.4rem 2.6rem 2.6rem',
              background: r.isBagshot
                ? 'rgba(233,185,73,.14)'
                : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
              borderBottom: i < table.length - 1 ? `1px solid ${theme.border}55` : 'none',
            }}
          >
            <span className="disp num text-[12px]" style={{ color: theme.faint }}>{r.position}</span>
            <span
              className="text-[12.5px] font-semibold truncate pr-2"
              style={{ color: r.isBagshot ? theme.gold : theme.cream }}
            >
              {r.name}
            </span>
            <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{r.played}</span>
            <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{r.won}</span>
            <span className="disp num text-right text-[12px]" style={{ color: theme.muted }}>{r.lost}</span>
            <span
              className="disp num text-right text-[11px]"
              style={{ color: r.nrr >= 0 ? theme.green : theme.red }}
            >
              {r.nrr >= 0 ? '+' : ''}{r.nrr.toFixed(2)}
            </span>
            <span
              className="disp num text-right text-[13px] font-bold"
              style={{ color: r.isBagshot ? theme.gold : theme.cream }}
            >
              {r.points}
            </span>
          </div>
        ))}
      </div>

      <div className="text-[11px] leading-relaxed mt-2.5 px-1" style={{ color: theme.muted }}>
        Win 20, tie 10, plus a point per fifty runs (max 4) and per two wickets (max 5).
        Bagshot really finished <span style={{ color: theme.gold }}>{ordinal(BAGSHOT_REAL_POSITION)}</span>{' '}
        on {BAGSHOT_REAL_POINTS} last year — that's the one to beat.
      </div>

      {season.results.length > 0 && (
        <div className="mt-5">
          <Eyebrow>RESULTS</Eyebrow>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
            {[...season.results].reverse().map((r, i) => {
              const club = DIV6_WEST.find((c) => c.id === r.opponentId)
              const colour = r.outcome === 'win' ? theme.green
                : r.outcome === 'tie' ? theme.pitch : theme.red
              return (
                <div
                  key={r.round}
                  className="px-3 py-2"
                  style={{
                    background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                    borderBottom: i < season.results.length - 1 ? `1px solid ${theme.border}55` : 'none',
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold truncate pr-2">
                      <span className="disp text-[10px] mr-1.5" style={{ color: theme.faint }}>
                        R{r.round}
                      </span>
                      {club?.name ?? r.opponentId}
                      <span className="disp text-[10px] ml-1.5" style={{ color: theme.faint }}>
                        {r.home ? '(H)' : '(A)'}
                      </span>
                    </span>
                    <span className="disp text-[11px] font-bold shrink-0" style={{ color: colour }}>
                      {r.outcome.toUpperCase()} · {r.points}pt
                    </span>
                  </div>
                  <div className="disp num text-[11px] mt-0.5" style={{ color: theme.muted }}>
                    {club?.name.split(' ')[0]} {r.opponent.runs}/{r.opponent.wickets} ({formatOvers(r.opponent.balls)})
                    {'  ·  '}
                    Bagshot {r.bagshot.runs}/{r.bagshot.wickets} ({formatOvers(r.bagshot.balls)})
                  </div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: theme.faint }}>
                    {r.motm}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {done && (
        <div className="mt-4">
          <Notice tone={us.position <= BAGSHOT_REAL_POSITION ? 'ok' : 'warn'}>
            Season over — Bagshot finished {ordinal(us.position)} on {us.points} points.
            {us.position < BAGSHOT_REAL_POSITION
              ? ` Better than the real ${ordinal(BAGSHOT_REAL_POSITION)}.`
              : us.position === BAGSHOT_REAL_POSITION
                ? ' Exactly where they really came.'
                : ` The real side managed ${ordinal(BAGSHOT_REAL_POSITION)}.`}
          </Notice>
        </div>
      )}

      <div className="mt-4">
        <GhostButton
          onClick={onAbandon}
          className="w-full text-center !py-2.5"
          style={{ color: theme.red, borderColor: `${theme.red}55` }}
        >
          {done ? 'START A NEW SEASON' : 'ABANDON SEASON'}
        </GhostButton>
      </div>
    </div>
  )
}
