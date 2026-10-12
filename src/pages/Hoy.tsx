import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '../lib/household'
import { countPending } from '../lib/shopping'
import { Card } from '../components/ui'

function todayLabel() {
  const s = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function greeting() {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

export default function Hoy() {
  const { members, me, loading, error } = useHousehold()
  const [shopping, setShopping] = useState<{ listName: string; count: number } | null>(null)
  const kids = members.filter(m => m.kind === 'child')

  useEffect(() => { countPending().then(setShopping) }, [])

  return (
    <div className="flex flex-col gap-5">
      <header className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{todayLabel()}</p>
          <h1 className="text-[26px] font-bold tracking-tight">{greeting()}{me ? `, ${me.display_name}` : ''}</h1>
        </div>
        <Link to="/perfil" aria-label="Perfil" className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: me?.color ?? 'var(--app-accent)' }}>
          {me?.display_name.charAt(0) ?? '·'}
        </Link>
      </header>

      {error && <Card><p role="alert" className="text-danger text-sm">No se pudieron cargar los datos: {error}</p></Card>}

      {!loading && !me && !error && (
        <Card><p className="text-sm">Tu cuenta no está vinculada a ningún miembro del hogar.</p></Card>
      )}

      <Link to="/compra" className="bg-card rounded-2xl p-4 flex justify-between items-center">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Compra{shopping ? ` · ${shopping.listName}` : ''}</span>
          <span className="text-[13px] text-muted">
            {shopping == null ? 'Cargando…' : shopping.count === 0 ? 'Nada pendiente' : `${shopping.count} ${shopping.count === 1 ? 'artículo pendiente' : 'artículos pendientes'}`}
          </span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </Link>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-base font-bold">La familia</h2>
        <Card className="flex flex-wrap gap-2">
          {members.map(m => (
            <span key={m.id} className="inline-flex items-center gap-2 min-h-9 px-3 rounded-full bg-bg text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
              {m.display_name}
            </span>
          ))}
          {loading && <span className="text-muted text-sm">Cargando…</span>}
        </Card>
      </section>

      <Card className="flex flex-col gap-1">
        <p className="font-semibold">Próximamente</p>
        <p className="text-sm text-muted">
          Gastos y saldos, tareas de casa y actividades{kids.length ? ` de ${kids.map(k => k.display_name).join(' y ')}` : ' de los niños'}.
        </p>
      </Card>
    </div>
  )
}
