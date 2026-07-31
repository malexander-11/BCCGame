import { useState } from 'react'
import type { Club, Tier } from '../data/types'
import { OPPOSITION_BY_TIER, TIER_BLURB, TIER_LABEL, TIER_ORDER } from '../data/opposition'
import { teamStrength } from '../engine/ai'
import { bagshotRow } from '../engine/season'
import type { Season as SeasonState } from '../engine/season'
import { theme } from '../theme'
import type { Record } from '../storage'
import { Brand, Card, Eyebrow, GhostButton, ordinal, Panel, PrimaryButton } from '../components/ui'

const HOW_IT_WORKS: [string, string][] = [
  ['Select', 'Pick eleven from the squad and set their batting order. You need a keeper and at least five who can bowl.'],
  ['Plan', 'Share 45 overs between five and seven bowlers and choose their spells. Nobody bowls more than nine.'],
  ['Field', 'They bat first. Your DEF bowlers squeeze, your ATT bowlers strike — the total they post is the target.'],
  ['Chase', 'Review your order once you know the target, then bat. SKILL keeps you in, PWR gets you there.'],
]

const STATS: [string, string, string][] = [
  ['SKILL', 'Survival', 'How hard the batter is to get out'],
  ['PWR', 'Scoring', 'Boundaries and strike rate'],
  ['DEF', 'Containment', 'Economy, dots and fewer extras'],
  ['ATT', 'Penetration', 'Taking wickets'],
]

