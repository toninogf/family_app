import { useState, type FormEvent } from 'react'
import { supabase, type Member } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { Sheet } from './Sheet'

const PALETTE = ['#6A4FB3', '#C77A12', '#4CAF6E', '#B3261E', '#2F5FC4', '#0E8A8A', '#C2417A', '#5B6662', '#8A6A2F', '#E0A100']

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}

/** Familia: lista compacta; al tocar a alguien se edita en una hoja */
export default function FamilyPanel() {
  const { members, me } = useHousehold()
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const order = [...members.filter(m => m.id === me?.id), ...members.filter(m => m.kind === 'adult' && m.id !== me?.id), ...members.filter(m => m.kind === 'child')]
  const role = (m: Member) => (m.id === me?.id ? 'Tú' : m.kind === 'adult' ? 'Adulto' : 'Niño')

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col bg-card rounded-2xl px-4">
        {order.map((m, i) => (
          <li key={m.id} className={i < order.length - 1 ? 'border-b border-line' : ''}>
            <button onClick={() => setEditing(m)} className="w-full flex items-center gap-3 min-h-16 text-left">
              <Avatar name={m.display_name} color={m.color} />
              <span className="flex-1 flex flex-col">
                <span className="text-[16px] font-semibold">{m.display_name}</span>
                <span className="text-xs text-muted">{role(m)}</span>
              </span>
              <span className="text-muted text-xl" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setEditing('new')} className="min-h-12 rounded-xl border border-dashed border-line text-accent font-semibold">+ Añadir niño</button>
      <p className="text-xs text-muted">Para dar acceso a otro adulto hace falta invitar su email: pídeselo a Claude.</p>
      {editing && <MemberSheet member={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MemberSheet({ member, onClose }: { member?: Member; onClose: () => void }) {
  const { members, me, reload } = useHousehold()
  const used = new Set(members.filter(m => m.id !== member?.id).map(m => m.color.toUpperCase()))
  const [name, setName] = useState(member?.display_name ?? '')
  const [color, setColor] = useState((member?.color ?? PALETTE.find(c => !used.has(c)) ?? PALETTE[0]).toUpperCase())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const isOtherAdult = member && member.kind === 'adult' && member.id !== me?.id
  const isChild = member?.kind === 'child'

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Escribe un nombre'); return }
    setBusy(true); setError('')
    const { error } = member
      ? await supabase.from('members').update({ display_name: name.trim(), color }).eq('id', member.id)
      : await supabase.from('members').insert({ household_id: me!.household_id, kind: 'child', display_name: name.trim(), color })
    setBusy(false)
    if (error) { setError(error.message); return }
    await reload()
    onClose()
  }

  async function resetMfa() {
    if (!member) return
    setConfirmReset(false); setError(''); setNote('')
    const { data, error } = await supabase.functions.invoke('reset-mfa', { body: { member_id: member.id } })
    const apiError = (data as { error?: string } | null)?.error
    if (error || apiError) { setError(apiError ?? 'No se pudo restablecer'); return }
    setNote(`Listo. ${member.display_name} podrá entrar con su contraseña y configurar un autenticador nuevo.`)
  }

  async function askDelete() {
    if (!member) return
    const { count } = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('child_id', member.id)
    setDeleting(count ?? 0)
  }

  async function removeChild() {
    if (!member) return
    const { error } = await supabase.rpc('remove_child', { p_member: member.id })
    if (error) { setError(error.message); return }
    await reload()
    onClose()
  }

  return (
    <Sheet title={member ? member.display_name : 'Añadir niño'} onClose={onClose}>
      <div className="flex flex-col items-center gap-2 -mt-2">
        <Avatar name={name || '?'} color={color} size={72} />
        <span className="text-xs text-muted">{member ? (member.id === me?.id ? 'Tú' : member.kind === 'adult' ? 'Adulto' : 'Niño') : 'Niño'}</span>
      </div>

      <form onSubmit={save} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Nombre</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus={!member}
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-muted mb-1.5">Color</legend>
          <div className="grid grid-cols-5 gap-3" role="radiogroup" aria-label="Color">
            {PALETTE.map(c => {
              const taken = used.has(c)
              const on = color === c
              return (
                <button type="button" key={c} role="radio" aria-checked={on} aria-label={taken ? `${c} (ya lo usa otra persona)` : c} onClick={() => setColor(c)}
                  className={`aspect-square rounded-full flex items-center justify-center text-white text-xl font-bold ${on ? 'ring-4 ring-offset-2 ring-ink ring-offset-bg' : ''} ${taken && !on ? 'opacity-35' : ''}`}
                  style={{ background: c }}>
                  {on ? '✓' : ''}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted">Los colores atenuados ya los usa otra persona.</p>
        </fieldset>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : member ? 'Guardar' : 'Añadir'}
        </button>
      </form>

      {isOtherAdult && (
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-bold text-[15px]">¿Ha perdido o cambiado de móvil?</h3>
          <p className="text-sm text-muted">Restablece su verificación en dos pasos para que pueda configurar un autenticador nuevo.</p>
          {confirmReset ? (
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
              <button onClick={resetMfa} className="min-h-10 px-4 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Sí, restablecer</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">Restablecer su verificación</button>
          )}
          {note && <p role="status" className="text-sm text-accent">{note}</p>}
        </section>
      )}

      {isChild && (
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          {deleting == null ? (
            <button onClick={askDelete} className="min-h-11 text-danger text-sm font-semibold">Eliminar a {member!.display_name}</button>
          ) : (
            <div className="flex flex-col gap-2 bg-card rounded-xl p-3">
              <p className="text-sm">
                ¿Eliminar a {member!.display_name}?{' '}
                {deleting === 0 ? 'No tiene actividades.' : `Sus ${deleting} actividad${deleting === 1 ? '' : 'es'} pasarán a «Familia».`}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleting(null)} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
                <button onClick={removeChild} className="min-h-10 px-4 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Eliminar</button>
              </div>
            </div>
          )}
        </section>
      )}
    </Sheet>
  )
}
