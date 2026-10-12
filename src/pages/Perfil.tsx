import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { disablePush, enablePush, pushStatus, sendTestPush, updatePushPrefs, type PushStatus } from '../lib/push'
import { Button, Card, ErrorText, Field } from '../components/ui'
import FamilyCard from '../components/FamilyCard'
import AuthenticatorsCard from '../components/AuthenticatorsCard'
import { ALL_SECTIONS, ALL_TABS, SECTION_LABEL, TAB_LABEL, moveIn, usePrefs, type SectionKey, type TabKey } from '../lib/prefs'

export default function Perfil() {
  const { me } = useHousehold()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setMsg(''); setError('')
    if (password.length < 12) { setError('Al menos 12 caracteres.'); return }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else { setMsg('Contraseña actualizada.'); setPassword('') }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-tight">Perfil</h1>
      <Card className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: me?.color }}>{me?.display_name.charAt(0)}</span>
        <span className="font-semibold">{me?.display_name}</span>
      </Card>

      <PersonalizeCard />
      <PushCard />
      <FamilyCard />
      <AuthenticatorsCard />

      <Card>
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          <Field label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          {msg && <p className="text-sm text-accent">{msg}</p>}
          <Button type="submit">Cambiar contraseña</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
      <Button variant="ghost" onClick={() => supabase.auth.signOut({ scope: 'global' })}>Cerrar sesión en todos los dispositivos</Button>
      <p className="text-xs text-muted text-center">Versión del {__APP_BUILD__}</p>
    </div>
  )
}

