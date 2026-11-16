import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthGate from './auth/AuthGate'
import { HouseholdProvider } from './lib/household'
import BottomNav from './components/BottomNav'
import { lazy, Suspense, type ComponentType } from 'react'
import Hoy from './pages/Hoy'
import { ErrorBoundary } from './components/ErrorBoundary'
// El resto de pantallas se cargan al abrirlas: la app arranca antes en el móvil (quedan guardadas para usar sin conexión).
// Si tras publicar una versión nueva falta el trozo antiguo, se recarga la app una vez para coger la nueva.
const page = (load: () => Promise<unknown>) => lazy(() => load().then(m => {
  try { sessionStorage.removeItem('chunk-reload') } catch { /* sin almacenamiento */ }
  return m as { default: ComponentType }
}, () => {
  try { if (!sessionStorage.getItem('chunk-reload')) { sessionStorage.setItem('chunk-reload', '1'); location.reload() } } catch { /* sin almacenamiento */ }
  return new Promise<{ default: ComponentType }>(() => {})
}))
const Perfil = page(() => import('./pages/Perfil'))
const Compra = page(() => import('./pages/Compra'))
const Dinero = page(() => import('./pages/Dinero'))
const Tareas = page(() => import('./pages/Casa'))
const Mudanza = page(() => import('./pages/Mudanza'))
const Compartir = page(() => import('./pages/Compartir'))
const Ninos = page(() => import('./pages/Ninos'))
const Gym = page(() => import('./pages/Gym'))
import { PrefsProvider } from './lib/prefs'
import AccessBanner from './components/AccessBanner'

export default function App() {
  // En pantallas grandes, Mudanza usa todo el ancho (lista + ficha); el resto, una columna cómoda de leer
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/mudanza')
  return (
    <>
    <AccessBanner />
    <AuthGate>
      <HouseholdProvider>
        <PrefsProvider>
        <main className={`max-w-xl mx-auto px-5 pt-[max(env(safe-area-inset-top),24px)] pb-28 md:max-w-3xl lg:pl-[calc(14rem+2.5rem)] lg:pr-10 lg:pb-12 ${wide ? 'lg:max-w-none' : 'lg:max-w-[calc(48rem+14rem)]'}`}>
          <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<p className="text-muted text-sm py-10 text-center">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<HomeOrShare />} />
            <Route path="/compra" element={<Compra />} />
            <Route path="/tareas" element={<Tareas />} />
            <Route path="/mudanza" element={<Mudanza />} />
            <Route path="/compartir" element={<Compartir />} />
            <Route path="/casa" element={<CasaRedirect />} />
            <Route path="/agenda" element={<Ninos />} />
            <Route path="/gym" element={<Gym />} />
            <Route path="/ninos" element={<Ninos />} />
            <Route path="/dinero" element={<Dinero />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="*" element={<Hoy />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
        <BottomNav />
      </PrefsProvider>
      </HouseholdProvider>
    </AuthGate>
    </>
  )
}

/** Enlaces antiguos a «Casa»: las tareas están en /tareas y la venta/compra en /mudanza */
function CasaRedirect() {
  const vista = new URLSearchParams(useLocation().search).get('vista')
  return <Navigate replace to={vista === 'vendemos' || vista === 'buscamos' ? `/mudanza?vista=${vista}` : '/tareas'} />
}

/** Lo compartido desde otra app también puede llegar a la portada (/?text=…&url=…): se trata como /compartir */
function HomeOrShare() {
  const p = new URLSearchParams(useLocation().search)
  return p.has('text') || p.has('url') || p.has('title') ? <Compartir /> : <Hoy />
}
