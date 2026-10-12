import { useState } from 'react'
import { supabase, type Member } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { Card } from './ui'

const PALETTE = ['#6A4FB3', '#C77A12', '#4CAF6E', '#B3261E', '#2F5FC4', '#0E8A8A', '#C2417A', '#5B6662']

/** Editar nombres y colores, añadir niños y restablecer la verificación del otro adulto */
export default function FamilyCard() {
  const { members, me, reload } = useHousehold()
  const [names, setNames] = useState<Record<string, string>>({})
  const [newKid, setNewKid] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirmReset, setConfirmReset] = useState<string | null>(null)

  async function save(m: Member, changes: Partial<Pick<Member, 'display_name' | 'color'>>) {
    setError('')
    const { error } = await supabase.from('members').update(changes).eq('id', m.id)
    if (error) setError(error.message)
    await reload()
  }

  async function addKid() {
    const name = newKid.trim()
    if (!name || !me) return
    const used = new Set(members.map(m => m.color.toUpperCase()))
    const color = PALETTE.find(c => !used.has(c)) ?? PALETTE[0]
    const { error } = await supabase.from('members').insert({ household_id: me.household_id, kind: 'child', display_name: name, color })
    if (error) setError(error.message)
    else setNewKid('')
    await reload()
  }

  async function resetMfa(m: Member) {
    setConfirmReset(null); setError(''); setNote('')
    const { data, error } = await supabase.functions.invoke('reset-mfa', { body: { member_id: m.id } })
    if (error || (data as { error?: string })?.error) { setError((data as { error?: string })?.error ?? 'No se pudo restablecer'); return }
    setNote(`Listo. ${m.display_name} podrá entrar con su contraseña y configurar un autenticador nuevo.`)
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-bold text-[15px]">Familia</h2>
      <ul className="flex flex-col gap-4">
        {members.map(m => {
          const value = names[m.id] ?? m.display_name
          return (
            <li key={m.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: m.color }} aria-hidden="true" />
                <label className="flex-1">
                  <span className="sr-only">Nombre</span>
                  <input
                    value={value}
                    maxLength={40}
                    onChange={e => setNames(n => ({ ...n, [m.id]: e.target.value }))}
                    onBlur={() => { if (value.trim() && value.trim() !== m.display_name) save(m, { display_name: value.trim() }) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]"
                  />
                </label>
                <span className="text-xs text-muted w-12 text-right">{m.kind === 'child' ? 'Niño' : m.id === me?.id ? 'Tú' : 'Adulto'}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap pl-5" role="radiogroup" aria-label={`Color de ${m.display_name}`}>
                {PALETTE.map(c => (
                  <button key={c} role="radio" aria-checked={m.color.toUpperCase() === c} aria-label={c} onClick={() => save(m, { color: c })}
                    className={`w-8 h-8 rounded-full ${m.color.toUpperCase() === c ? 'ring-2 ring-offset-2 ring-ink ring-offset-card' : ''}`} style={{ background: c }} />
                ))}
              </div>
              {m.kind === 'adult' && m.id !== me?.id && (
                <div className="pl-5">
                  {confirmReset === m.id ? (
                    <div className="flex flex-col gap-2 bg-bg rounded-lg p-3">
                      <p className="text-sm">¿Restablecer la verificación en dos pasos de {m.display_name}? Úsalo solo si ha perdido o cambiado de móvil.</p>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setConfirmReset(null)} className="min-h-10 px-2 text-sm text-muted">Cancelar</button>
                        <button onClick={() => resetMfa(m)} className="min-h-10 px-3 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Restablecer</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmReset(m.id)} className="min-h-10 text-sm text-accent font-semibold">
                      ¿{m.display_name} perdió el móvil? Restablecer su verificación
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={e => { e.preventDefault(); addKid() }} className="flex gap-2 pt-1">
        <label className="flex-1">
          <span className="sr-only">Nombre del niño</span>
          <input value={newKid} onChange={e => setNewKid(e.target.value)} maxLength={40} placeholder="Añadir niño…"
            className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]" />
        </label>
        <button type="submit" disabled={!newKid.trim()} className="min-h-11 px-4 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-40">Añadir</button>
      </form>
      <p className="text-xs text-muted">Para añadir otro adulto con acceso, pídemelo: requiere invitar su email.</p>
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  )
}
