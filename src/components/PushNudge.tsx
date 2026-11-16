import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { enablePush, pushStatus, type PushStatus } from '../lib/push'

const KEY = 'push-nudge-hidden'
const hiddenUntil = () => { try { return Number(localStorage.getItem(KEY) ?? 0) } catch { return 0 } }

/** Invita a activar los avisos en este móvil (si aún no están). Se puede ocultar 2 semanas. */
export function PushNudge({ what = 'casas nuevas, bajadas de precio y visitas de mañana' }: { what?: string }) {
  const [st, setSt] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now())
  useEffect(() => { if (!hidden) pushStatus().then(setSt).catch(() => setSt(null)) }, [hidden])
  if (hidden || !st || st.state === 'on' || (st.state === 'unsupported' && st.reason === 'no-support')) return null
  const hide = () => { try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)) } catch { /* nada */ } setHidden(true) }
  async function on() {
    setBusy(true); setMsg('')
    const err = await enablePush().catch(() => 'No se pudieron activar los avisos.')
    setBusy(false)
    if (err) setMsg(err)
    else setSt(await pushStatus())
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-xl">🔔</span>
        <p className="text-sm flex-1">
          {st.state === 'unsupported'
            ? <>Para recibir avisos ({what}) en iPhone, instala la app: Compartir → «Añadir a pantalla de inicio» y ábrela desde el icono.</>
            : st.state === 'denied'
              ? <>Tienes los avisos bloqueados para esta app. Actívalos en los ajustes del teléfono para enterarte de {what}.</>
              : <>Activa los avisos en este móvil para enteraros los dos de {what}.</>}
        </p>
        <button onClick={hide} aria-label="Ocultar" className="min-w-11 min-h-11 -m-2 text-muted">✕</button>
      </div>
      {st.state === 'off' && (
        <div className="flex gap-2 items-center">
          <button onClick={on} disabled={busy} className="min-h-11 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">{busy ? 'Activando…' : 'Activar avisos'}</button>
          <Link to="/perfil" className="min-h-11 px-3 flex items-center text-sm text-muted">Elegir cuáles</Link>
        </div>
      )}
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
