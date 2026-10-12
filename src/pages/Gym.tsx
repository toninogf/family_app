import { useState } from 'react'
import { useGym } from '../lib/gym'
import { usePrefs } from '../lib/prefs'
import { Card } from '../components/ui'
import Entrenar from './gym/Entrenar'
import Progreso from './gym/Progreso'
import Cuerpo from './gym/Cuerpo'
import Rutinas from './gym/Rutinas'

type View = 'entrenar' | 'progreso' | 'cuerpo' | 'rutinas'

/** Gimnasio: privado de cada uno (la base de datos no lo enseña a nadie más) */
export default function Gym() {
  const g = useGym()
  const { prefs } = usePrefs()
  const [view, setView] = useState<View>('entrenar')

  return (
    <div className="flex flex-col gap-4 pb-16">
      <header className="flex justify-between items-center">
        <h1 className="text-[26px] font-bold tracking-tight">Gimnasio</h1>
        <span className="text-[12px] text-muted flex items-center gap-1" title="Solo tú ves esta sección">🔒 Privado</span>
      </header>

      <div role="tablist" aria-label="Sección" className="grid grid-cols-4 p-1 rounded-xl bg-card border border-line">
        {([['entrenar', 'Entrenar'], ['progreso', 'Progreso'], ['cuerpo', 'Cuerpo'], ['rutinas', 'Rutinas']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`min-h-10 rounded-lg text-[13px] font-semibold ${view === k ? 'bg-accent text-white dark:text-bg' : 'text-muted'}`}>{l}</button>
        ))}
      </div>

      {g.error && (
        <Card className="flex justify-between items-center gap-3">
          <p role="alert" className="text-danger text-sm">{g.error}</p>
          <button onClick={g.clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
        </Card>
      )}

      {g.loading ? <p className="text-sm text-muted">Cargando…</p>
        : view === 'entrenar' ? <Entrenar g={g} gymDays={prefs.gym_days} />
          : view === 'progreso' ? <Progreso g={g} />
            : view === 'cuerpo' ? <Cuerpo g={g} />
              : <Rutinas g={g} />}
    </div>
  )
}
