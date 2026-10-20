import { useEffect, useState } from 'react'

/** Aviso cuando la sesión de Cloudflare Access ha caducado: sin ella la app no puede descargar versiones nuevas */
export default function AccessBanner() {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // Si se ha renovado o cerrado el aviso hace poco, no se vuelve a mostrar en 12 horas
    const quiet = () => { try { return Date.now() - Number(localStorage.getItem('access-banner-quiet') ?? 0) < 12 * 3600 * 1000 } catch { return false } }
    const on = () => { if (!quiet()) setExpired(true) }
    const off = () => setExpired(false)
    window.addEventListener('access-expired', on)
    window.addEventListener('access-ok', off)
    // Tras renovar, se limpia la dirección
    if (window.location.pathname.startsWith('/renovar')) {
      try { localStorage.setItem('access-banner-quiet', String(Date.now())) } catch { /* nada */ }
      window.history.replaceState(null, '', '/')
    }
    return () => { window.removeEventListener('access-expired', on); window.removeEventListener('access-ok', off) }
  }, [])

  if (!expired) return null
  return (
    <div className="fixed top-0 inset-x-0 z-40 px-4 pt-[max(env(safe-area-inset-top),8px)]">
      <div className="max-w-xl mx-auto bg-ink text-bg rounded-2xl p-3 flex items-center gap-2 shadow-lg">
        <span className="text-[13px] flex-1">Tu acceso de Cloudflare ha caducado y la app no puede actualizarse.</span>
        <button onClick={() => { window.location.href = `/renovar?t=${Date.now()}` }}
          className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold shrink-0">Renovar acceso</button>
        <button onClick={() => { try { localStorage.setItem('access-banner-quiet', String(Date.now())) } catch { /* nada */ } setExpired(false) }} aria-label="Ocultar aviso" className="min-h-10 w-8 text-lg opacity-70 shrink-0">✕</button>
      </div>
    </div>
  )
}
