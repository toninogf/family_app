import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { disablePush, enablePush, pushStatus, sendTestPush, updatePushPrefs, type PushStatus, gymPushOn, setGymPushOn } from '../lib/push'
import { Button, Card, ErrorText, Field } from '../components/ui'
import FamilyPanel, { Avatar } from '../components/FamilyPanel'
import AuthenticatorsCard from '../components/AuthenticatorsCard'
import { ALL_SECTIONS, ALL_TABS, SECTION_LABEL, TAB_LABEL, moveIn, usePrefs, type SectionKey, type TabKey } from '../lib/prefs'

/** Borra la copia guardada de la app y vuelve a descargarla (pasando por Cloudflare Access si hace falta) */
async function forceUpdate() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(regs.map(r => r.unregister()))
    const keys = await caches?.keys?.() ?? []
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch { /* seguimos igualmente */ }
  window.location.href = `/renovar?t=${Date.now()}`
}

type Section = 'cuenta' | 'familia' | 'avisos' | 'personalizar' | 'sesion'
const SECTIONS: { key: Section; icon: string; title: string; hint: string }[] = [
  { key: 'cuenta', icon: '👤', title: 'Mi cuenta', hint: 'Contraseña y autenticadores' },
  { key: 'familia', icon: '👪', title: 'Familia', hint: 'Nombres, colores y niños' },
  { key: 'avisos', icon: '🔔', title: 'Avisos', hint: 'Agenda de la mañana y resumen semanal' },
  { key: 'personalizar', icon: '🎨', title: 'Personalizar mi app', hint: 'Pestañas y tarjetas de Hoy' },
  { key: 'sesion', icon: '🔒', title: 'Sesión y seguridad', hint: 'Cerrar sesión en este u otros dispositivos' }
]

export default function Perfil() {
  const { me } = useHousehold()
  const [section, setSection] = useState<Section | null>(null)
  const current = SECTIONS.find(x => x.key === section)

  // Cada sección se abre como una subpantalla con «‹ Perfil» para volver
  if (current) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <button onClick={() => setSection(null)} className="self-start min-h-10 -ml-1 px-1 text-accent font-semibold">‹ Perfil</button>
          <h1 className="text-[26px] font-bold tracking-tight">{current.title}</h1>
        </div>
        {section === 'cuenta' && <><PasswordCard /><AuthenticatorsCard /></>}
        {section === 'familia' && <FamilyPanel />}
        {section === 'avisos' && <PushCard />}
        {section === 'personalizar' && <PersonalizeCard />}
        {section === 'sesion' && (
          <Card className="flex flex-col gap-2">
            <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión en este dispositivo</Button>
            <Button variant="ghost" onClick={() => supabase.auth.signOut({ scope: 'global' })}>Cerrar sesión en todos los dispositivos</Button>
            <p className="text-xs text-muted">Usa «todos los dispositivos» si pierdes el móvil o crees que alguien ha entrado con tu cuenta.</p>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-tight">Perfil</h1>
      <Card className="flex items-center gap-3">
        {me && <Avatar name={me.display_name} color={me.color} size={52} />}
        <span className="flex flex-col">
          <span className="text-[18px] font-bold">{me?.display_name}</span>
          <span className="text-xs text-muted">Sesión protegida con verificación en dos pasos</span>
        </span>
      </Card>

      <ul className="flex flex-col bg-card rounded-2xl px-4">
        {SECTIONS.map((x, i) => (
          <li key={x.key} className={i < SECTIONS.length - 1 ? 'border-b border-line' : ''}>
            <button onClick={() => setSection(x.key)} className="w-full flex items-center gap-3 min-h-16 text-left">
              <span className="w-10 h-10 rounded-xl bg-bg flex items-center justify-center text-[20px]" aria-hidden="true">{x.icon}</span>
              <span className="flex-1 flex flex-col">
                <span className="text-[16px] font-semibold">{x.title}</span>
                <span className="text-xs text-muted">{x.hint}</span>
              </span>
              <span className="text-muted text-xl" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-muted text-center">Versión del {__APP_BUILD__}</p>
        <UpdateDiag />
        <button onClick={forceUpdate} className="min-h-10 px-3 text-xs font-semibold text-accent">Forzar actualización</button>
      </div>
    </div>
  )
}

/** Resultado de la última comprobación de versión nueva (para diagnosticar si no actualiza) */
function UpdateDiag() {
  const [d] = useState<{ at: string; ok: boolean; error?: string; probe?: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem('update-diag') ?? 'null') } catch { return null }
  })
  if (!d) return null
  const when = new Date(d.at).toLocaleString('es-ES', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <p className={`text-[11px] text-center px-4 ${d.ok ? 'text-muted' : 'text-danger'}`}>
      {d.ok ? `Comprobación de versión correcta (${when})` : `Comprobación de versión fallida (${when}): ${d.error} · sw.js: ${d.probe}`}
    </p>
  )
}

function PasswordCard() {
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
    <Card>
      <form onSubmit={changePassword} className="flex flex-col gap-4">
        <h2 className="font-bold text-[15px]">Cambiar contraseña</h2>
        <Field label="Nueva contraseña (mínimo 12 caracteres)" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <Button type="submit">Cambiar contraseña</Button>
      </form>
    </Card>
  )
}

function PushCard() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [gym, setGym] = useState(gymPushOn)

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
        <p className="text-sm text-muted">La agenda del día cada mañana, un resumen el domingo por la tarde y el fin de descanso en el gimnasio.</p>
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
            <label className="flex items-center justify-between min-h-12">
              <span className="flex flex-col">
                <span className="text-[15px]">Fin de descanso del gimnasio</span>
                <span className="text-xs text-muted">Avisa aunque la app esté en segundo plano</span>
              </span>
              <input type="checkbox" checked={gym} onChange={() => { setGymPushOn(!gym); setGym(!gym) }} className="w-5 h-5 accent-[var(--app-accent)]" />
            </label>
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
  const open = true
  const tabsOrdered = [...prefs.tabs, ...ALL_TABS.filter(t => !prefs.tabs.includes(t))]
  const secOrdered = [...prefs.home_sections, ...ALL_SECTIONS.filter(t => !prefs.home_sections.includes(t))]

  const toggleTab = (t: TabKey) => save({ tabs: prefs.tabs.includes(t) ? prefs.tabs.filter(x => x !== t) : [...prefs.tabs, t] })
  const toggleSec = (s: SectionKey) => save({ home_sections: prefs.home_sections.includes(s) ? prefs.home_sections.filter(x => x !== s) : [...prefs.home_sections, s] })

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm text-muted">Solo cambia en tu cuenta: cada adulto tiene su propia configuración.</p>
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
