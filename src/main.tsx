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
    // Si Cloudflare Access ha caducado, la descarga de la versión nueva se redirige al login y falla:
    // solo entonces (y con conexión) se avisa para renovar. Si la comprobación va bien, el aviso se quita.
    let fails = 0
    const check = () => {
      registration.update()
        .then(() => { fails = 0; window.dispatchEvent(new Event('access-ok')) })
        .catch(() => {
          if (!navigator.onLine) return
          fails++
          if (fails >= 2) window.dispatchEvent(new Event('access-expired'))
          else setTimeout(check, 4000) // un segundo intento por si fue un fallo puntual
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
