import { useMemo, useState } from 'react'
import { DEFAULT_AVAILABILITY, RULES } from '../data/types'
import type { Club, Player } from '../data/types'
import { availableBowlers } from '../engine/ratings'
import { formBand } from '../engine/form'
import { theme } from '../theme'
import {
  ConfirmButton, Eyebrow, GhostButton, Notice, PlayerMarks, PrimaryButton,
  ScreenHeader, StatBar, StickyFooter, availabilityColour, roleColour, roleOf,
} from '../components/ui'

export interface SelectionIssue { message: string }

export function selectionIssues(xi: Player[], keeperAvailable = true): SelectionIssue[] {
  const issues: SelectionIssue[] = []
  if (xi.length !== 11) {
    issues.push({ message: `Pick exactly 11 — you have ${xi.length}.` })
  }
  // With both keepers unavailable somebody just has to put the gloves on, so
  // don't block selection — the engine charges for it in byes and dropped
  // chances instead.
  if (keeperAvailable && !xi.some((p) => p.wk)) {
    issues.push({ message: 'No wicketkeeper in the side.' })
  }
  // The keeper doesn't bowl, so he doesn't count towards the attack.
  const bowlers = availableBowlers(xi).length
  if (bowlers < RULES.minBowlers) {
    issues.push({ message: `Only ${bowlers} can bowl — you need ${RULES.minBowlers} to get through 45 overs.` })
  }
  return issues
}

type Sort = 'form' | 'batting' | 'bowling' | 'avail' | 'value'

const SORTS: [Sort, string][] = [
  ['form', 'FORM'], ['batting', 'BAT'], ['bowling', 'BWL'], ['avail', 'AVL'], ['value', '£'],
]

/**
 * The half-finished half of a swap.
 *
 * Every change to the side is two taps: pick a man up — off the team sheet or
 * out of the squad — then tap where he goes or who he replaces. Both directions
 * work, so you can start from either end of the swap you have in mind.
 */
type Held =
  | { from: 'xi'; index: number }
  | { from: 'squad'; player: Player }

/** One line of the team sheet: a man, or a place in the order nobody has yet. */
interface Slot {
  p: Player | null
  /** Where he sits in the XI array. -1 for an empty slot. */
  i: number
  /** Where a man tapped into this slot would be spliced into the XI. */
  at: number
  /** True for the slot left open by dropping someone, as opposed to the tail. */
  open: boolean
  /** Which of the eleven places this is, 0-10. */
  slot: number
}

/**
 * Open places are held as **team-sheet positions**, 0-10, not as indexes into
 * the XI array. With one hole the two are the same number and it never mattered;
 * with three of last week's side away they diverge immediately, and an index is
 * then a promise about a list that has a hole in it.
 *
 * A place can only stand open while there is somebody missing to stand there,
 * so the list is trimmed to however many are actually free, keeping the newest —
 * a hole you made a moment ago outlives one you left behind three swaps back.
 */
const trimOpen = (slots: number[], picked: number): number[] => {
  const free = 11 - picked
  if (free <= 0) return []
  return [...new Set(slots)].slice(-free)
}

const batIndex = (p: Player) => 0.62 * p.bat.skill + 0.38 * p.bat.pwr
const bowlIndex = (p: Player) => 0.5 * p.bowl.def + 0.5 * p.bowl.att
const availOf = (p: Player) => p.availability ?? DEFAULT_AVAILABILITY
const firstName = (p: Player) => p.name.split(' ')[0]

