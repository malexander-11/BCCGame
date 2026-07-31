import { useState } from 'react'
import type { Player } from '../data/types'
import { BAGSHOT_SQUAD } from '../data/squad'
import { theme } from '../theme'
import {
  Eyebrow, GhostButton, Notice, PrimaryButton, ScreenHeader, roleColour, roleOf,
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
    bat: { skill: 60, pwr: 60 },
    bowl: { def: 0, att: 0 },
    positions: [1, 11],
  }
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
        const pos = Array.isArray(p.positions) ? p.positions : [1, 11]
        return {
          id: typeof p.id === 'string' ? p.id : `import-${i + 1}`,
          name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Player ${i + 1}`,
          bat: { skill: num(p.bat?.skill, 60), pwr: num(p.bat?.pwr, 60) },
          bowl: { def: num(p.bowl?.def), att: num(p.bowl?.att) },
          positions: [
            Math.max(1, Math.min(11, Number(pos[0]) || 1)),
            Math.max(1, Math.min(11, Number(pos[1]) || 11)),
          ],
          wk: p.wk === true,
          bowlType: p.bowlType === 'spin' ? 'spin' : p.bowlType === 'pace' ? 'pace' : undefined,
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
        Leave DEF and ATT at 0 for someone who doesn't bowl. Changes save automatically.
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
                      {p.bat.skill}/{p.bat.pwr} · {p.bowl.def}/{p.bowl.att} · bats {p.positions[0]}–{p.positions[1]}
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

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {([0, 1] as const).map((idx) => (
                      <label key={idx} className="block">
                        <div className="disp text-[9px] tracking-widest mb-1" style={{ color: theme.faint }}>
                          {idx === 0 ? 'BATS FROM' : 'BATS TO'}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={11}
                          value={p.positions[idx]}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(11, Number(e.target.value) || 1))
                            const positions: [number, number] = [...p.positions] as [number, number]
                            positions[idx] = v
                            if (positions[0] > positions[1]) positions[idx === 0 ? 1 : 0] = v
                            update(p.id, { ...p, positions })
                          }}
                          className="disp num w-full rounded-lg px-2 py-1.5 text-[14px] font-bold"
                          style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.cream }}
                        />
                      </label>
                    ))}
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
            placeholder='[{ "id": "1", "name": "…", "bat": { "skill": 70, "pwr": 65 }, "bowl": { "def": 0, "att": 0 }, "positions": [1, 3] }]'
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
