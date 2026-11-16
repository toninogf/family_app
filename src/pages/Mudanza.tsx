import { useSearchParams } from 'react-router-dom'
import { PushNudge } from '../components/PushNudge'
import { useMudanza } from '../lib/mudanza'
import { useHousehold } from '../lib/household'
import { Card } from '../components/ui'
import Vendemos from './casa/Vendemos'
import Buscamos from './casa/Buscamos'
import Compramos from './casa/Compramos'
import Visitas from './casa/Visitas'
import { PlanCard } from './casa/Plan'
import { useCompra } from '../lib/compra'

type Vista = 'vendemos' | 'buscamos' | 'compramos' | 'visitas'

/** Pestaña «Mudanza»: búsqueda del nuevo, su compra y la venta del nuestro */
export default function Mudanza() {
  const [params, setParams] = useSearchParams()
  // Buscamos es lo que más se usa: va primero y es la vista por defecto
  const v = params.get('vista')
  const vista: Vista = v === 'vendemos' || v === 'compramos' || v === 'visitas' ? v : 'buscamos'
  const { me, members } = useHousehold()
  const m = useMudanza()
  const c = useCompra()
  // Visitas ya pasadas sin cerrar (globo en la pestaña)
  const t = new Date().toISOString().slice(0, 10)
  const toClose = m.homeVisits.filter(x => x.status === 'scheduled' && x.visit_date < t).length
    + m.visits.filter(x => (x.status === 'scheduled' && x.visit_date < t) || (x.status === 'done' && !x.interest)).length
  return (
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="text-[26px] font-bold tracking-tight">Mudanza</h1>
      <PushNudge />
      {(m.offline || m.pendingCount > 0) && (
        <div role="status" className="rounded-2xl border border-line bg-card p-3 flex items-center gap-2 text-sm">
          <span aria-hidden className="text-xl">{m.offline ? '📴' : '⏳'}</span>
          <span className="flex-1">
            {m.offline ? 'Sin conexión. ' : ''}
            {m.pendingCount > 0
              ? `${m.pendingCount} cambio${m.pendingCount === 1 ? '' : 's'} guardado${m.pendingCount === 1 ? '' : 's'} en este móvil: se enviará${m.pendingCount === 1 ? '' : 'n'} solo${m.pendingCount === 1 ? '' : 's'} al volver la red.`
              : 'Lo que cambies en las fichas se guarda en el móvil y se envía al volver la red.'}
          </span>
          {!m.offline && m.pendingCount > 0 && <button onClick={() => m.syncNow()} className="min-h-11 px-3 rounded-xl border border-line text-accent font-semibold">Enviar</button>}
        </div>
      )}
      <div role="tablist" aria-label="Sección" className="grid grid-cols-4 p-1 rounded-xl bg-card border border-line">
        {([['buscamos', 'Buscamos'], ['compramos', 'Compramos'], ['vendemos', 'Vendemos'], ['visitas', 'Agenda']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setParams(k === 'buscamos' ? {} : { vista: k }, { replace: true })}
            className={`relative min-h-10 rounded-lg text-[13px] font-semibold ${vista === k ? 'bg-accent text-white dark:text-bg' : 'text-muted'}`}>
            {l}
            {k === 'visitas' && toClose > 0 && <span className="absolute -top-1 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] leading-4" aria-label={`${toClose} por cerrar`}>{toClose}</span>}
          </button>
        ))}
      </div>
      {!me ? <p className="text-muted text-sm">Cargando…</p> : (
        <>
          {m.error && (
            <Card className="flex justify-between items-center gap-3">
              <p role="alert" className="text-danger text-sm">{m.error}</p>
              <button onClick={m.clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
            </Card>
          )}
          {c.error && (
            <Card className="flex justify-between items-center gap-3">
              <p role="alert" className="text-danger text-sm">{c.error}</p>
              <button onClick={c.clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
            </Card>
          )}
          {vista === 'visitas'
            ? <div className="flex flex-col gap-5"><PlanCard m={m} c={c} /><Visitas m={m} members={members} householdId={me.household_id} meId={me.id} /></div>
            : vista === 'vendemos'
            ? <Vendemos m={m} members={members} householdId={me.household_id} />
            : vista === 'compramos'
              ? <Compramos m={m} c={c} householdId={me.household_id} />
              : <Buscamos m={m} members={members} me={me} householdId={me.household_id} />}
        </>
      )}
    </div>
  )
}
