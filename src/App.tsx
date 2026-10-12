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

export default function App() {
  return (
    <AuthGate>
      <HouseholdProvider>
        <main className="max-w-xl mx-auto px-5 pt-[max(env(safe-area-inset-top),24px)] pb-28">
          <Routes>
            <Route path="/" element={<Hoy />} />
            <Route path="/compra" element={<Compra />} />
            <Route path="/casa" element={<Casa />} />
            <Route path="/ninos" element={<Ninos />} />
            <Route path="/dinero" element={<Dinero />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="*" element={<Hoy />} />
          </Routes>
        </main>
        <BottomNav />
      </HouseholdProvider>
    </AuthGate>
  )
}
