import { useState } from 'react'
import { blockOf, endOf, fieldAt, FIELDS, INTENTS, orderFor, RULES } from '../data/types'
import type {
  CreaseBatter, Field, FieldOrder, InningsResult, Intent, Order, Player,
} from '../data/types'
import { autoField, autoIntent } from '../engine/ai'
import { theme } from '../theme'
import { FieldPicker } from './FieldPicker'
import { IntentPicker } from './IntentPicker'
import type { IntentBatter } from './IntentPicker'
import { PrimaryButton } from './ui'

/**
 * Captaincy without waiting for a break.
 *
 * The nine-over block is the unit of *planning* — who bowls, and what you set
 * out to do with them. It was also, for a while, the only unit of *reacting*,
 * which is a different thing and much harder to defend: a captain watching two
 * men take fourteen off the over doesn't stand there for another seven waiting
 * for the drinks cart. He moves somebody, now.
 *
 * So these two panels hang off the playback itself and can be opened between
 * any two overs. They give exactly the same instructions the break screens do —
 * an append-only entry stamped with the ball it was given on — so everything
 * you have already watched replays identically and the decision is honest.
 */

/**
 * How the innings stood at the ball playback has reached, and which over an
 * instruction given now would first reach.
 *
 * Read off the last *completed* over: mid-over the current summary describes a
 * future that hasn't been shown yet, and pricing a field against a score the
 * manager can't see is how you get a decision he didn't make.
 */
function positionAt(innings: InningsResult, at: number) {
  const done = innings.overSummaries.filter((o) => endOf(o) <= at)
  const last = done[done.length - 1]
  const next = innings.overSummaries.find((o) => endOf(o) > at)
  return {
    runs: last?.total ?? 0,
    wickets: last?.totalWkts ?? 0,
    crease: last?.atCrease ?? [],
    /** The next over to be bowled — where the instruction lands. */
    over: next?.over ?? Math.floor(at / RULES.ballsPerOver) + 1,
    next,
  }
}

/**
 * Where the fielders actually are at this point: yours if you've said, and
 * otherwise the read the engine makes for itself — the same call, so the bar
 * never claims a setting the innings isn't bowling to.
 */
export function fieldNow(innings: InningsResult, fields: FieldOrder[], at: number): Field {
  const { runs, wickets, over } = positionAt(innings, at)
  return fieldAt(fields, at) ?? autoField(blockOf(over), runs, wickets)
}

/** That setting as it reads on the bar, e.g. "PRESS". */
export const fieldLabel = (innings: InningsResult, fields: FieldOrder[], at: number) =>
  FIELDS.find((f) => f.id === fieldNow(innings, fields, at))!.label

/** Before a ball is bowled there's no crease snapshot — it's the two openers. */
const openersOf = (order: Player[]): CreaseBatter[] =>
  order.slice(0, 2).map((p) => ({
    playerId: p.id, name: p.name, runs: 0, balls: 0, onStrike: false, settled: 0,
  }))

/**
 * What the men in the middle are trying to do, one word each — again including
 * anyone nobody has spoken to, who reads the chase for himself.
 */
export function intentLabel(
  innings: InningsResult, order: Player[], orders: Order[], at: number,
): string {
  const { runs, wickets, crease } = positionAt(innings, at)
  const inMiddle = crease.length > 0 ? crease : openersOf(order)
  const need = Math.max(0, (innings.target ?? 0) - runs)
  const ballsLeft = Math.max(0, RULES.balls - at)
  return inMiddle
    .map((b) => orderFor(orders, b.playerId, at)
      ?? autoIntent(need, ballsLeft, wickets, b.settled))
    .map((i) => INTENTS.find((x) => x.id === i)!.label)
    .join(' · ')
}

function From({ over }: { over: number }) {
  return (
    <div className="disp text-[9px] tracking-widest mb-2" style={{ color: theme.muted }}>
      FROM OVER {over}
    </div>
  )
}

/**
 * Move the field mid-block.
 *
 * Priced against the man who is about to bowl and the man who is about to face,
 * which is the whole reason to do it here rather than at the break: the over
 * that just went for fourteen is the one you're reacting to.
 */
export function LiveField({
  innings, xi, at, standing, onSet,
}: {
  innings: InningsResult
  /** Your side, so the setting can be priced against whoever bowls to it. */
  xi: Player[]
  /** Legal balls bowled. Whatever you set applies from the next one. */
  at: number
  /** Where the fielders are standing now, if you've ever said. */
  standing: Field | null
  onSet: (f: Field) => void
}) {
  const { runs, wickets, crease, over, next } = positionAt(innings, at)
  // The same read the engine makes when nobody has called it, so agreeing with
  // the suggestion here and letting it ride come to the same thing.
  const suggested = autoField(blockOf(over), runs, wickets)
  const [field, setField] = useState<Field>(standing ?? suggested)

  const bowler = next && xi.find((p) => p.id === next.bowlerId)
  // `onStrike` means he faced the last ball of the over, so the *other* man is
  // the one this field first has to get out.
  const facing = crease.find((b) => !b.onStrike) ?? crease[0]

  return (
    <>
      <From over={over} />
      <FieldPicker
        value={field}
        recommended={suggested}
        bowlers={bowler
          ? [{ name: bowler.name, def: bowler.bowl.def, att: bowler.bowl.att }]
          : []}
        settled={facing?.settled ?? 0.5}
        onChange={setField}
        heading="MOVE THEM NOW"
      />
      <PrimaryButton onClick={() => onSet(field)} disabled={field === standing}>
        SET THE FIELD
      </PrimaryButton>
    </>
  )
}

/**
 * Change what the batters are trying to do mid-block.
 *
 * Only what you actually tap is sent. Opening the panel to see where you stand
 * and closing it again must not quietly pin an order on a man who was reading
 * the chase for himself.
 */
export function LiveIntent({
  innings, order, at, standing, onSet,
}: {
  innings: InningsResult
  /** The batting order, for looking up the ratings of whoever is in. */
  order: Player[]
  at: number
  /** What each man is already under orders to do, if anything. */
  standing: (playerId: string) => Intent | null
  onSet: (given: Record<string, Intent>) => void
}) {
  const { runs, wickets, crease, over } = positionAt(innings, at)
  const need = Math.max(0, (innings.target ?? 0) - runs)
  const ballsLeft = Math.max(0, RULES.balls - at)
  // One suggestion per man, because how set he is changes what to tell him.
  const suggest = (settled: number) => autoIntent(need, ballsLeft, wickets, settled)

  const inMiddle = crease.length > 0 ? crease : openersOf(order)
  const [chosen, setChosen] = useState<Record<string, Intent>>({})

  const batters: IntentBatter[] = inMiddle
    .map((b) => {
      const p = order.find((x) => x.id === b.playerId)
      if (!p) return null
      const recommended = suggest(b.settled)
      return {
        playerId: b.playerId,
        name: b.name,
        skill: p.bat.skill,
        pwr: p.bat.pwr,
        value: chosen[b.playerId] ?? standing(b.playerId) ?? recommended,
        recommended,
      }
    })
    .filter((b): b is IntentBatter => b !== null)

  return (
    <>
      <From over={over} />
      <IntentPicker
        batters={batters}
        onChange={(playerId, intent) => setChosen((prev) => ({ ...prev, [playerId]: intent }))}
        heading="SEND OUT WORD"
      />
      <PrimaryButton
        onClick={() => onSet(chosen)}
        disabled={Object.keys(chosen).length === 0}
      >
        GIVE THE ORDER
      </PrimaryButton>
    </>
  )
}
