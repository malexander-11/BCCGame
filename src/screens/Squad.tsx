import { useState } from 'react'
import { DEFAULT_AVAILABILITY } from '../data/types'
import type { Player } from '../data/types'
import { BAGSHOT_SQUAD } from '../data/squad'
import { theme } from '../theme'
import {
  availabilityColour, Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader,
  roleColour, roleOf,
} from '../components/ui'

const FIELDS: [string, (p: Player) => number, (p: Player, v: number) => Player][] = [
  ['SKILL', (p) => p.bat.skill, (p, v) => ({ ...p, bat: { ...p.bat, skill: v } })],
  ['PWR', (p) => p.bat.pwr, (p, v) => ({ ...p, bat: { ...p.bat, pwr: v } })],
  ['DEF', (p) => p.bowl.def, (p, v) => ({ ...p, bowl: { ...p.bowl, def: v } })],
  ['ATT', (p) => p.bowl.att, (p, v) => ({ ...p, bowl: { ...p.bowl, att: v } })],
]

function blankPlayer(n: number): Player {
  return {
    id: `custom-${Date.now()}-${n}`,
    name: 'New player',
    value: 1,
    bat: { skill: 60, pwr: 60 },
    bowl: { def: 0, att: 0 },
    availability: DEFAULT_AVAILABILITY,
  }
}

/** Plain-English read on an availability score, shown under the input. */
function availabilityNote(v: number): string {
  if (v >= 10) return 'Never misses a week.'
  if (v >= 8) return 'Reliable — the odd weekend away.'
  if (v >= 6) return 'Around most weeks, but not all.'
  if (v >= 4) return 'Half a season at best.'
  if (v >= 2) return 'A ringer. Turns up when it suits.'
  return 'Barely plays. Do not build a side around him.'
}

