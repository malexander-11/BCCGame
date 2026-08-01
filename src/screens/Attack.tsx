import { useMemo, useState } from 'react'
import {
  BLOCK_CAP, BLOCK_LABELS, blockRange, figuresText, RULES, settledLabel,
} from '../data/types'
import type {
  BlockPlan, BowlerFigures, Club, Field, InningsResult, Player,
} from '../data/types'
import { blockRng, blockSize, buildBlockRota, oversLeft, validateBlock } from '../engine/rota'
import { availableBowlers } from '../engine/ratings'
import { FieldPicker } from '../components/FieldPicker'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, StatBar, StickyFooter,
} from '../components/ui'

const bowlIndex = (p: Player) => 0.5 * p.bowl.def + 0.5 * p.bowl.att
/** Below this a legal bowler is really a part-timer, not part of the attack. */
const FRONTLINE = 60

const econ = (f: BowlerFigures) => (f.balls > 0 ? (f.runs / f.balls) * RULES.ballsPerOver : 0)

/**
 * Who bowls the next nine overs, and where the fielders stand for them.
 *
 * The same screen five times an innings: once before the toss for the new ball,
 * then at every drinks break with the score in front of you. That's the point —
 * no captain plans forty-five overs before a ball is bowled, he gives the new
 * ball to two men and decides the next spell from what he's just watched.
 */
