import { Route, Routes } from 'react-router-dom'
import AuthGate from './auth/AuthGate'
import { HouseholdProvider } from './lib/household'
import BottomNav from './components/BottomNav'
import Hoy from './pages/Hoy'
import Perfil from './pages/Perfil'
import Compra from './pages/Compra'
import Dinero from './pages/Dinero'
import Casa from './pages/Casa'
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
            <Route path="/" element={<Hoy />} />
            <Route path="/compra" element={<Compra />} />
            <Route path="/casa" element={<Casa />} />
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