export function Squad({
  squad, onChange, onReset, onBack, isCustom,
}: {
  squad: Player[]
  onChange: (squad: Player[]) => void
  onReset: () => void
  onBack: () => void
  isCustom: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const update = (id: string, next: Player) =>
    onChange(squad.map((p) => (p.id === id ? next : p)))

  const remove = (id: string) => {
    if (squad.length <= 11) return
    onChange(squad.filter((p) => p.id !== id))
  }

  const doImport = () => {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed) || parsed.length < 11) {
        setError('Needs to be a JSON array of at least 11 players.')
        return
      }
      const cleaned: Player[] = parsed.map((raw, i) => {
        const p = raw as Partial<Player> & Record<string, unknown>
        const num = (v: unknown, fallback = 0) =>
          typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : fallback
        const swing = num(p.swing)
        // Anything outside 0-10 is somebody using a different scale; fall back
        // rather than let a stray 80 make a player permanently unavailable.
        const avail =
          typeof p.availability === 'number' && Number.isFinite(p.availability)
            ? Math.round(Math.max(0, Math.min(10, p.availability)))
            : DEFAULT_AVAILABILITY
        return {
          id: typeof p.id === 'string' ? p.id : `import-${i + 1}`,
          name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Player ${i + 1}`,
          value: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0,
          role: typeof p.role === 'string' ? p.role : undefined,
          bat: { skill: num(p.bat?.skill, 60), pwr: num(p.bat?.pwr, 60) },
          bowl: { def: num(p.bowl?.def), att: num(p.bowl?.att) },
          wk: p.wk === true,
          bowlType: p.bowlType === 'spin' ? 'spin' : p.bowlType === 'pace' ? 'pace' : undefined,
          swing: swing > 0 ? swing : undefined,
          availability: avail,
        }
      })
      onChange(cleaned)
      setImporting(false)
      setText('')
      setError(null)
    } catch {
      setError("That isn't valid JSON.")
    }
  }

  const exportJson = () => {
    const json = JSON.stringify(squad, null, 2)
    setText(json)
    setImporting(true)
    navigator.clipboard?.writeText(json).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => { /* clipboard blocked — the textarea still shows it */ },
    )
  }

  const keepers = squad.filter((p) => p.wk).length
  const bowlers = squad.filter((p) => p.bowl.def > 0 && p.bowl.att > 0).length

  return (
    <div className="pt-6 pb-4 pop">
      <ScreenHeader
        title="SQUAD"
        subtitle={isCustom ? 'Your squad · saved to this browser' : 'Placeholder squad'}
        onBack={onBack}
        right={<div className="disp num text-xl font-bold">{squad.length}</div>}
      />

      <div className="text-[11.5px] leading-relaxed mb-3 px-1" style={{ color: theme.muted }}>
        Every rating runs 0-100 where <span style={{ color: theme.gold }}>60 is league average</span>.
        Leave DEF and ATT at 0 for someone who doesn't bowl.{' '}
        <span style={{ color: theme.gold }}>AVAIL</span> is out of 10 — how many weeks in ten he
        actually turns up. Changes save automatically.
      </div>

      {(keepers === 0 || bowlers < 5) && (
        <div className="mb-3">
          <Notice>
            {keepers === 0 && 'No wicketkeeper in the squad. '}
            {bowlers < 5 && `Only ${bowlers} can bowl — you need 5 to field a legal attack.`}
          </Notice>
        </div>
      )}

      <Eyebrow>PLAYERS</Eyebrow>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        {squad.map((p, i) => {
          const isOpen = open === p.id
          const role = roleOf(p)
          return (
            <div
              key={p.id}
              style={{
                background: isOpen ? 'rgba(233,185,73,.07)' : i % 2 ? 'rgba(255,255,255,.02)' : 'transparent',
                borderBottom: i < squad.length - 1 ? `1px solid ${theme.border}66` : 'none',
              }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : p.id)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{p.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="disp text-[9px] font-bold px-1.5 rounded tracking-wider"
                      style={{ background: `${roleColour(role)}22`, color: roleColour(role) }}
                    >
                      {role}
                    </span>
                    <span className="disp num text-[10px]" style={{ color: theme.faint }}>
                      {p.bat.skill}/{p.bat.pwr} · {p.bowl.def}/{p.bowl.att} · £{p.value}m ·{' '}
                      <span style={{ color: availabilityColour(p.availability ?? DEFAULT_AVAILABILITY) }}>
                        {p.availability ?? DEFAULT_AVAILABILITY}/10
                      </span>
                    </span>
                  </div>
                </div>
                <span className="disp text-[13px]" style={{ color: theme.faint }}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 slide-in">
                  <input
                    value={p.name}
                    onChange={(e) => update(p.id, { ...p, name: e.target.value })}
                    className="w-full rounded-lg px-2.5 py-2 text-[13px] mb-2"
                    style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
                  />

                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {FIELDS.map(([label, get, set]) => (
                      <label key={label} className="block">
                        <div className="disp text-[9px] tracking-widest mb-1" style={{ color: theme.faint }}>
                          {label}
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={get(p)}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                            update(p.id, set(p, v))
                          }}
                          className="disp num w-full rounded-lg px-2 py-1.5 text-[14px] font-bold"
                          style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <label className="block">
                      <div className="disp text-[9px] tracking-widest mb-1" style={{ color: theme.faint }}>
                        VALUE £m
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={p.value}
                        onChange={(e) => update(p.id, { ...p, value: Math.max(0, Number(e.target.value) || 0) })}
                        className="disp num w-full rounded-lg px-2 py-1.5 text-[14px] font-bold"
                        style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
                      />
                    </label>
                    <label className="block">
                      <div className="disp text-[9px] tracking-widest mb-1" style={{ color: theme.faint }}>
                        SWING
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={p.swing ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                          update(p.id, { ...p, swing: v > 0 ? v : undefined })
                        }}
                        className="disp num w-full rounded-lg px-2 py-1.5 text-[14px] font-bold"
                        style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
                      />
                    </label>
                    <label className="block">
                      <div className="disp text-[9px] tracking-widest mb-1" style={{ color: theme.faint }}>
                        AVAIL /10
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={p.availability ?? DEFAULT_AVAILABILITY}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0)))
                          update(p.id, { ...p, availability: v })
                        }}
                        className="disp num w-full rounded-lg px-2 py-1.5 text-[14px] font-bold"
                        style={{
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          color: availabilityColour(p.availability ?? DEFAULT_AVAILABILITY),
                        }}
                      />
                    </label>
                  </div>

                  <div className="text-[10.5px] leading-snug mb-2 px-0.5" style={{ color: theme.muted }}>
                    <span style={{ color: availabilityColour(p.availability ?? DEFAULT_AVAILABILITY) }}>
                      Availability {p.availability ?? DEFAULT_AVAILABILITY}/10.
                    </span>{' '}
                    {availabilityNote(p.availability ?? DEFAULT_AVAILABILITY)} Injuries are rolled
                    separately — keenness won't save a hamstring.
                  </div>

                  <div className="flex gap-2">
                    <GhostButton
                      active={p.wk === true}
                      onClick={() => update(p.id, { ...p, wk: !p.wk })}
                      className="flex-1 text-center"
                    >
                      KEEPER
                    </GhostButton>
                    <GhostButton
                      active={p.bowlType === 'pace'}
                      onClick={() => update(p.id, { ...p, bowlType: p.bowlType === 'pace' ? undefined : 'pace' })}
                      className="flex-1 text-center"
                    >
                      PACE
                    </GhostButton>
                    <GhostButton
                      active={p.bowlType === 'spin'}
                      onClick={() => update(p.id, { ...p, bowlType: p.bowlType === 'spin' ? undefined : 'spin' })}
                      className="flex-1 text-center"
                    >
                      SPIN
                    </GhostButton>
                    <GhostButton
                      onClick={() => remove(p.id)}
                      className="!px-3"
                      style={{ color: squad.length > 11 ? theme.red : theme.faint }}
                    >
                      ✕
                    </GhostButton>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 mt-3">
        <GhostButton onClick={() => onChange([...squad, blankPlayer(squad.length)])} className="flex-1 text-center !py-2.5">
          + ADD PLAYER
        </GhostButton>
        <GhostButton onClick={exportJson} className="flex-1 text-center !py-2.5">
          {copied ? 'COPIED ✓' : 'EXPORT'}
        </GhostButton>
        <GhostButton onClick={() => { setImporting(true); setText(''); setError(null) }} className="flex-1 text-center !py-2.5">
          IMPORT
        </GhostButton>
      </div>

      {importing && (
        <div className="mt-3 pop">
          <Eyebrow>SQUAD JSON</Eyebrow>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            spellCheck={false}
            placeholder='[{ "id": "1", "name": "…", "bat": { "skill": 70, "pwr": 65 }, "bowl": { "def": 0, "att": 0 }, "value": 3 }]'
            className="w-full rounded-lg px-3 py-2 text-[11px] font-mono"
            style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
          />
          {error && <div className="mt-2"><Notice>{error}</Notice></div>}
          <div className="flex gap-2 mt-2">
            <GhostButton onClick={doImport} className="flex-1 text-center !py-2.5">LOAD THIS SQUAD</GhostButton>
            <GhostButton onClick={() => { setImporting(false); setError(null) }} className="flex-1 text-center !py-2.5">
              CLOSE
            </GhostButton>
          </div>
        </div>
      )}

      {isCustom && (
        <div className="mt-3">
          <GhostButton
            onClick={onReset}
            className="w-full text-center !py-2.5"
            style={{ color: theme.red, borderColor: `${theme.red}55` }}
          >
            RESET TO PLACEHOLDER SQUAD ({BAGSHOT_SQUAD.length} PLAYERS)
          </GhostButton>
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton onClick={onBack} disabled={squad.length < 11}>
          {squad.length < 11 ? `NEED ${11 - squad.length} MORE` : 'DONE'}
        </PrimaryButton>
      </div>
    </div>
  )
}
