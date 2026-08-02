import { useState } from 'react'
import { endOf, RULES, settledLabel } from '../data/types'
import type { Field, FowEntry, InningsResult, Intent, Player } from '../data/types'
import { autoField, autoIntent } from '../engine/ai'
import { confidence, formatOvers } from '../engine/innings'
import { theme } from '../theme'
import { FieldPicker } from '../components/FieldPicker'
import { IntentPicker } from '../components/IntentPicker'
import { PrimaryButton } from '../components/ui'

/**
 * A wicket, and the one decision it creates.
 *
 * A new batter is twice as easy to dismiss as a set one, and the field is
 * priced against exactly that — men round the bat are a bargain against
 * somebody who has just walked out and an indulgence against somebody set. That
 * is only a decision if you get to make it *when the wicket falls*, so play
 * stops on the ball rather than at the end of the over.
 *
 * Deliberately small. A match now stops twenty-odd times, so this is the thing
 * that changed, the thing you can do about it, and a button — with the sensible
 * answer already chosen, so agreeing is a single tap.
 */
export function WicketBreak({
  innings, fall, order, xi, mode, onPlayOn,
}: {
  innings: InningsResult
  /** The wicket just taken or lost. */
  fall: FowEntry
  /** The batting order, for looking up the new man's ratings. */
  order: Player[]
  /** The fielding side, for looking up whoever has the ball. */
  xi: Player[]
  /** Whose innings it is: your batters' orders, or your fielders' positions. */
  mode: 'batting' | 'fielding'
  onPlayOn: (choice: { intent?: Intent; field?: Field }) => void
}) {
  const ballsLeft = Math.max(0, RULES.balls - fall.ball)
  const target = innings.target ?? 0
  const need = Math.max(0, target - fall.score)
  const rrr = ballsLeft > 0 ? (need / ballsLeft) * 6 : 0

  // The new man has faced nothing, so he is as unset as anyone gets.
  const suggestedIntent = autoIntent(need, ballsLeft, fall.wkt, confidence(0))
  const suggestedField = autoField(
    Math.floor(fall.ball / (RULES.ballsPerOver * 9)), fall.score, fall.wkt,
  )
  const [intent, setIntent] = useState<Intent>(suggestedIntent)
  const [field, setField] = useState<Field>(suggestedField)

  const incoming = fall.incoming && order.find((p) => p.id === fall.incoming!.playerId)

  /**
   * Whoever is still there — the man at the other end, unchanged by the wicket.
   *
   * Worked out from the card rather than from an over's crease snapshot: the
   * snapshot for the over a wicket falls in is taken at the *end* of it, by
   * which point the new man is already in it, which had him standing at both
   * ends. And in the first over there's no completed over to read at all.
   */
  const goneAlready = new Set(
    innings.fow.filter((f) => f.ball <= fall.ball).map((f) => f.batter),
  )
  const partnerCard = innings.batting.find(
    (c) => c.batted && c.balls > 0 && !goneAlready.has(c.name)
      && c.playerId !== fall.incoming?.playerId,
  )
  const partner = partnerCard && {
    // His card is the *final* one, so his runs at this point come from the last
    // over snapshot that has him — and nought if he hasn't been in one yet.
    ...(innings.overSummaries
      .filter((o) => endOf(o) <= fall.ball)
      .flatMap((o) => o.atCrease)
      .filter((b) => b.playerId === partnerCard.playerId)
      .slice(-1)[0] ?? { runs: 0, balls: 0, settled: 0 }),
    name: partnerCard.name,
  }

  /** Who has the ball, so the field can be priced against him. */
  const bowling = innings.overSummaries.find(
    (o) => o.fromBall < fall.ball && endOf(o) >= fall.ball,
  )
  const bowlerNow = bowling && xi.find((p) => p.id === bowling.bowlerId)

  return (
    <div className="pt-8 pb-4 pop">
      <div
        className="disp tracking-[0.3em] text-[10px] text-center mb-1"
        style={{ color: mode === 'batting' ? theme.red : theme.green }}
      >
        WICKET · {formatOvers(fall.ball)} OVERS
      </div>
      <div className="disp text-center text-lg font-bold tracking-wide mb-4">
        {fall.batter} {mode === 'batting' ? 'is out' : 'goes'}
      </div>

      <div
        className="rounded-2xl px-5 py-4 text-center mb-3"
        style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
      >
        <div className="disp num font-extrabold leading-none" style={{ fontSize: 46 }}>
          {fall.score}
          <span style={{ color: theme.faint }}>/</span>
          <span style={{ color: fall.wkt >= 8 ? theme.red : theme.cream }}>{fall.wkt}</span>
        </div>
        <div className="disp text-[13px] mt-1 tracking-wide" style={{ color: theme.muted }}>
          {innings.target === null
            ? `${Math.round(ballsLeft / RULES.ballsPerOver)} overs to go`
            : need === 0
              ? 'Target reached'
              : `need ${need} off ${ballsLeft} · ${rrr.toFixed(2)} an over`}
        </div>
      </div>

      {(incoming || partner) && (
        <div
          className="rounded-xl overflow-hidden mb-3"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          {incoming && (
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="disp text-[8.5px] tracking-widest w-12 shrink-0" style={{ color: theme.gold }}>
                IN
              </span>
              <span className="text-[13.5px] font-semibold truncate flex-1">{incoming.name}</span>
              <span className="disp num text-[10.5px] shrink-0" style={{ color: theme.faint }}>
                {incoming.bat.skill}/{incoming.bat.pwr}
              </span>
              <span className="disp text-[8px] tracking-widest w-[4.6rem] text-right shrink-0"
                style={{ color: theme.green }}
              >
                {settledLabel(0)}
              </span>
            </div>
          )}
          {partner && (
            <div
              className="px-3 py-2 flex items-center gap-2"
              style={{ borderTop: incoming ? `1px solid ${theme.border}55` : 'none' }}
            >
              <span className="disp text-[8.5px] tracking-widest w-12 shrink-0" style={{ color: theme.faint }}>
                STILL IN
              </span>
              <span className="text-[13.5px] font-semibold truncate flex-1">{partner.name}</span>
              <span className="disp num text-[13px] font-bold shrink-0">
                {partner.runs}
                <span className="text-[10px] font-normal ml-1" style={{ color: theme.faint }}>
                  ({partner.balls})
                </span>
              </span>
              <span
                className="disp text-[8px] tracking-widest w-[4.6rem] text-right shrink-0"
                style={{ color: partner.settled >= 0.85 ? theme.red : partner.settled < 0.22 ? theme.green : theme.pitch }}
              >
                {settledLabel(partner.settled)}
              </span>
            </div>
          )}
        </div>
      )}

      {mode === 'batting' ? (
        incoming ? (
          <IntentPicker
            batters={[{
              playerId: incoming.id,
              name: incoming.name,
              skill: incoming.bat.skill,
              pwr: incoming.bat.pwr,
              value: intent,
              recommended: suggestedIntent,
            }]}
            onChange={(_, i) => setIntent(i)}
            heading={`HOW DOES ${incoming.name.split(' ').slice(-1)[0].toUpperCase()} PLAY IT?`}
          />
        ) : null
      ) : (
        <FieldPicker
          value={field}
          recommended={suggestedField}
          bowlers={bowlerNow ? [{
            name: bowlerNow.name, def: bowlerNow.bowl.def, att: bowlerNow.bowl.att,
          }] : []}
          // He has faced nothing, which is when catchers are cheapest.
          settled={0}
          onChange={setField}
          heading="WHERE DO THE FIELDERS GO?"
        />
      )}

      <PrimaryButton
        onClick={() => onPlayOn(mode === 'batting' ? { intent } : { field })}
      >
        PLAY ON
      </PrimaryButton>
    </div>
  )
}
