import { useEffect, useState, type ReactNode } from 'react'
import { CRITERIA_EXTRA, FEATURE_GROUPS, FEATURES, HEATING, HOME_STATUS, type HomeStatus } from '../../lib/mudanza'
import { activeChips, EMPTY, QUICK, SORTS, type Filters, type ReformFilter, type SortKey } from '../../lib/homeFilters'
import { Sheet } from '../../components/Sheet'
import { FEATURE_ICON } from '../../components/FormKit'

const STORE = 'buscamos.filtros.v2'
const VIEWS = 'buscamos.vistas'
type View = { name: string; f: Filters; sort: SortKey }
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d } catch { return d } }
const loadArr = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') } catch { return [] } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

/** Filtros, orden y vistas guardadas (se recuerdan en este móvil) */
export function useHomeFilters() {
  const saved = load<{ f: Filters; sort: SortKey }>(STORE, { f: EMPTY, sort: 'encaje' })
  const [f, setF] = useState<Filters>({ ...EMPTY, ...saved.f })
  const [sort, setSort] = useState<SortKey>(saved.sort)
  const [views, setViews] = useState<View[]>(() => loadArr<View>(VIEWS))
  useEffect(() => save(STORE, { f, sort }), [f, sort])
  useEffect(() => save(VIEWS, views), [views])
  return { f, setF, sort, setSort, views, setViews }
}
type FilterState = ReturnType<typeof useHomeFilters>

const featureLabel = (k: string) => `${FEATURE_ICON[k] ?? ''} ${CRITERIA_EXTRA[k] ?? FEATURES[k] ?? k}`.trim()
const heatingLabel = (k: string) => HEATING[k as keyof typeof HEATING] ?? k
const same = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b)

/** Barra: estado (como antes), botón del panel y chips de lo que está activo */
export function FilterBar({ s, count, statusCount, rejected, onRejected, onOpen }: {
  s: FilterState; count: number; statusCount: (st: HomeStatus[]) => number; rejected: number; onRejected: () => void; onOpen: () => void
}) {
  const { f, setF, sort, setSort, views } = s
  // Los estados van en el desplegable: no se repiten como chips
  const chips = activeChips({ ...f, statuses: [] }, { status: st => HOME_STATUS[st], feature: featureLabel, heating: heatingLabel })
  const ALL = Object.keys(HOME_STATUS) as HomeStatus[]
  const viewOn = views.find(v => same(v.f, f) && v.sort === sort)
  const value = viewOn ? `v:${viewOn.name}` : f.statuses.length === 0 ? 'activos' : f.statuses.length === ALL.length ? 'todos' : f.statuses.length === 1 ? f.statuses[0] : 'varios'
  const pick = (v: string) => {
    if (v.startsWith('v:')) { const vw = views.find(x => `v:${x.name}` === v); if (vw) { setF(vw.f); setSort(vw.sort) } return }
    if (v === 'varios') return
    if (v === 'rechazadas') { onRejected(); return }
    setF(x => ({ ...x, statuses: v === 'activos' ? [] : v === 'todos' ? ALL : [v as HomeStatus] }))
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-muted shrink-0">Estado</span>
        <select value={value} onChange={e => pick(e.target.value)} aria-label="Filtrar por estado"
          className="flex-1 min-w-0 w-full min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold truncate">
          <option value="activos">En marcha (sin descartados ni propuestas) ({statusCount([])})</option>
          <option value="todos">Todos ({statusCount(ALL)})</option>
          {ALL.map(st => <option key={st} value={st}>{HOME_STATUS[st]} ({statusCount([st])})</option>)}
          {value === 'varios' && <option value="varios">Varios estados: {f.statuses.map(st => HOME_STATUS[st]).join(', ')}</option>}
          {views.length > 0 && (
            <optgroup label="Vistas guardadas">
              {views.map(v => <option key={v.name} value={`v:${v.name}`}>⭐ {v.name}</option>)}
            </optgroup>
          )}
          {rejected > 0 && <option value="rechazadas">🙅 Rechazadas ({rejected})</option>}
        </select>
      </label>
      <div className="flex gap-2 items-center">
        <button onClick={onOpen} className="min-h-10 px-3 rounded-xl border border-line bg-card text-sm font-semibold flex items-center gap-1.5">
          ⚙️ Filtrar y ordenar{chips.length ? <span className="px-1.5 rounded-full bg-accent text-white dark:text-bg text-[11px]">{chips.length}</span> : null}
        </button>
        <span className="text-[12px] text-muted flex-1 min-w-0 truncate">{count} piso{count === 1 ? '' : 's'} · {SORTS.find(x => x.k === sort)?.label.split(' (')[0]}</span>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {chips.map(c => (
            <button key={c.label} onClick={() => setF(x => c.clear(x))} className="min-h-8 px-2.5 rounded-full bg-accent-soft text-accent text-[12px] font-semibold">{c.label} ✕</button>
          ))}
          <button onClick={() => setF(x => ({ ...EMPTY, statuses: x.statuses }))} className="min-h-8 px-2 text-[12px] text-muted">Limpiar</button>
        </div>
      )}
    </div>
  )
}

