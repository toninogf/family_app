import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Comprueba si hay versión nueva al abrir, al volver a la app y cada hora; si la hay, recarga sola
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Si falla la comprobación de versión, se mira por qué: solo si Cloudflare Access redirige al login
    // (sesión caducada) se avisa para renovar. El resultado queda en Perfil → Sesión para diagnosticar.
    let fails = 0
    const save = (d: Record<string, unknown>) => { try { localStorage.setItem('update-diag', JSON.stringify({ at: new Date().toISOString(), ...d })) } catch { /* nada */ } }
    const check = () => {
      registration.update()
        .then(() => { fails = 0; save({ ok: true }); window.dispatchEvent(new Event('access-ok')) })
        .catch(async (err: unknown) => {
          if (!navigator.onLine) return
          fails++
          if (fails < 2) { setTimeout(check, 4000); return } // un segundo intento por si fue un fallo puntual
          let probe = 'sin respuesta'
          let blocked = false
          try {
            const r = await fetch('/sw.js', { cache: 'no-store', redirect: 'manual', credentials: 'include' })
            probe = `${r.type} ${r.status}`
            blocked = r.type === 'opaqueredirect' || r.status === 401 || r.status === 403
          } catch (e) { probe = `error: ${String(e)}` }
          save({ ok: false, error: String((err as Error)?.message ?? err), probe })
          if (blocked) window.dispatchEvent(new Event('access-expired'))
        })
    }
    check()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 60 * 60 * 1000)
  }
})

// Fin de descanso del gimnasio llegado por push con la app a la vista: lo atiende el entreno;
// si no está abierto, al menos vibra
navigator.serviceWorker?.addEventListener('message', e => {
  if ((e.data as { type?: string } | null)?.type !== 'gym-rest') return
  const ev = new Event('gym-rest', { cancelable: true })
  window.dispatchEvent(ev)
  if (!ev.defaultPrevented) for (let i = 0; i < 5; i++) setTimeout(() => { try { navigator.vibrate?.(700) } catch { /* nada */ } }, i * 950)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
