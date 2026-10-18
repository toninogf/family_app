import { useSearchParams } from 'react-router-dom'
import { useMudanza } from '../lib/mudanza'
import { useHousehold } from '../lib/household'
import { Card } from '../components/ui'
import Vendemos from './casa/Vendemos'
import Buscamos from './casa/Buscamos'

type Vista = 'vendemos' | 'buscamos'

/** Pestaña «Mudanza»: venta de nuestro piso y búsqueda del nuevo */
export default function Mudanza() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = params.get('vista') === 'buscamos' ? 'buscamos' : 'vendemos'
  const { me, members } = useHousehold()
  const m = useMudanza()
  return (
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="text-[26px] font-bold tracking-tight">Mudanza</h1>
      <div role="tablist" aria-label="Sección" className="grid grid-cols-2 p-1 rounded-xl bg-card border border-line">
        {([['vendemos', 'Vendemos'], ['buscamos', 'Buscamos']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setParams(k === 'vendemos' ? {} : { vista: k }, { replace: true })}
            className={`min-h-10 rounded-lg text-[14px] font-semibold ${vista === k ? 'bg-accent text-white dark:text-bg' : 'text-muted'}`}>{l}</button>
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
          {vista === 'vendemos'
            ? <Vendemos m={m} members={members} householdId={me.household_id} />
            : <Buscamos m={m} members={members} me={me} householdId={me.household_id} />}
        </>
      )}
    </div>
  )
}