export function Home({
  record, season, instant, onToggleInstant,
  onStart, onSeason, onSquad, squadSize, squadAvailable, squadValue,
}: {
  record: Record
  season: SeasonState | null
  instant: boolean
  onToggleInstant: () => void
  onStart: (opponent: Club) => void
  onSeason: () => void
  onSquad: () => void
  squadSize: number
  /** How many can actually play this week. Only meaningful in a season. */
  squadAvailable?: number
  squadValue: number
}) {
  const [tier, setTier] = useState<Tier>('derby')
  const [club, setClub] = useState<Club | null>(null)

  const clubs = OPPOSITION_BY_TIER[tier]
  const seasonRow = season ? bagshotRow(season) : null
  const roundsDone = season?.results.length ?? 0

  return (
    <div className="pt-8 pb-4 pop">
      <Brand />

      <button onClick={onSeason} className="block w-full mt-5 text-left">
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'rgba(233,185,73,.10)', border: `1px solid ${theme.gold}66` }}
        >
          <div className="disp tracking-[0.2em] text-[10px] font-bold" style={{ color: theme.gold }}>
            {season ? 'SEASON IN PROGRESS' : 'START A SEASON'}
          </div>
          <div className="disp text-[17px] font-bold mt-0.5">Division 6 West</div>
          <div className="text-[11.5px] mt-1 leading-snug" style={{ color: theme.cream }}>
            {season && seasonRow
              ? roundsDone === 0
                // Before a ball is bowled everyone is level, so a position here
                // would be alphabetical noise dressed up as a standing.
                ? `Round 1 of 9 · not a ball bowled yet`
                : `Round ${Math.min(roundsDone + 1, 9)} of 9 · ${ordinal(seasonRow.position)} on ${seasonRow.points} points`
              : 'Nine fixtures against the clubs Bagshot actually play. They finished 7th last year.'}
          </div>
        </div>
      </button>

      <button onClick={onSquad} className="block w-full mt-5 text-left">
        <div
          className="rounded-xl px-4 py-2.5 flex items-center justify-between"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          <div>
            <div className="disp tracking-[0.2em] text-[10px] font-bold" style={{ color: theme.pitch }}>
              THE SQUAD
            </div>
            <div className="disp num text-[15px] font-bold mt-0.5">
              {squadAvailable === undefined || squadAvailable === squadSize
                ? `${squadSize} players`
                : `${squadAvailable} available`}
              <span className="text-[12px] font-normal ml-2" style={{ color: theme.muted }}>
                {squadAvailable !== undefined && squadAvailable < squadSize
                  ? `${squadSize - squadAvailable} out · £${squadValue.toFixed(1)}m on the books`
                  : `£${squadValue.toFixed(1)}m on the books`}
              </span>
            </div>
          </div>
          <span className="disp text-[13px]" style={{ color: theme.faint }}>▸</span>
        </div>
      </button>

      {record.played > 0 && (
        <Card className="mt-5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>SEASON</Eyebrow>
              <div className="disp num text-lg font-bold">
                <span style={{ color: theme.green }}>{record.won}W</span>
                <span style={{ color: theme.faint }}> · </span>
                <span style={{ color: theme.red }}>{record.lost}L</span>
                {record.tied > 0 && (
                  <>
                    <span style={{ color: theme.faint }}> · </span>
                    <span style={{ color: theme.muted }}>{record.tied}T</span>
                  </>
                )}
                <span className="text-[12px] font-normal ml-2" style={{ color: theme.muted }}>
                  from {record.played}
                </span>
              </div>
            </div>
            {record.bestChase && (
              <div className="text-right">
                <Eyebrow>BEST CHASE</Eyebrow>
                <div className="disp num text-lg font-bold" style={{ color: theme.gold }}>
                  {record.bestChase.runs}
                </div>
                <div className="text-[10px]" style={{ color: theme.faint }}>
                  v {record.bestChase.opponent}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mt-5">
        <Eyebrow>FRIENDLY</Eyebrow>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {TIER_ORDER.map((t) => (
            <GhostButton
              key={t}
              active={tier === t}
              onClick={() => { setTier(t); setClub(null) }}
              className="!px-1 !text-[10px] text-center"
            >
              {TIER_LABEL[t].split(' ')[0].toUpperCase()}
            </GhostButton>
          ))}
        </div>

        <div className="text-[11.5px] mb-3 leading-snug px-1" style={{ color: theme.muted }}>
          {TIER_BLURB[tier]}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {clubs.map((c) => {
            const s = teamStrength(c.xi)
            const selected = club?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setClub(c)}
                className="text-left rounded-xl px-3 py-2.5 active:scale-[0.98] transition-all"
                style={{
                  background: selected ? 'rgba(233,185,73,.12)' : theme.surface,
                  border: `1px solid ${selected ? theme.gold : theme.border}`,
                }}
              >
                <div
                  className="disp text-[15px] font-bold leading-tight truncate"
                  style={{ color: selected ? theme.gold : theme.cream }}
                >
                  {c.name}
                </div>
                <div className="disp num text-[10px] mt-1 tracking-wider" style={{ color: theme.faint }}>
                  BAT {s.bat} · BWL {s.bowl}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5">
        <PrimaryButton onClick={() => club && onStart(club)} disabled={!club}>
          {club ? 'TAKE THE FIELD' : 'PICK AN OPPONENT'}
        </PrimaryButton>
        {club && (
          <div className="text-center text-[11px] mt-2" style={{ color: theme.muted }}>
            You win the toss and bowl. 45 overs.
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <GhostButton onClick={onSquad} className="flex-1 text-center !py-3 !text-[12px]">
          MANAGE SQUAD
        </GhostButton>
        <GhostButton
          onClick={onToggleInstant}
          active={instant}
          className="flex-1 text-center !py-3 !text-[12px]"
        >
          INSTANT · {instant ? 'ON' : 'OFF'}
        </GhostButton>
      </div>

      <Panel className="mt-5">
        <Eyebrow>HOW IT WORKS</Eyebrow>
        {HOW_IT_WORKS.map(([k, v]) => (
          <div key={k} className="flex gap-3 mb-2.5 last:mb-0">
            <div className="disp font-bold text-sm w-16 shrink-0 tracking-wider" style={{ color: theme.gold }}>
              {k.toUpperCase()}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: theme.muted }}>{v}</div>
          </div>
        ))}
      </Panel>

      <Panel className="mt-3">
        <Eyebrow>READING A PLAYER</Eyebrow>
        <div className="grid grid-cols-2 gap-2">
          {STATS.map(([k, what, why]) => (
            <div key={k} className="rounded-lg p-2" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
              <div className="disp text-sm font-bold tracking-wider" style={{ color: theme.gold }}>{k}</div>
              <div className="text-[11px] font-semibold mt-0.5">{what}</div>
              <div className="text-[10px] leading-snug mt-0.5" style={{ color: theme.faint }}>{why}</div>
            </div>
          ))}
        </div>
        <div className="text-[10.5px] leading-relaxed mt-3" style={{ color: theme.faint }}>
          Every rating runs 0-100, where 60 is a solid first-teamer and 85+ is the best in the division.
        </div>
      </Panel>

      <div className="text-[9.5px] leading-relaxed text-center mt-5 px-4" style={{ color: theme.faint }}>
        Unofficial fan-made game. Opposition club names are real Surrey Cricket Championship
        clubs; their players and ratings are entirely fictional.
      </div>
    </div>
  )
}
