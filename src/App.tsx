import { Route, Routes } from 'react-router-dom'
import AuthGate from './auth/AuthGate'
import { HouseholdProvider } from './lib/household'
import BottomNav from './components/BottomNav'
import Hoy from './pages/Hoy'
import Perfil from './pages/Perfil'
import { Card } from './components/ui'

function Pronto({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      <Card><p className="text-muted text-sm">Llega en la {phase}.</p></Card>
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <HouseholdProvider>
        <main className="max-w-xl mx-auto px-5 pt-[max(env(safe-area-inset-top),24px)] pb-28">
          <Routes>
            <Route path="/" element={<Hoy />} />
            <Route path="/compra" element={<Pronto title="Compra" phase="fase 2" />} />
            <Route path="/casa" element={<Pronto title="Casa" phase="fase 4" />} />
            <Route path="/ninos" element={<Pronto title="Niños" phase="fase 4" />} />
            <Route path="/dinero" element={<Pronto title="Dinero" phase="fase 3" />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="*" element={<Hoy />} />
          </Routes>
        </main>
        <BottomNav />
      </HouseholdProvider>
    </AuthGate>
  )
}