function PushCard() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const refresh = () => pushStatus().then(setStatus).catch(() => setStatus({ state: 'unsupported', reason: 'no-support' }))
  useEffect(() => { refresh() }, [])

  async function turnOn() {
    setBusy(true); setNote('')
    const err = await enablePush().catch(() => 'No se pudieron activar los avisos en este dispositivo.')
    setBusy(false)
    if (err) setNote(err)
    await refresh()
  }

  async function turnOff() {
    setBusy(true); await disablePush(); setBusy(false); await refresh()
  }

  async function toggle(key: 'daily' | 'weekly') {
    if (status?.state !== 'on') return
    const prefs = { ...status.prefs, [key]: !status.prefs[key] }
    setStatus({ state: 'on', prefs })
    await updatePushPrefs(prefs)
  }

  async function test() {
    setNote('')
    const err = await sendTestPush()
    setNote(err ?? 'Enviado. Debería llegarte en unos segundos.')
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-bold text-[15px]">Avisos en este dispositivo</h2>
        <p className="text-sm text-muted">La agenda del día cada mañana y un resumen el domingo por la tarde.</p>
      </div>

      {status === null ? <p className="text-sm text-muted">Comprobando…</p>
        : status.state === 'unsupported' ? (
          <p className="text-sm">
            {status.reason === 'ios-browser'
              ? 'En iPhone, primero instala la app: botón Compartir → «Añadir a pantalla de inicio». Luego ábrela desde el icono y vuelve aquí.'
              : 'Este navegador no admite avisos.'}
          </p>
        ) : status.state === 'denied' ? (
          <p className="text-sm">Has bloqueado los avisos para esta app. Actívalos en los ajustes del navegador o del teléfono y vuelve aquí.</p>
        ) : status.state === 'off' ? (
          <Button onClick={turnOn} disabled={busy}>{busy ? 'Activando…' : 'Activar avisos'}</Button>
        ) : (
          <div className="flex flex-col gap-1">
            {([['daily', 'Agenda del día (por la mañana)'], ['weekly', 'Resumen semanal (domingo)']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between min-h-12">
                <span className="text-[15px]">{label}</span>
                <input type="checkbox" checked={status.prefs[k]} onChange={() => toggle(k)} className="w-5 h-5 accent-[var(--app-accent)]" />
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={test} className="min-h-11 px-4 rounded-xl border border-line bg-card text-accent text-sm font-semibold">Enviar prueba</button>
              <button onClick={turnOff} disabled={busy} className="min-h-11 px-4 text-sm text-muted">Desactivar</button>
            </div>
          </div>
        )}
      {note && <p role="status" className="text-sm text-muted">{note}</p>}
    </Card>
  )
}

/** Personalizar: qué pestañas ve cada uno y en qué orden, y qué tarjetas salen en Hoy */
function PersonalizeCard() {
  const { prefs, save } = usePrefs()
  const [open, setOpen] = useState(false)
  const tabsOrdered = [...prefs.tabs, ...ALL_TABS.filter(t => !prefs.tabs.includes(t))]
  const secOrdered = [...prefs.home_sections, ...ALL_SECTIONS.filter(t => !prefs.home_sections.includes(t))]

  const toggleTab = (t: TabKey) => save({ tabs: prefs.tabs.includes(t) ? prefs.tabs.filter(x => x !== t) : [...prefs.tabs, t] })
  const toggleSec = (s: SectionKey) => save({ home_sections: prefs.home_sections.includes(s) ? prefs.home_sections.filter(x => x !== s) : [...prefs.home_sections, s] })

  return (
    <Card className="flex flex-col gap-3">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex justify-between items-center text-left">
        <span className="flex flex-col gap-0.5">
          <span className="font-bold text-[15px]">Personalizar mi app</span>
          <span className="text-sm text-muted">Pestañas que ves y orden de las tarjetas de Hoy. Solo cambia en tu cuenta.</span>
        </span>
        <span className="text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-bold text-muted">Pestañas de abajo</h3>
            <p className="text-xs text-muted">«Hoy» está siempre. Ocultar una pestaña solo la quita de tu vista: los datos siguen compartidos.</p>
            <OrderList items={tabsOrdered} label={t => TAB_LABEL[t]} on={t => prefs.tabs.includes(t)} onToggle={toggleTab}
              onMove={(t, d) => prefs.tabs.includes(t) && save({ tabs: moveIn(prefs.tabs, t, d) })} />
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-bold text-muted">Tarjetas de Hoy (y del aviso de la mañana)</h3>
            <OrderList items={secOrdered} label={s => SECTION_LABEL[s]} on={s => prefs.home_sections.includes(s)} onToggle={toggleSec}
              onMove={(s, d) => prefs.home_sections.includes(s) && save({ home_sections: moveIn(prefs.home_sections, s, d) })} />
          </section>
        </>
      )}
    </Card>
  )
}

function OrderList<T extends string>({ items, label, on, onToggle, onMove }: {
  items: T[]; label: (t: T) => string; on: (t: T) => boolean; onToggle: (t: T) => void; onMove: (t: T, d: -1 | 1) => void
}) {
  const visible = items.filter(on)
  return (
    <ul className="flex flex-col">
      {items.map((t, i) => {
        const isOn = on(t)
        const vi = visible.indexOf(t)
        return (
          <li key={t} className={`flex items-center gap-2 min-h-12 ${i < items.length - 1 ? 'border-b border-line' : ''}`}>
            <label className="flex-1 flex items-center gap-3 min-h-12">
              <input type="checkbox" checked={isOn} onChange={() => onToggle(t)} className="w-5 h-5 accent-[var(--app-accent)]" />
              <span className={`text-[15px] ${isOn ? '' : 'text-muted'}`}>{label(t)}</span>
            </label>
            {isOn && (
              <>
                <button onClick={() => onMove(t, -1)} disabled={vi === 0} aria-label={`Subir ${label(t)}`} className="w-10 h-10 text-muted disabled:opacity-30">↑</button>
                <button onClick={() => onMove(t, 1)} disabled={vi === visible.length - 1} aria-label={`Bajar ${label(t)}`} className="w-10 h-10 text-muted disabled:opacity-30">↓</button>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
