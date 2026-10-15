import { useEffect, useState } from 'react'

/** Aviso cuando la sesión de Cloudflare Access ha caducado: sin ella la app no puede descargar versiones nuevas */
export default function AccessBanner() {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const on = () => setExpired(true)
    window.addEventListener('access-expired', on)
    // Tras renovar, se limpia la dirección
    if (window.location.pathname.startsWith('/renovar')) window.history.replaceState(null, '', '/')
    return () => window.removeEventListener('access-expired', on)
  }, [])

  if (!expired) return null
  return (
    <div className="fixed top-0 inset-x-0 z-40 px-4 pt-[max(env(safe-area-inset-top),8px)]">
      <div className="max-w-xl mx-auto bg-ink text-bg rounded-2xl p-3 flex items-center gap-3 shadow-lg">
        <span className="text-[13px] flex-1">Tu acceso de Cloudflare ha caducado y la app no puede actualizarse.</span>
        <button onClick={() => { window.location.href = `/renovar?t=${Date.now()}` }}
          className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold shrink-0">Renovar acceso</button>
      </div>
    </div>
  )
}
