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
    const check = () => {
      registration.update().catch(() => {})
      // Si Cloudflare Access ha caducado, la comprobación de versión se redirige al login y la app
      // se quedaría en una versión vieja sin avisar: lo detectamos y mostramos un aviso para renovar.
      fetch('/sw.js', { cache: 'no-store', redirect: 'manual', credentials: 'include' })
        .then(r => { if (r.type === 'opaqueredirect' || r.status === 0 || r.status === 401 || r.status === 403) window.dispatchEvent(new Event('access-expired')) })
        .catch(() => {})
    }
    check()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 60 * 60 * 1000)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