export function Attack({
  block, xi, opponent, plan, used, previous, beforeThat, field, suggestedField, innings, seed,
  onChange, onField, onAuto, onBack, onNext,
}: {
  /** Which nine overs we're setting, 0-4. */
  block: number
  xi: Player[]
  opponent: Club
  plan: BlockPlan
  /** Overs each bowler has already got through. */
  used: Map<string, number>
  /** Who bowled the last over of the block behind — he can't open this one. */
  previous: string | null
  /** ...and the one before that, whose end it still is. */
  beforeThat: string | null
  field: Field
  suggestedField: Field
  /** The innings so far. Null before a ball has been bowled. */
  innings: InningsResult | null
  /** The match seed, so the preview is the rota you'll actually get. */
  seed: number
  onChange: (plan: BlockPlan) => void
  onField: (f: Field) => void
  onAuto: () => void
  onBack?: () => void
  onNext: () => void
}) {
  const { from, to } = blockRange(block)
  const want = blockSize(block)

  // `xi` arrives in batting order, which puts your worst bowler at the top of
  // the attack list. Sort by what they're actually here for, and push the
  // part-timers below a divider.
  const { frontline, partTime } = useMemo(() => {
    const all = [...availableBowlers(xi)].sort((a, b) => bowlIndex(b) - bowlIndex(a))
    return {
      frontline: all.filter((p) => bowlIndex(p) >= FRONTLINE),
      partTime: all.filter((p) => bowlIndex(p) < FRONTLINE),
    }
  }, [xi])

  /** A bowler with no overs, opened up so he can be given some. */
  const [opened, setOpened] = useState<string | null>(null)

  const byId = useMemo(() => new Map(plan.map((a) => [a.playerId, a.overs])), [plan])
  const given = plan.reduce((s, a) => s + a.overs, 0)
  const issues = validateBlock(block, plan, xi, used, previous)

  // buildBlockRota is deterministic in the seed, so this is the order the
  // innings will actually bowl — a preview, not an estimate.
  const rota = useMemo(
    () => (issues.length > 0
      ? []
      : buildBlockRota(block, plan, previous, beforeThat, blockRng(seed, block))),
    [block, plan, previous, beforeThat, seed, issues.length],
  )

  const oversOf = (id: string) => byId.get(id) ?? 0
  /** Most he can have this block: half of it if he just bowled, else the cap. */
  const ceilingFor = (p: Player) =>
    Math.min(p.id === previous ? Math.floor(want / 2) : BLOCK_CAP, oversLeft(used, p.id))

  const bump = (p: Player, delta: number) => {
    const next = oversOf(p.id) + delta
    if (next < 0) return
    if (delta > 0 && (given >= want || next > ceilingFor(p))) return
    const others = plan.filter((a) => a.playerId !== p.id)
    onChange(next === 0 ? others : [...others, { playerId: p.id, overs: next }])
  }

  const bowling = plan
    .filter((a) => a.overs > 0)
    .map((a) => xi.find((p) => p.id === a.playerId))
    .filter((p): p is Player => p !== undefined)

  /**
   * Everyone's analysis **as at this break**, taken from each man's most recent
   * over before it.
   *
   * Not from `innings.bowling`, which is his card at the end of the innings —
   * that would tell you how the whole thing turns out before you'd picked who
   * bowls the next nine. What he has actually done with the ball so far is the
   * most useful thing a captain has here, and the ratings alone don't say it: a
   * 91-DEF bowler going at seven an over is having a day.
   */
  const figures = useMemo(() => {
    const map = new Map<string, BowlerFigures>()
    for (const o of innings?.overSummaries ?? []) {
      if (o.over >= from) break
      map.set(o.bowlerId, o.figures)
    }
    return map
  }, [innings, from])

  const renderBowler = (p: Player, i: number) => {
    const overs = oversOf(p.id)
    const on = overs > 0
    const spin = p.bowlType === 'spin'
    const left = oversLeft(used, p.id)
    const ceiling = ceilingFor(p)
    const spent = left <= 0
    const his = figures.get(p.id)
    // Nobody needs a disabled stepper for a bowler who isn't in the attack. He
    // collapses to a single line until you tap him.
    const showControls = on || opened === p.id

    return (
      <div
        key={p.id}
        className="px-3 py-2.5"
        style={{
          background: on ? 'rgba(233,185,73,.08)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
          borderTop: i > 0 ? `1px solid ${theme.border}66` : 'none',
          opacity: spent && !on ? 0.45 : 1,
        }}
        onClick={!showControls && !spent ? () => setOpened(p.id) : undefined}
        role={!showControls && !spent ? 'button' : undefined}
        tabIndex={!showControls && !spent ? 0 : undefined}
        onKeyDown={!showControls && !spent
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpened(p.id) } }
          : undefined}
        aria-label={!showControls && !spent ? `Bring ${p.name} on for these overs` : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[13.5px] font-semibold truncate"
                style={{ color: on ? theme.gold : theme.cream }}
              >
                {p.name}
              </span>
              {/* What he has actually done with the ball, not what he's rated,
                  coloured by what it's costing — a 91-DEF bowler going at seven
                  an over is having a day, and the ratings don't say so. */}
              {his && his.balls > 0 && (
                <span
                  className="disp num text-[11px] shrink-0"
                  title={`${econ(his).toFixed(2)} an over`}
                  style={{
                    color: econ(his) > 6 ? theme.red : econ(his) < 4 ? theme.green : theme.muted,
                    fontWeight: his.wickets > 0 ? 700 : 400,
                  }}
                >
                  {figuresText(his, RULES.ballsPerOver)}
                </span>
              )}
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5 flex items-center gap-1.5">
              <span style={{ color: spin ? theme.sky : theme.faint }}>{spin ? 'SPIN' : 'PACE'}</span>
              <span style={{ color: spent ? theme.red : left <= 2 ? theme.pitch : theme.faint }}>
                {spent ? 'BOWLED OUT' : `${left} LEFT`}
              </span>
              {p.id === previous && (
                <span style={{ color: theme.pitch }}>JUST BOWLED</span>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <StatBar label="DEF" value={p.bowl.def} width={34} />
            <StatBar label="ATT" value={p.bowl.att} width={34} />
            {(p.swing ?? 0) > 0 && <StatBar label="SWG" value={p.swing!} width={34} />}
          </div>

          {showControls ? (
            <div className="flex items-center shrink-0">
              <button
                onClick={() => bump(p, -1)}
                disabled={overs === 0}
                aria-label={`One fewer over for ${p.name}`}
                className="disp w-10 h-11 rounded-l-lg text-xl font-bold
                           active:scale-90 transition-transform disabled:opacity-25"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.muted }}
              >
                −
              </button>
              <div
                className="disp num w-8 text-center text-[17px] font-bold"
                style={{ color: on ? theme.gold : theme.faint }}
              >
                {overs}
              </div>
              <button
                onClick={() => bump(p, +1)}
                disabled={given >= want || overs >= ceiling}
                aria-label={`One more over for ${p.name}`}
                className="disp w-10 h-11 rounded-r-lg text-xl font-bold
                           active:scale-90 transition-transform disabled:opacity-25"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.cream }}
              >
                +
              </button>
            </div>
          ) : (
            <div className="disp text-[15px] w-9 text-right shrink-0" style={{ color: theme.faint }}>
              {spent ? '—' : '▸'}
            </div>
          )}
        </div>

        {on && (p.swing ?? 0) >= 50 && from > 12 && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.pitch }}>
            {p.name} swings it — that's long gone by now.
          </div>
        )}
        {on && spin && from >= RULES.deathFrom && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.pitch }}>
            A spinner at the death goes for about a run an over more.
          </div>
        )}
        {on && spin && from <= RULES.powerplayUntil && (
          <div className="text-[10px] mt-1.5" style={{ color: theme.pitch }}>
            Spin with the new ball gets carted. He's worth far more in the middle.
          </div>
        )}
      </div>
    )
  }

  // The innings we're handed is the whole thing — every block, including the
  // ones the auto captain filled in ahead of us — so it has to be read at the
  // break rather than at the end. Showing the closing score here would tell you
  // how the innings finishes before you've picked who bowls it.
  const score = innings?.overSummaries.find((o) => o.over === from - 1)
  const atCrease = score?.atCrease ?? []

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title={BLOCK_LABELS[block]}
        subtitle={
          score
            ? `Overs ${from}-${to} · ${opponent.name} ${score.total}/${score.totalWkts}`
            : `Overs ${from}-${to} · v ${opponent.name}`
        }
        onBack={onBack}
        right={
          <div className="text-right">
            <div
              className="disp num text-xl font-bold leading-none"
              style={{ color: given === want ? theme.gold : theme.cream }}
            >
              {given}<span style={{ color: theme.faint }}>/{want}</span>
            </div>
            <div className="disp text-[10px] tracking-wider mt-0.5" style={{ color: theme.faint }}>
              {given === want ? 'SET' : 'OVERS'}
            </div>
          </div>
        }
      />

      {atCrease.length > 0 && (
        <div
          className="rounded-xl overflow-hidden mb-3"
          style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
        >
          <div
            className="disp text-[8.5px] tracking-widest px-3 py-1.5"
            style={{ color: theme.faint, background: theme.surface2 }}
          >
            WHO YOU'RE BOWLING AT
          </div>
          {atCrease.map((b, i) => (
            <div
              key={b.name}
              className="px-3 py-1.5 flex items-center gap-2"
              style={{ borderTop: i > 0 ? `1px solid ${theme.border}55` : 'none' }}
            >
              <span className="text-[13px] font-semibold truncate flex-1">{b.name}</span>
              <span className="disp num text-[14px] font-bold shrink-0">
                {b.runs}
                <span className="text-[10px] font-normal ml-1" style={{ color: theme.faint }}>
                  ({b.balls})
                </span>
              </span>
              {/* How set he is, which is the whole reason to choose a field. */}
              <span className="w-14 shrink-0">
                <span
                  className="disp text-[8px] tracking-widest block text-right"
                  style={{ color: b.settled >= 0.85 ? theme.red : b.settled < 0.22 ? theme.green : theme.pitch }}
                >
                  {settledLabel(b.settled)}
                </span>
                <span className="block h-1 rounded-full mt-0.5" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round(b.settled * 100)}%`,
                      background: b.settled >= 0.85 ? theme.red : b.settled < 0.22 ? theme.green : theme.pitch,
                    }}
                  />
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mb-3">
        <GhostButton onClick={onAuto} className="flex-1 text-center">AUTO</GhostButton>
        <GhostButton onClick={() => onChange([])} className="flex-1 text-center">CLEAR</GhostButton>
      </div>

      <Eyebrow>WHO BOWLS THESE {want}?</Eyebrow>
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${theme.border}` }}>
        {frontline.length === 0 && (
          <div className="px-3 py-3 text-[12px] text-center" style={{ color: theme.faint }}>
            No frontline bowler in this side.
          </div>
        )}
        {frontline.map((p, i) => renderBowler(p, i))}
        {partTime.length > 0 && (
          <div
            className="disp text-[9.5px] tracking-widest px-3 py-1.5"
            style={{ color: theme.faint, background: theme.surface2, borderTop: `1px solid ${theme.border}` }}
          >
            PART-TIMERS · ONLY IF YOU HAVE TO
          </div>
        )}
        {partTime.map((p, i) => renderBowler(p, i))}
      </div>

      <FieldPicker
        value={field}
        recommended={suggestedField}
        bowlers={bowling.map((p) => ({ name: p.name, def: p.bowl.def, att: p.bowl.att }))}
        // Priced against the men actually out there, so the numbers move as
        // they get in — which is the whole reason the crease panel is above.
        settled={atCrease.length > 0
          ? atCrease.reduce((s, x) => s + x.settled, 0) / atCrease.length
          : 0}
        onChange={onField}
      />

      {rota.length > 0 && (
        <>
          <Eyebrow>HOW IT WILL BOWL</Eyebrow>
          <div
            className="rounded-xl px-2.5 py-2 flex flex-wrap gap-x-1.5 gap-y-1 mb-2"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            {rota.map((id, i) => {
              const p = xi.find((x) => x.id === id)
              const over = from + i
              return (
                <span
                  key={i}
                  className="disp text-[9.5px] px-1 py-0.5 rounded tracking-wide"
                  title={`Over ${over} — ${p?.name ?? id}`}
                  style={{ color: p?.bowlType === 'spin' ? theme.sky : theme.muted }}
                >
                  <span className="num" style={{ color: theme.faint }}>{over}</span>{' '}
                  {p?.name.split(' ').slice(-1)[0] ?? '?'}
                </span>
              )
            })}
          </div>
        </>
      )}

      <StickyFooter>
        {issues.length > 0 && (
          <div className="mb-2">
            <Notice>{issues[0].message}</Notice>
          </div>
        )}
        <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
          {block === 0 ? 'START THE MATCH' : 'PLAY ON'}
        </PrimaryButton>
      </StickyFooter>
    </div>
  )
}
