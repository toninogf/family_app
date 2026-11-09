import { useEffect, useState } from 'react'
import type { Home, Mudanza } from '../../lib/mudanza'
import {
  KIND_LABEL, OWN_LABEL, distLabel, nearbySchools, schoolSummary, schoolTitle, type NearSchool, type Ownership
} from '../../lib/colegios'

type Filter = 'cole' | 'secundaria' | 'infantil' | 'todos'
const FILTERS: { k: Filter; label: string; test: (s: NearSchool) => boolean }[] = [
  { k: 'cole', label: 'Primaria', test: s => s.kind === 'primaria' || s.kind === 'prim_sec' || s.kind === 'internacional' },
  { k: 'secundaria', label: 'ESO y Bach.', test: s => s.kind === 'secundaria' || s.kind === 'prim_sec' || s.kind === 'internacional' },
  { k: 'infantil', label: 'Infantil 0–3', test: s => s.kind === 'infantil' },
  { k: 'todos', label: 'Todos', test: () => true }
]
const OWN_STYLE: Record<Ownership, string> = { publico: 'bg-accent-soft text-accent', concertado: 'bg-[#C77A12]/15 text-[#C77A12]', privado: 'bg-bg text-muted' }

/** Colegios cercanos al piso (datos abiertos de la Comunidad de Madrid), buscados solos con la ubicación */
export function HomeSchools({ h, m }: { h: Home; m: Mudanza }) {
  const [list, setList] = useState<NearSchool[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('cole')
  const [own, setOwn] = useState<Ownership | null>(null)
  const [more, setMore] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (h.lat == null || h.lng == null) return
    let alive = true
    setError('')
    nearbySchools(h.lat, h.lng).then(l => { if (alive) setList(l) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'No se han podido buscar') })
    return () => { alive = false }
  }, [h.lat, h.lng])

  if (h.lat == null || h.lng == null) {
    return (
      <section className="bg-card rounded-2xl p-4 flex flex-col gap-1">
        <span className="font-bold text-[15px]">🏫 Colegios cercanos</span>
        <span className="text-[13px] text-muted">Pon la dirección o el enlace de Google Maps del piso y se buscan solos.</span>
      </section>
    )
  }
  const approx = h.geo_precision === 'zona' || h.geo_precision === 'localidad'
  const sum = list ? schoolSummary(list) : null
  const f = FILTERS.find(x => x.k === filter)!
  const shown = (list ?? []).filter(s => f.test(s) && (!own || s.ownership === own))
  const visible = more ? shown.slice(0, 40) : shown.slice(0, 6)

  async function setAsOurs(s: NearSchool) {
    const min = s.walk <= 15 ? s.walk : s.car
    const err = await m.write('homes', { minutes_to_school: min }, h.id)
    setSaved(err ? err : `Guardado: ${min} min al cole (${s.walk <= 15 ? 'andando' : 'en coche'})`)
  }

  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex justify-between items-center gap-2 text-left">
        <span className="font-bold text-[15px]">🏫 Colegios cercanos</span>
        <span className="text-[13px] font-semibold">{list ? `${sum!.near} a menos de 1,5 km` : error ? '' : 'Buscando…'} <span className="text-muted">{open ? '▾' : '▸'}</span></span>
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!open && sum && (
        <span className="text-[13px] flex flex-col gap-0.5">
          {sum.pubPri && <span>🟢 Público más cercano: <b>{schoolTitle(sum.pubPri)}</b> <span className="text-muted">· {distLabel(sum.pubPri.dist)}{sum.pubPri.bilingual ? ' · bilingüe' : ''}</span></span>}
          {sum.conc && <span>🟠 Concertado más cercano: <b>{schoolTitle(sum.conc)}</b> <span className="text-muted">· {distLabel(sum.conc.dist)}</span></span>}
          {!sum.closest && <span className="text-muted">No hay colegios a menos de 4 km.</span>}
        </span>
      )}
      {open && list && (
        <div className="flex flex-col gap-2">
          {approx && <p className="text-[12px] text-[#C77A12]">La ubicación del piso es aproximada ({h.geo_precision}): las distancias también.</p>}
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(x => (
              <button key={x.k} onClick={() => { setFilter(x.k); setMore(false) }} aria-pressed={filter === x.k}
                className={`shrink-0 min-h-9 px-3 rounded-full text-[13px] font-semibold border ${filter === x.k ? 'bg-ink text-bg border-ink' : 'border-line'}`}>{x.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(['publico', 'concertado', 'privado'] as Ownership[]).map(o => (
              <button key={o} onClick={() => setOwn(own === o ? null : o)} aria-pressed={own === o}
                className={`min-h-9 px-3 rounded-full text-[12px] font-semibold border ${own === o ? 'bg-ink text-bg border-ink' : 'border-line'}`}>{OWN_LABEL[o]}</button>
            ))}
          </div>
          {visible.length === 0 && <p className="text-[13px] text-muted">No hay de este tipo a menos de 4 km.</p>}
          {visible.map(s => (
            <div key={s.code} className="rounded-xl bg-bg p-3 flex flex-col gap-1">
              <span className="flex justify-between gap-2 items-start">
                <span className="text-[14px] font-semibold leading-snug">{schoolTitle(s)}</span>
                <span className="shrink-0 text-[13px] font-semibold">{distLabel(s.dist)}</span>
              </span>
              <span className="flex gap-1 flex-wrap items-center">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${OWN_STYLE[s.ownership]}`}>{OWN_LABEL[s.ownership]}</span>
                <span className="text-[12px] text-muted">{KIND_LABEL[s.kind]}</span>
                {s.bilingual && <span className="px-2 py-0.5 rounded-md text-[11px] bg-card">🇬🇧 {s.bilingual}</span>}
              </span>
              <span className="text-[12px] text-muted">🚶 ~{s.walk} min · 🚗 ~{s.car} min{s.municipality && s.municipality !== h.municipality ? ` · ${s.municipality}` : ''}</span>
              <span className="flex gap-1.5 flex-wrap mt-0.5">
                <a href={`https://www.google.com/maps/dir/?api=1&origin=${h.lat},${h.lng}&destination=${encodeURIComponent(`${schoolTitle(s)}, ${s.address ?? ''} ${s.municipality ?? ''}`)}`}
                  target="_blank" rel="noopener noreferrer" className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center">🗺️ Cómo llegar</a>
                {s.web && <a href={s.web.startsWith('http') ? s.web : `https://${s.web}`} target="_blank" rel="noopener noreferrer" className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center">🌐 Web</a>}
                {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center">📞 {s.phone}</a>}
                {s.kind !== 'infantil' && <button onClick={() => setAsOurs(s)} className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold">⏱️ Usar para «min al cole»</button>}
              </span>
            </div>
          ))}
          {shown.length > visible.length && <button onClick={() => setMore(true)} className="self-start min-h-10 text-sm font-semibold text-accent">Ver {shown.length - visible.length} más</button>}
          {saved && <p role="status" className="text-[13px] text-accent">{saved}</p>}
          <p className="text-[11px] text-muted">Datos abiertos de la Comunidad de Madrid (centros en activo y su programa bilingüe), actualizados cada mes. Distancias en línea recta; los minutos son aproximados. La zona de escolarización y las plazas, confírmalas con el ayuntamiento o el colegio.</p>
        </div>
      )}
    </section>
  )
}

/** Resúmenes de colegios de varios pisos (para Comparar) */
export function useSchoolSummaries(homes: Home[]) {
  const [map, setMap] = useState<Record<string, ReturnType<typeof schoolSummary>>>({})
  const key = homes.map(h => `${h.id}:${h.lat},${h.lng}`).join('|')
  useEffect(() => {
    let alive = true
    Promise.all(homes.filter(h => h.lat != null && h.lng != null).map(async h => [h.id, schoolSummary(await nearbySchools(h.lat!, h.lng!))] as const))
      .then(rows => { if (alive) setMap(Object.fromEntries(rows)) }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return map
}
