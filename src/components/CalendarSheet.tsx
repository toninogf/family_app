import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Sheet } from './Sheet'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar`

export default function CalendarSheet({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState<{ id: string; token: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('calendar_tokens').select('id, token').order('created_at', { ascending: false }).limit(1)
    setToken(data?.[0] ?? null)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    setError('')
    const { error } = await supabase.from('calendar_tokens').insert({})
    if (error) setError(error.message)
    await load()
  }

  async function revoke() {
    if (!token) return
    await supabase.from('calendar_tokens').delete().eq('id', token.id)
    setToken(null)
  }

  const https = token ? `${FN_URL}?token=${token.token}` : ''
  const webcal = https.replace(/^https:/, 'webcal:')

  async function copy() {
    try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setError('No se pudo copiar; mantén pulsado el enlace para copiarlo') }
  }

  return (
    <Sheet title="Actividades en tu calendario" onClose={onClose}>
      <p className="text-sm text-muted -mt-2">
        Suscríbete una vez y las actividades de los niños aparecerán en Google Calendar o en el Calendario del iPhone, con quién lleva y quién recoge. Los cambios se actualizan solos (puede tardar unas horas, según la app de calendario).
      </p>
      {loading ? <p className="text-sm text-muted">Cargando…</p> : !token ? (
        <button onClick={create} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Crear mi enlace privado</button>
      ) : (
        <div className="flex flex-col gap-3">
          <a href={webcal} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-center">Abrir en Calendario (iPhone / Mac)</a>
          <button onClick={copy} className="py-3 rounded-xl border border-line bg-card font-semibold">{copied ? 'Copiado ✓' : 'Copiar enlace'}</button>
          <details className="bg-card rounded-xl px-4 py-2 text-sm">
            <summary className="min-h-10 flex items-center font-semibold cursor-pointer">Cómo añadirlo a Google Calendar</summary>
            <ol className="list-decimal pl-5 flex flex-col gap-1 pb-2 text-muted">
              <li>Copia el enlace.</li>
              <li>En un ordenador, abre calendar.google.com.</li>
              <li>A la izquierda, junto a «Otros calendarios», pulsa <b>+</b> → <b>Desde URL</b>.</li>
              <li>Pega el enlace y pulsa <b>Añadir calendario</b>. En unos minutos aparecerá también en el móvil.</li>
            </ol>
          </details>
          <p className="text-xs text-muted break-all select-all bg-card rounded-xl p-3">{https}</p>
          <p className="text-xs text-muted">
            Este enlace es privado: quien lo tenga puede ver el horario de las actividades. No lo compartas. Si crees que alguien lo tiene, revócalo y crea uno nuevo.
          </p>
          <button onClick={revoke} className="min-h-11 text-danger text-sm font-semibold">Revocar enlace</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Sheet>
  )
}