/** Panel completo, con el número de pisos en vivo */
export function FilterSheet({ s, towns, ours, countFor, onClose }: {
  s: FilterState; towns: string[]; ours: string[]; countFor: (f: Filters) => number; onClose: () => void
}) {
  const [d, setD] = useState<Filters>(s.f)
  const [sort, setSort] = useState<SortKey>(s.sort)
  const [viewName, setViewName] = useState('')
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setD(x => ({ ...x, [k]: v }))
  const tog = <K extends 'statuses' | 'towns' | 'features' | 'reform' | 'heating'>(k: K, v: Filters[K][number]) =>
    setD(x => { const arr = x[k] as string[]; return { ...x, [k]: arr.includes(v as string) ? arr.filter(y => y !== v) : [...arr, v] } })
  const n = countFor(d)
  const chip = (on: boolean) => `min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`
  const apply = () => { s.setF(d); s.setSort(sort); onClose() }

  return (
    <Sheet title="Filtrar y ordenar" onClose={onClose}>
      <div className="flex flex-col gap-5 pb-2">
        <Block title="Ordenar por">
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
            {SORTS.map(x => <option key={x.k} value={x.k}>{x.label}</option>)}
          </select>
        </Block>

        <Block title="Atajos">
          <Chips>{QUICK.map(q => <button key={q.k} type="button" onClick={() => setD(x => ({ ...x, quick: x.quick.includes(q.k) ? x.quick.filter(y => y !== q.k) : [...x.quick, q.k] }))} aria-pressed={d.quick.includes(q.k)} className={chip(d.quick.includes(q.k))}>{q.label}</button>)}</Chips>
        </Block>

        <Block title="Estado" hint="Sin marcar ninguno: «En marcha» (todo menos descartados y propuestas).">
          <Chips>{(Object.keys(HOME_STATUS) as HomeStatus[]).map(st => <button key={st} type="button" onClick={() => tog('statuses', st)} aria-pressed={d.statuses.includes(st)} className={chip(d.statuses.includes(st))}>{HOME_STATUS[st]}</button>)}</Chips>
        </Block>

        <Block title="Dónde">
          <Chips>
            {towns.map(t => <button key={t} type="button" onClick={() => tog('towns', t)} aria-pressed={d.towns.includes(t)} className={chip(d.towns.includes(t))}>📍 {t}</button>)}
            {ours.length > 0 && <button type="button" onClick={() => set('outside', !d.outside)} aria-pressed={d.outside} className={chip(d.outside)}>Fuera de vuestras localidades</button>}
          </Chips>
        </Block>

        <Block title="Precio (€)">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Piden desde" v={d.askMin} on={v => set('askMin', v)} />
            <Num label="Piden hasta" v={d.askMax} on={v => set('askMax', v)} />
            <Num label="Para entrar desde" v={d.readyMin} on={v => set('readyMin', v)} />
            <Num label="Para entrar hasta" v={d.readyMax} on={v => set('readyMax', v)} />
          </div>
        </Block>

        <Block title="Tamaño">
          <div className="grid grid-cols-2 gap-2">
            <Num label="m² mínimos" v={d.minM2} on={v => set('minM2', v)} />
            <Num label="Parcela mínima (m²)" v={d.minPlot} on={v => set('minPlot', v)} />
            <Num label="Habitaciones mín." v={d.minRooms} on={v => set('minRooms', v)} />
            <Num label="Baños mín." v={d.minBaths} on={v => set('minBaths', v)} />
          </div>
        </Block>

        <Block title="Lo que buscamos">
          <Chips>
            {([['da_igual', 'Da igual'], ['todos', '🎯 Todos los imprescindibles'], ['falla1', 'Falla 1 como mucho']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set('musts', k)} aria-pressed={d.musts === k} className={chip(d.musts === k)}>{l}</button>
            ))}
          </Chips>
          <label className="flex items-center gap-2 text-[14px] min-h-10">
            <input type="checkbox" checked={d.reformCounts} onChange={e => set('reformCounts', e.target.checked)} className="w-5 h-5" />
            <span>Contar lo que se consigue con reforma (🔨) como cumplido</span>
          </label>
          <Num label="⭐ Mínimo de lo que valoramos" v={d.minNice} on={v => set('minNice', v)} />
        </Block>

        <Block title="Extras que tiene que tener">
          {FEATURE_GROUPS.map(g => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">{g.title}</span>
              <Chips>{(g.title.startsWith('🏊') ? ['piscina_cualquiera', ...g.keys] : g.keys).map(k => <button key={k} type="button" onClick={() => tog('features', k)} aria-pressed={d.features.includes(k)} className={chip(d.features.includes(k))}>{featureLabel(k)}</button>)}</Chips>
            </div>
          ))}
        </Block>

        <Block title="Reforma">
          <Chips>
            {([['listo', '✅ Para entrar a vivir'], ['lavado', '🖌️ Lavado de cara'], ['parcial', '🔨 Parcial'], ['integral', '🏗️ Integral'], ['sin', '¿? Sin valorar']] as [ReformFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => tog('reform', k)} aria-pressed={d.reform.includes(k)} className={chip(d.reform.includes(k))}>{l}</button>
            ))}
          </Chips>
          <Num label="Reforma máxima (€)" v={d.reformMax} on={v => set('reformMax', v)} />
        </Block>

        <Block title="Estado y riesgos">
          <Chips>
            {([['da_igual', 'Da igual'], ['ok', '✅ Sin problemas'], ['avisos', '⚠️ Con avisos'], ['sin_revisar', '❔ Sin revisar']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set('risk', k)} aria-pressed={d.risk === k} className={chip(d.risk === k)}>{l}</button>
            ))}
          </Chips>
        </Block>

        <Block title="Colegios" hint="Colegio público de primaria más cercano (necesita la ubicación del piso).">
          <Chips>
            {[null, 1, 2, 3].map(km => <button key={String(km)} type="button" onClick={() => set('schoolKm', km)} aria-pressed={d.schoolKm === km} className={chip(d.schoolKm === km)}>{km == null ? 'Da igual' : `≤ ${km} km`}</button>)}
          </Chips>
          {d.schoolKm != null && (
            <label className="flex items-center gap-2 text-[14px] min-h-10">
              <input type="checkbox" checked={d.schoolBilingual} onChange={e => set('schoolBilingual', e.target.checked)} className="w-5 h-5" />
              <span>Que sea bilingüe</span>
            </label>
          )}
        </Block>

        <Block title="Energía">
          <Chips>{Object.entries(HEATING).map(([k, l]) => <button key={k} type="button" onClick={() => tog('heating', k)} aria-pressed={d.heating.includes(k)} className={chip(d.heating.includes(k))}>{l}</button>)}</Chips>
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-muted">Certificado mínimo</span>
            <select value={d.energyMin ?? ''} onChange={e => set('energyMin', e.target.value || null)} className="min-h-10 px-2 rounded-lg border border-line bg-card text-[15px]">
              <option value="">Da igual</option>
              {'ABCDEFG'.split('').map(x => <option key={x} value={x}>{x} o mejor</option>)}
            </select>
          </label>
        </Block>

        <Block title="Origen">
          <Chips>
            {([['da_igual', 'Da igual'], ['ia', '🤖 Propuestos por la búsqueda'], ['nuestros', '🙋 Metidos por nosotros']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set('origin', k)} aria-pressed={d.origin === k} className={chip(d.origin === k)}>{l}</button>
            ))}
          </Chips>
        </Block>

        <Block title="Vistas guardadas" hint="Guarda esta combinación de filtros y orden con un nombre: saldrá como atajo arriba.">
          <div className="flex gap-2">
            <input value={viewName} onChange={e => setViewName(e.target.value.slice(0, 24))} placeholder="Ej. Para visitar" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[16px]" />
            <button type="button" disabled={!viewName.trim()} onClick={() => { const name = viewName.trim(); s.setViews(v => [...v.filter(x => x.name !== name), { name, f: d, sort }].slice(-8)); setViewName('') }}
              className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">Guardar</button>
          </div>
          {s.views.length > 0 && (
            <Chips>{s.views.map(v => (
              <span key={v.name} className="min-h-9 pl-3 pr-1 rounded-full border border-line bg-card text-[13px] font-semibold flex items-center gap-1">
                ⭐ {v.name}
                <button type="button" onClick={() => s.setViews(x => x.filter(y => y.name !== v.name))} aria-label={`Borrar la vista ${v.name}`} className="w-8 h-8 text-muted">✕</button>
              </span>
            ))}</Chips>
          )}
        </Block>

        <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 bg-bg border-t border-line flex gap-2">
          <button type="button" onClick={() => { setD(EMPTY); setSort('encaje') }} className="min-h-12 px-4 rounded-xl border border-line text-sm font-semibold">Limpiar</button>
          <button type="button" onClick={apply} className="flex-1 min-h-12 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Ver {n} piso{n === 1 ? '' : 's'}</button>
        </div>
      </div>
    </Sheet>
  )
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-bold text-[15px]">{title}</h3>
      {hint && <p className="text-[12px] text-muted -mt-1">{hint}</p>}
      {children}
    </section>
  )
}
const Chips = ({ children }: { children: ReactNode }) => <div className="flex gap-1.5 flex-wrap">{children}</div>

/** Campo numérico (admite «650.000») */
function Num({ label, v, on }: { label: string; v: number | null; on: (v: number | null) => void }) {
  const [t, setT] = useState(v == null ? '' : v.toLocaleString('es-ES'))
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[12px] font-medium text-muted truncate">{label}</span>
      <input inputMode="numeric" value={t}
        onChange={e => { const x = e.target.value; setT(x); const n = Number(x.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')); on(x.trim() && Number.isFinite(n) ? n : null) }}
        className="min-h-11 px-3 rounded-xl border border-line bg-card text-[16px]" />
    </label>
  )
}
