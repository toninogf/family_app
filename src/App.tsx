import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthGate from './auth/AuthGate'
import { HouseholdProvider } from './lib/household'
import BottomNav from './components/BottomNav'
import Hoy from './pages/Hoy'
import Perfil from './pages/Perfil'
import Compra from './pages/Compra'
import Dinero from './pages/Dinero'
import Tareas from './pages/Casa'
import Mudanza from './pages/Mudanza'
import Compartir from './pages/Compartir'
import Ninos from './pages/Ninos'
import Gym from './pages/Gym'
import { PrefsProvider } from './lib/prefs'
import AccessBanner from './components/AccessBanner'

export default function App() {
  return (
    <>
    <AccessBanner />
    <AuthGate>
      <HouseholdProvider>
        <PrefsProvider>
        <main className="max-w-xl mx-auto px-5 pt-[max(env(safe-area-inset-top),24px)] pb-28">
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