export function Selection({
  squad, opponent, selected, unavailable, vacancies, forms,
  onSetXI, onAuto, onBack, onNext,
}: {
  squad: Player[]
  opponent: Club
  selected: Player[]
  /** Player id → why they're missing this week. Empty outside season mode. */
  unavailable?: Map<string, string>
  /**
   * Places last week's side left empty — the positions of the men who aren't
   * available. Opening state only: once you start moving people about, the
   * holes are yours.
   */
  vacancies?: number[]
  /** Tracked season form by player id. Absent in a friendly. */
  forms?: Record<string, number>
  /** The XI *is* the batting order, so every change — picking, dropping,
   *  swapping, reordering — is just handing back the new array. */
  onSetXI: (xi: Player[]) => void
  onAuto: () => void
  onBack: () => void
  onNext: () => void
}) {
  const [sort, setSort] = useState<Sort>('batting')
  const [pickedOnly, setPickedOnly] = useState(false)
  /** Hide players who can't play this week. On by default when there are any. */
  const [availableOnly, setAvailableOnly] = useState(true)
  const [held, setHeld] = useState<Held | null>(null)
  /**
   * The places in the order standing empty. Dropping a man leaves his slot open
   * rather than closing the ranks, so whoever you pick next walks in at three
   * instead of arriving at eleven and needing eight taps to get back.
   *
   * It opens on whoever is missing this week, for the same reason: three men
   * away should read as three holes in your side, not as eight names that have
   * quietly all moved up one.
   */
  const [open, setOpen] = useState<number[]>(() => trimOpen(vacancies ?? [], selected.length))

  const out = unavailable ?? new Map<string, string>()
  const ids = useMemo(() => new Set(selected.map((p) => p.id)), [selected])
  const keeperAvailable = squad.some((p) => p.wk && !out.has(p.id))
  const issues = selectionIssues(selected, keeperAvailable)
  const bowlers = availableBowlers(selected).length
  const keeper = selected.some((p) => p.wk)
  // Whoever is walking out first without the credentials for it.
  const exposed = selected.slice(0, 2).filter((p) => !p.opener)

  // A held slot can't outlive the man in it; every change clears the hold, but
  // AUTO and CLEAR come from outside so guard the read anyway.
  const holding = held?.from === 'xi' && held.index >= selected.length ? null : held
  const heldMan = holding?.from === 'xi' ? selected[holding.index] : null
  const arming = holding?.from === 'squad' ? holding.player : null

  const sheet = useMemo<Slot[]>(() => {
    const holes = new Set(trimOpen(open, selected.length))
    const rows: Slot[] = []
    let i = 0
    for (let slot = 0; slot < 11; slot += 1) {
      // A place someone has vacated, or — once the names run out — the tail.
      if (holes.has(slot) || i >= selected.length) {
        rows.push({ p: null, i: -1, at: i, open: holes.has(slot), slot })
        continue
      }
      rows.push({ p: selected[i], i, at: i, open: false, slot })
      i += 1
    }
    return rows
  }, [selected, open])

  /** The first place still to be filled — where an unheld pick lands. */
  const vacant = sheet.find((r) => r.open) ?? sheet.find((r) => r.p === null)
  const landing = vacant?.at ?? selected.length

  /** Which of the eleven places a man in the XI is standing in. */
  const slotOf = (i: number) => sheet.find((r) => r.i === i)?.slot ?? i

  /**
   * Hand back a new XI and put the two-tap state back to rest.
   *
   * The open places carry across by default: swapping a man at seven is no
   * reason for the hole at three to close up.
   */
  const set = (next: Player[], holes: number[] = open) => {
    onSetXI(next)
    setOpen(trimOpen(holes, next.length))
    setHeld(null)
  }

  const dropAt = (i: number) =>
    set([...selected.slice(0, i), ...selected.slice(i + 1)], [...open, slotOf(i)])
  const bringIn = (p: Player, at: number, slot: number) =>
    set([...selected.slice(0, at), p, ...selected.slice(at)], open.filter((s) => s !== slot))
  const replaceAt = (i: number, p: Player) => set(selected.map((x, n) => (n === i ? p : x)))

  const swapSlots = (a: number, b: number) => {
    const next = [...selected]
    const man = next[a]
    next[a] = next[b]
    next[b] = man
    set(next)
  }

  /** Nudge a player one place up or down the order. */
  const shift = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= selected.length) return
    swapSlots(i, j)
  }

  const tapSlot = (row: Slot) => {
    if (holding?.from === 'squad') {
      if (row.p) replaceAt(row.i, holding.player)
      else bringIn(holding.player, row.at, row.slot)
      return
    }
    if (holding?.from === 'xi') {
      // A hole in the order isn't somewhere to bat, so tapping one puts him down.
      if (!row.p) setHeld(null)
      else if (holding.index === row.i) setHeld(null)
      else swapSlots(holding.index, row.i)
      return
    }
    if (row.p) setHeld({ from: 'xi', index: row.i })
  }

  const tapSquad = (p: Player) => {
    const at = selected.findIndex((x) => x.id === p.id)
    if (at >= 0) { dropAt(at); return }
    if (holding?.from === 'xi') { replaceAt(holding.index, p); return }
    if (holding?.from === 'squad') {
      // Changed your mind about who's coming in — swap the armed man over.
      setHeld(holding.player.id === p.id ? null : { from: 'squad', player: p })
      return
    }
    if (selected.length < 11) { bringIn(p, landing, vacant?.slot ?? -1); return }
    // A full side. Rather than a tap that quietly does nothing, hold him ready
    // and ask who he's coming in for.
    setHeld({ from: 'squad', player: p })
  }

  const listed = useMemo(() => {
    const rows = pickedOnly
      ? squad.filter((p) => ids.has(p.id))
      // Anyone unavailable is dead weight between you and the button, so hide
      // them by default — the team news screen is where you read the reasons.
      : squad.filter((p) => !availableOnly || !out.has(p.id) || ids.has(p.id))
    const byName = (a: Player, b: Player) => {
      // Unavailable players sink to the bottom of whatever sort is active.
      const oa = out.has(a.id) ? 1 : 0
      const ob = out.has(b.id) ? 1 : 0
      return oa - ob
    }
    const then = (cmp: (a: Player, b: Player) => number) =>
      rows.sort((a, b) => byName(a, b) || cmp(a, b))
    switch (sort) {
      case 'batting': return then((a, b) => batIndex(b) - batIndex(a))
      case 'bowling': return then((a, b) => bowlIndex(b) - bowlIndex(a))
      case 'value': return then((a, b) => b.value - a.value)
      case 'avail': return then((a, b) => availOf(b) - availOf(a) || batIndex(b) - batIndex(a))
      case 'form':
        return then((a, b) => (forms?.[b.id] ?? 50) - (forms?.[a.id] ?? 50) || batIndex(b) - batIndex(a))
      default:
        return then((a, b) => batIndex(b) - batIndex(a))
    }
  }, [squad, sort, pickedOnly, availableOnly, ids, out, forms])

  /** The places standing empty, in batting order. */
  const holes = sheet.filter((r) => r.open)
  const holeList = holes.map((r) => r.slot + 1)
  const numbers = holeList.length > 1
    ? `${holeList.slice(0, -1).join(', ')} and ${holeList[holeList.length - 1]}`
    : `${holeList[0]}`

  const prompt = arming
    ? `${arming.name} is ready — tap the man he comes in for.`
    : heldMan
      ? `${firstName(heldMan)} is up — tap where he should bat, or tap his replacement below.`
      : holes.length === 1
        ? `Number ${numbers} is open — tap whoever should bat there.`
        : holes.length > 1
          ? `Numbers ${numbers} are open — tap whoever comes in at ${holeList[0]}.`
          : selected.length === 0
            ? 'Tap names below to pick your side. They bat in the order you add them.'
            : 'Tap a man on the sheet to move him or swap him out. ✕ drops him.'

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="SELECTION"
        subtitle={`v ${opponent.name} · 45 overs`}
        onBack={onBack}
        right={
          <div className="disp num text-xl font-bold" style={{ color: selected.length === 11 ? theme.gold : theme.cream }}>
            {selected.length}
            <span style={{ color: theme.faint }}>/11</span>
          </div>
        }
      />

      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>KEEPER</div>
          <div
            className="disp text-[13px] font-bold"
            style={{ color: keeper ? theme.green : keeperAvailable ? theme.red : theme.pitch }}
          >
            {keeper ? 'YES' : keeperAvailable ? 'NONE' : 'STAND-IN'}
          </div>
        </div>
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div className="disp text-[9px] tracking-widest" style={{ color: theme.faint }}>BOWLERS</div>
          <div
            className="disp num text-[13px] font-bold"
            style={{ color: bowlers >= RULES.minBowlers ? theme.green : theme.red }}
          >
            {bowlers}<span style={{ color: theme.faint }}> / {RULES.minBowlers} min</span>
          </div>
        </div>
        <GhostButton
          onClick={() => { onAuto(); setHeld(null); setOpen([]) }}
          className="!px-4"
        >
          AUTO
        </GhostButton>
      </div>

      <div className="flex items-start justify-between gap-2">
        <Eyebrow colour={theme.gold}>YOUR XI · BATTING ORDER</Eyebrow>
        {selected.length > 0 && (
          <ConfirmButton
            confirmLabel="TAP AGAIN"
            onConfirm={() => set([])}
            className="!px-2.5 !py-1 !text-[10px] shrink-0"
          >
            CLEAR
          </ConfirmButton>
        )}
      </div>

      <div
        className="rounded-xl overflow-hidden mb-3 transition-all"
        style={{
          border: `1px solid ${arming ? theme.gold : selected.length === 11 ? theme.gold : theme.border}`,
          boxShadow: arming ? '0 0 0 3px rgba(233,185,73,.12)' : 'none',
        }}
      >
        {sheet.map((row, slot) => {
          const p = row.p
          const up = holding?.from === 'xi' && holding.index === row.i && p !== null
          const stripe = slot % 2 ? 'rgba(255,255,255,.02)' : 'transparent'
          const line = slot < 10 ? `1px solid ${theme.border}55` : 'none'

          if (!p) {
            return (
              <button
                key={`slot${slot}`}
                onClick={() => tapSlot(row)}
                disabled={!arming}
                aria-label={arming ? `Bat ${arming.name} at ${slot + 1}` : `Number ${slot + 1} — nobody picked`}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5
                           enabled:active:scale-[0.995] transition-all disabled:cursor-default"
                style={{
                  minHeight: 44,
                  background: arming ? 'rgba(233,185,73,.10)' : stripe,
                  borderBottom: line,
                }}
              >
                <span
                  className="disp num w-5 text-center text-[13px] font-bold shrink-0"
                  style={{ color: arming ? theme.gold : row.open ? theme.pitch : theme.faint }}
                >
                  {slot + 1}
                </span>
                <span
                  className="text-[12px] flex-1 truncate"
                  style={{ color: arming ? theme.gold : row.open ? theme.pitch : theme.faint }}
                >
                  {arming
                    ? `Bat ${arming.name} here`
                    : row.open ? 'OPEN — pick a replacement' : '—'}
                </span>
              </button>
            )
          }

          return (
            <div
              key={p.id}
              className="flex items-stretch transition-all"
              style={{
                background: up ? 'rgba(233,185,73,.20)' : arming ? 'rgba(233,185,73,.05)' : stripe,
                borderBottom: line,
                outline: up ? `1px solid ${theme.gold}` : 'none',
                outlineOffset: -1,
              }}
            >
              <button
                onClick={() => tapSlot(row)}
                aria-label={arming ? `${arming.name} in for ${p.name}` : `${p.name}, batting ${slot + 1}`}
                className="text-left pl-3 pr-1.5 py-2 flex items-center gap-2.5 flex-1 min-w-0
                           active:scale-[0.995] transition-all"
                style={{ minHeight: 44 }}
              >
                <span
                  className="disp num w-5 text-center text-[13px] font-bold shrink-0"
                  style={{ color: up ? theme.gold : theme.faint }}
                >
                  {slot + 1}
                </span>
                <span className="text-[13px] font-semibold truncate flex-1" style={{ color: up ? theme.gold : theme.cream }}>
                  {p.name}
                  <PlayerMarks p={p} />
                </span>
                <span className="disp num text-[10px] shrink-0" style={{ color: theme.faint }}>
                  {p.bat.skill}/{p.bat.pwr}
                </span>
              </button>

              {/* One place at a time. Tap-to-swap above still handles long moves. */}
              <div className="flex shrink-0">
                {([[-1, '▲', 'up'], [1, '▼', 'down']] as const).map(([by, glyph, word]) => (
                  <button
                    key={word}
                    onClick={() => shift(row.i, by)}
                    disabled={by === -1 ? row.i === 0 : row.i === selected.length - 1}
                    aria-label={`Move ${p.name} ${word} the order`}
                    className="disp text-[11px] w-8 flex items-center justify-center
                               active:scale-90 transition-transform disabled:opacity-25"
                    style={{ color: theme.muted, borderLeft: `1px solid ${theme.border}55` }}
                  >
                    {glyph}
                  </button>
                ))}
                <button
                  onClick={() => dropAt(row.i)}
                  aria-label={`Drop ${p.name} from the XI`}
                  className="disp text-[12px] w-8 flex items-center justify-center
                             active:scale-90 transition-transform"
                  style={{ color: theme.red, borderLeft: `1px solid ${theme.border}55` }}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-[11px] leading-snug mb-3 px-1" style={{ color: arming || heldMan ? theme.gold : theme.muted }}>
        {prompt}
        {exposed.length > 0 && (
          <>
            {' '}
            <span style={{ color: theme.pitch }}>
              {exposed.map((p) => p.name).join(' and ')}{' '}
              {exposed.length > 1 ? "aren't openers" : "isn't an opener"} — the new ball will
              be hard work for {exposed.length > 1 ? 'them' : 'him'}.
            </span>
          </>
        )}
      </div>

      <div className="flex gap-1.5 mb-2">
        {SORTS.map(([s, label]) => (
          <GhostButton
            key={s}
            active={sort === s && !pickedOnly}
            onClick={() => { setSort(s); setPickedOnly(false) }}
            className="flex-1 !px-1 text-center !py-2.5"
          >
            {label}
          </GhostButton>
        ))}
      </div>
      <div className="flex gap-1.5 mb-3">
        <GhostButton
          active={pickedOnly}
          onClick={() => setPickedOnly((v) => !v)}
          className="flex-1 text-center !py-2.5"
        >
          PICKED ONLY
        </GhostButton>
        {out.size > 0 && (
          <GhostButton
            active={availableOnly}
            onClick={() => setAvailableOnly((v) => !v)}
            className="flex-1 text-center !py-2.5"
          >
            {availableOnly ? `HIDING ${out.size} OUT` : `SHOWING ${out.size} OUT`}
          </GhostButton>
        )}
      </div>

      <Eyebrow colour={heldMan ? theme.gold : theme.pitch}>
        {heldMan
          ? `TAP A REPLACEMENT FOR ${heldMan.name.toUpperCase()}`
          : pickedOnly
            ? 'YOUR XI'
            : `SQUAD · ${squad.length - out.size} AVAILABLE${out.size ? ` · ${out.size} OUT` : ''}`}
      </Eyebrow>
      <div
        className="rounded-xl overflow-hidden transition-all"
        style={{
          border: `1px solid ${heldMan ? theme.gold : theme.border}`,
          boxShadow: heldMan ? '0 0 0 3px rgba(233,185,73,.12)' : 'none',
        }}
      >
        {listed.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-center" style={{ color: theme.faint }}>
            Nobody picked yet.
          </div>
        )}
        {listed.map((p, i) => {
          const on = ids.has(p.id)
          const ready = arming?.id === p.id
          const role = roleOf(p)
          const missing = out.get(p.id)
          return (
            <button
              key={p.id}
              onClick={() => { if (!missing) tapSquad(p) }}
              disabled={!!missing}
              aria-label={
                missing ? `${p.name} — ${missing}`
                  : on ? `Drop ${p.name}`
                    : heldMan ? `${p.name} in for ${heldMan.name}`
                      : `Pick ${p.name}`
              }
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-all
                         enabled:active:scale-[0.995] disabled:cursor-not-allowed"
              style={{
                background: ready
                  ? 'rgba(233,185,73,.20)'
                  : on ? 'rgba(233,185,73,.10)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < listed.length - 1 ? `1px solid ${theme.border}66` : 'none',
                opacity: missing ? 0.45 : 1,
                outline: ready ? `1px solid ${theme.gold}` : 'none',
                outlineOffset: -1,
              }}
            >
              <div
                className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center disp text-[11px] font-bold"
                style={{
                  background: on || ready ? theme.gold : 'transparent',
                  border: `1px solid ${on || ready ? theme.gold : theme.border}`,
                  color: missing ? theme.red : '#1A1405',
                }}
              >
                {missing ? '✕' : ready ? '→' : on ? '✓' : ''}
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="text-[13.5px] font-semibold truncate"
                  style={{ color: on || ready ? theme.gold : theme.cream }}
                >
                  {p.name}
                  <PlayerMarks p={p} />
                </div>
                {missing ? (
                  // Wraps rather than truncates — the reason is half the fun.
                  <div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: theme.red }}>
                    {missing}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                      style={{ background: `${roleColour(role)}22`, color: roleColour(role) }}
                    >
                      {role}
                    </span>
                    {forms && (
                      <span
                        className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                        style={{
                          background: `${formBand(forms[p.id] ?? 50).colour}22`,
                          color: formBand(forms[p.id] ?? 50).colour,
                        }}
                      >
                        {formBand(forms[p.id] ?? 50).label}
                      </span>
                    )}
                    <span
                      className="disp num text-[9px] font-bold px-1.5 rounded tracking-wider"
                      title={`Availability ${availOf(p)}/10 — how often he turns up`}
                      style={{
                        background: `${availabilityColour(availOf(p))}22`,
                        color: availabilityColour(availOf(p)),
                      }}
                    >
                      {availOf(p)}/10
                    </span>
                    <span className="disp num text-[10px]" style={{ color: theme.faint }}>
                      £{p.value}m
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-1.5 shrink-0">
                <StatBar label="SKL" value={p.bat.skill} width={40} />
                <StatBar label="PWR" value={p.bat.pwr} width={40} />
                <StatBar label="DEF" value={p.bowl.def} width={40} />
                <StatBar label="ATT" value={p.bowl.att} width={40} />
              </div>
            </button>
          )
        })}
      </div>

      {!keeperAvailable && (
        <div className="mt-3">
          <Notice>
            Both keepers are unavailable. Whoever bats last will put the gloves on —
            expect byes and a couple of chances down behind the stumps.
          </Notice>
        </div>
      )}

      <StickyFooter>
        {issues.length > 0 && (
          <div className="mb-2">
            <Notice>{issues[0].message}</Notice>
          </div>
        )}
        <PrimaryButton onClick={onNext} disabled={issues.length > 0}>
          {issues.length > 0 ? `${selected.length}/11 PICKED` : 'SET THE ATTACK'}
        </PrimaryButton>
      </StickyFooter>
    </div>
  )
}
