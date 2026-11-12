// Pestaña «📅 Visitas» de Mudanza: las nuestras (🚗 vamos a ver casas) y las de compradores (🏠 vienen a casa), juntas por fecha.
// No guarda nada propio: cada visita se edita con su formulario de siempre y lo visto va a la ficha de la casa.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Member } from '../../lib/supabase'
import { hhmm, longDate, relativeDay, today } from '../../lib/dates'
import { INTEREST, PREP_ITEMS, mustHaveCheck, price, type BuyerVisit, type Home, type HomeVisit, type Mudanza } from '../../lib/mudanza'
import { allChecks } from '../../lib/health'
import { kEur, readyPrice } from '../../lib/reforma'
import { HomeVisitSheet } from './Buscamos'
import { VisitSheet } from './Vendemos'
import { Sheet } from '../../components/Sheet'

type Item =
  | { kind: 'compra'; id: string; date: string; start: string; end: string | null; v: HomeVisit; home: Home | undefined }
  | { kind: 'venta'; id: string; date: string; start: string; end: string | null; v: BuyerVisit }
type Filter = 'todas' | 'compra' | 'venta'

const nowHHMM = () => new Date().toTimeString().slice(0, 5)
const mins = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }
const fmtMin = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60 ? `${n % 60} min` : ''}`.trim() : `${n} min`)
/** Ya ha pasado (día anterior, o hoy con la hora de fin —o de inicio + 45 min— pasada) */
const isPast = (it: Item, t: string) => it.date < t || (it.date === t && mins(it.end ?? it.start) + (it.end ? 0 : 45) <= mins(nowHHMM()))

/** Distancia en línea recta (km) */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(x))
}
/** Tiempo en coche aproximado: carretera ≈ 1,3 × la línea recta, a ~40 km/h, + 5 min de aparcar */
const driveMin = (k: number) => Math.round((k * 1.3) / 40 * 60 + 5)

export default function Visitas({ m, members }: { m: Mudanza; members: Member[] }) {
  const navigate = useNavigate()
  const t = today()
  const adults = members.filter(x => x.kind === 'adult')
  const nameOf = (id: string | null) => members.find(x => x.id === id)?.display_name ?? null
  const [filter, setFilter] = useState<Filter>(() => { try { return (localStorage.getItem('visitas.filtro') as Filter) || 'todas' } catch { return 'todas' } })
  const setF = (f: Filter) => { setFilter(f); try { localStorage.setItem('visitas.filtro', f) } catch { /* nada */ } }
  const [showDone, setShowDone] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [homeVisit, setHomeVisit] = useState<{ home: Home; visit?: HomeVisit } | null>(null)
  const [buyerVisit, setBuyerVisit] = useState<{ visit?: BuyerVisit } | null>(null)

  const items: Item[] = useMemo(() => [
    ...m.homeVisits.map(v => ({ kind: 'compra' as const, id: v.id, date: v.visit_date, start: v.start_time, end: v.end_time, v, home: m.homes.find(h => h.id === v.home_id) })),
    ...m.visits.map(v => ({ kind: 'venta' as const, id: v.id, date: v.visit_date, start: v.start_time, end: v.end_time, v }))
  ].filter(it => filter === 'todas' || it.kind === filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)), [m.homeVisits, m.visits, m.homes, filter])

  // Por cerrar: previstas que ya han pasado (y de compradores, hechas sin apuntar qué le pareció)
  const toClose = items.filter(it => (it.v.status === 'scheduled' && isPast(it, t)) || (it.kind === 'venta' && it.v.status === 'done' && !it.v.interest))
  const upcoming = items.filter(it => it.v.status === 'scheduled' && !isPast(it, t))
  const done = items.filter(it => !toClose.includes(it) && !upcoming.includes(it)).reverse()
  const byDay = upcoming.reduce<Record<string, Item[]>>((acc, it) => { (acc[it.date] ??= []).push(it); return acc }, {})

  const open = (it: Item) => (it.kind === 'compra' ? it.home && setHomeVisit({ home: it.home, visit: it.v }) : setBuyerVisit({ visit: it.v }))
  const openHome = (id: string, grupo?: string) => navigate(`/mudanza?piso=${id}${grupo ? `&grupo=${grupo}` : ''}`)
  const counts = { compra: m.homeVisits.filter(v => v.status === 'scheduled' && v.visit_date >= t).length, venta: m.visits.filter(v => v.status === 'scheduled' && v.visit_date >= t).length }

  if (homeVisit) return <HomeVisitSheet home={homeVisit.home} visit={homeVisit.visit} adults={adults} m={m} onClose={() => setHomeVisit(null)} />
  if (buyerVisit) return <VisitSheet visit={buyerVisit.visit} adults={adults} m={m} onClose={() => setBuyerVisit(null)} />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 items-center">
        <div className="flex-1 grid grid-cols-3 p-1 rounded-xl bg-card border border-line" role="tablist" aria-label="Qué visitas">
          {([['todas', 'Todas'], ['compra', `🚗 Vamos${counts.compra ? ` · ${counts.compra}` : ''}`], ['venta', `🏠 Vienen${counts.venta ? ` · ${counts.venta}` : ''}`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setF(k)}
              className={`min-h-9 rounded-lg text-[13px] font-semibold ${filter === k ? 'bg-ink text-bg' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setNewOpen(true)} className="min-h-11 px-3 rounded-xl bg-accent text-white dark:text-bg text-sm font-bold shrink-0">+ Visita</button>
      </div>

      {toClose.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">✍️ Por cerrar <span className="text-muted font-normal text-sm">· ¿cómo fue?</span></h2>
          {toClose.map(it => <CloseCard key={it.id} it={it} m={m} onOpen={() => open(it)} onHome={openHome} />)}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">📅 Próximas</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">No hay visitas previstas.</p>}
        {Object.entries(byDay).map(([day, list]) => (
          <div key={day} className="flex flex-col gap-2">
            <h3 className="text-[14px] font-semibold">{relativeDay(day) === longDate(day) ? longDate(day) : <>{relativeDay(day)} <span className="text-muted font-normal">· {longDate(day)}</span></>}</h3>
            {list.map((it, i) => (
              <div key={it.id} className="flex flex-col gap-2">
                {i > 0 && <Gap a={list[i - 1]} b={it} />}
                <VisitCard it={it} m={m} nameOf={nameOf} onOpen={() => open(it)} onHome={openHome} />
              </div>
            ))}
            {list.length > 1 && <DayRoute list={list} m={m} />}
          </div>
        ))}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setShowDone(!showDone)} className="self-start text-[14px] font-semibold min-h-10">{showDone ? '▾' : '▸'} Hechas y canceladas ({done.length})</button>
          {showDone && done.map(it => <VisitCard key={it.id} it={it} m={m} nameOf={nameOf} onOpen={() => open(it)} onHome={openHome} past />)}
        </section>
      )}

      {newOpen && (
        <NewVisitSheet m={m} onClose={() => setNewOpen(false)}
          onCompra={h => { setNewOpen(false); setHomeVisit({ home: h }) }}
          onVenta={() => { setNewOpen(false); setBuyerVisit({}) }} />
      )}
    </div>
  )
}

/** Tarjeta de una visita: 🚗 franja azul (vamos) · 🏠 franja ámbar (vienen) */
function VisitCard({ it, m, nameOf, onOpen, onHome, past }: {
  it: Item; m: Mudanza; nameOf: (id: string | null) => string | null; onOpen: () => void; onHome: (id: string, grupo?: string) => void; past?: boolean
}) {
  const [prepOpen, setPrepOpen] = useState(false)
  const time = `${hhmm(it.start)}${it.end ? `–${hhmm(it.end)}` : ''}`
  const st = it.v.status === 'cancelled' ? ' · cancelada' : it.v.status === 'done' ? ' · hecha' : it.v.status === 'no_show' ? ' · no vino' : ''
  if (it.kind === 'compra') {
    const h = it.home
    const ready = h ? readyPrice(h) : null
    const maps = h ? mapsLink(h) : null
    return (
      <div className={`rounded-2xl bg-card p-3 flex flex-col gap-1.5 border-l-4 border-accent ${past ? 'opacity-70' : ''}`}>
        <button onClick={onOpen} className="text-left flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-accent">🚗 Vamos a ver · {past ? `${relativeDay(it.date)} · ` : ''}{time}{st}</span>
          <span className="font-bold text-[15px] break-words">{h?.title ?? 'Casa'}</span>
          <span className="text-[12px] text-muted">
            {[h?.municipality, h?.price_cents != null && price(h.price_cents), ready != null && `para entrar ${kEur(ready)}`, `va ${nameOf(it.v.attendee_id) ?? 'los dos'}`].filter(Boolean).join(' · ')}
          </span>
        </button>
        {!past && (
          <div className="flex gap-1.5 flex-wrap">
            {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold flex items-center">🗺️ Cómo llegar</a>}
            {h?.contact_phone && <a href={`tel:${h.contact_phone.replace(/\s+/g, '')}`} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold flex items-center">📞 {h.agency ?? h.contact ?? 'Llamar'}</a>}
            {h && <button onClick={() => setPrepOpen(!prepOpen)} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold">🎒 Para llevar {prepOpen ? '▾' : '▸'}</button>}
            {h && <button onClick={() => onHome(h.id)} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold">Ficha ›</button>}
          </div>
        )}
        {prepOpen && h && <ToBring h={h} m={m} />}
      </div>
    )
  }
  const v = it.v
  const visits = m.visits.filter(x => x.contact_phone && x.contact_phone === v.contact_phone && x.status !== 'cancelled').length
  return (
    <div className={`rounded-2xl bg-card p-3 flex flex-col gap-1.5 border-l-4 border-[#C77A12] ${past ? 'opacity-70' : ''}`}>
      <button onClick={onOpen} className="text-left flex flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[#C77A12]">🏠 Vienen a casa · {past ? `${relativeDay(it.date)} · ` : ''}{time}{st}</span>
        <span className="font-bold text-[15px]">{v.contact_name || 'Comprador'}{visits > 1 ? <span className="text-muted font-normal text-[13px]"> · {visits}ª visita</span> : null}</span>
        <span className="text-[12px] text-muted">
          {[v.source && `vía ${v.source}`, `enseña ${nameOf(v.host_id) ?? 'cualquiera'}`, !past && `preparar la casa ${v.prep_done.length}/${PREP_ITEMS.length}`, v.interest && `interés ${INTEREST[v.interest].toLowerCase()}`].filter(Boolean).join(' · ')}
        </span>
      </button>
      {!past && v.contact_phone && (
        <div className="flex gap-1.5 flex-wrap">
          <a href={`tel:${v.contact_phone.replace(/\s+/g, '')}`} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold flex items-center">📞 Llamar</a>
        </div>
      )}
    </div>
  )
}

/** «Por cerrar»: la visita ya pasó; un toque para apuntar cómo fue */
function CloseCard({ it, m, onOpen, onHome }: { it: Item; m: Mudanza; onOpen: () => void; onHome: (id: string, grupo?: string) => void }) {
  const when = `${relativeDay(it.date)} · ${hhmm(it.start)}`
  if (it.kind === 'compra') {
    const h = it.home
    const markDone = async () => {
      await m.write('home_visits', { status: 'done' }, it.v.id)
      if (h && ['interesa', 'llamar', 'visita_pedida'].includes(h.status)) await m.write('homes', { status: 'visitado' }, h.id)
    }
    return (
      <div className="rounded-2xl bg-accent-soft p-3 flex flex-col gap-1.5 border-l-4 border-accent">
        <span className="text-[12px] font-semibold text-accent">🚗 {when}</span>
        <span className="font-bold text-[15px] break-words">{h?.title ?? 'Casa'}</span>
        {it.v.status === 'scheduled' ? (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => void markDone()} className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-[13px] font-semibold">✅ Fuimos</button>
            <button onClick={() => void m.write('home_visits', { status: 'cancelled' }, it.v.id)} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold">No fuimos</button>
            <button onClick={onOpen} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold">Cambiar fecha</button>
          </div>
        ) : null}
        {h && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => onHome(h.id, 'docs')} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold bg-card">📋 Apuntar lo visto</button>
            <button onClick={() => onHome(h.id)} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold bg-card">👍 / 🙅 Decidir en la ficha</button>
          </div>
        )}
      </div>
    )
  }
  return (
    <button onClick={onOpen} className="rounded-2xl bg-[#C77A12]/12 p-3 text-left flex flex-col gap-0.5 border-l-4 border-[#C77A12]">
      <span className="text-[12px] font-semibold text-[#C77A12]">🏠 {when}</span>
      <span className="font-bold text-[15px]">{it.v.contact_name || 'Comprador'}</span>
      <span className="text-[13px]">¿Qué le pareció? Interés, lo que le gustó, objeciones… ›</span>
    </button>
  )
}

/** «🎒 Para llevar»: lo que conviene mirar o preguntar en esa casa (sale de su ficha; no guarda nada) */
function ToBring({ h, m }: { h: Home; m: Mudanza }) {
  const ask: string[] = []
  if (h.community_fee_cents == null) ask.push('Gastos de comunidad al mes')
  if (h.ibi_cents == null) ask.push('IBI')
  if (!h.energy) ask.push('Certificado energético')
  if (!h.year_built) ask.push('Año de construcción')
  if (h.advertiser !== 'particular' && !h.buyer_fee_kind) ask.push('¿Cobráis honorarios al comprador?')
  const checks = allChecks(h).filter(c => c.item.s !== 'ok' && !['catastro', 'inundable', 'radon', 'mercado'].includes(c.key))
  const look = checks.filter(c => c.item.s === 'unknown').map(c => c.title)
  const warn = checks.filter(c => c.item.s !== 'unknown').map(c => `${c.item.s === 'bad' ? '⛔' : '⚠️'} ${c.title}${c.item.n ? `: ${c.item.n}` : ''}`)
  const must = mustHaveCheck(h, m.criteria)
  const unsure = must.filter(c => c.ok === null).map(c => c.label)
  const viaReform = must.filter(c => c.ok === false && c.reform).map(c => `${c.label} (pedir coste: ${c.reform!.label})`)
  const block = (title: string, list: string[]) => list.length ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] font-semibold">{title}</span>
      {list.map(x => <span key={x} className="text-[12px] text-muted">· {x}</span>)}
    </div>
  ) : null
  const any = ask.length + look.length + warn.length + unsure.length + viaReform.length
  return (
    <div className="rounded-xl bg-bg p-3 flex flex-col gap-2">
      {!any && <span className="text-[12px] text-muted">Lo tenéis todo: id a disfrutar la visita.</span>}
      {block('⚠️ Ojo con', warn)}
      {block('❓ Imprescindibles por confirmar', unsure)}
      {block('🔨 Faltan y se pueden hacer', viaReform)}
      {block('🗣️ Preguntar', ask)}
      {block('👀 Mirar (Estado y documentos)', look)}
    </div>
  )
}

/** Entre dos visitas del mismo día: tiempo para llegar y si da tiempo */
function Gap({ a, b }: { a: Item; b: Item }) {
  const pa = where(a), pb = where(b)
  const free = mins(b.start) - (mins(a.end ?? a.start) + (a.end ? 0 : 45))
  const drive = pa && pb ? driveMin(km(pa, pb)) : null
  const tight = drive != null ? free < drive : free < 0
  return (
    <span className={`text-[12px] pl-3 ${tight ? 'text-danger font-semibold' : 'text-muted'}`}>
      ↓ {drive != null ? `~${fmtMin(drive)} en coche` : 'trayecto desconocido'} · {free >= 0 ? `${fmtMin(free)} libres` : 'se solapan'}{tight ? ' · ⚠️ no da tiempo' : ''}
    </span>
  )
}

/** Ruta del día en Google Maps, en el orden de las visitas */
function DayRoute({ list, m }: { list: Item[]; m: Mudanza }) {
  const stops = list.map(it => {
    const p = where(it)
    if (p) return `${p.lat},${p.lng}`
    if (it.kind === 'compra') return [it.home?.address, it.home?.zone, it.home?.municipality].filter(Boolean).join(', ') || null
    return [m.listing?.address, m.listing?.municipality].filter(Boolean).join(', ') || null
  }).filter((x): x is string => !!x)
  if (stops.length < 2) return null
  const dest = stops[stops.length - 1]
  const way = stops.slice(0, -1).join('|')
  const href = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(way)}`
  return <a href={href} target="_blank" rel="noopener noreferrer" className="self-start min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🧭 Ruta del día en Maps ↗</a>
}

/** Coordenadas de la visita: la casa a la que vamos (las de casa propia no las tenemos) */
function where(it: Item): { lat: number; lng: number } | null {
  if (it.kind === 'compra' && it.home?.lat != null && it.home?.lng != null) return { lat: Number(it.home.lat), lng: Number(it.home.lng) }
  return null
}

function mapsLink(h: Home) {
  if (h.maps_url) return h.maps_url
  if (h.lat != null && h.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`
  const q = [h.address, h.zone, h.municipality].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null
}

/** «+ Visita»: primero si vamos nosotros (a qué casa) o vienen a casa */
function NewVisitSheet({ m, onClose, onCompra, onVenta }: { m: Mudanza; onClose: () => void; onCompra: (h: Home) => void; onVenta: () => void }) {
  const [q, setQ] = useState('')
  const homes = m.homes.filter(h => !['descartado'].includes(h.status))
    .filter(h => !q.trim() || `${h.title} ${h.municipality ?? ''} ${h.zone ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Sheet title="Nueva visita" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <button onClick={onVenta} className="rounded-2xl bg-card p-4 text-left border-l-4 border-[#C77A12] flex flex-col gap-0.5">
          <span className="font-bold text-[15px]">🏠 Vienen a ver nuestra casa</span>
          <span className="text-[12px] text-muted">Un comprador o una agencia</span>
        </button>
        <div className="flex flex-col gap-2">
          <span className="font-bold text-[15px]">🚗 Vamos a ver una casa</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o localidad" className="min-h-11 px-3 rounded-xl border border-line bg-card text-[14px]" />
          <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
            {homes.map(h => (
              <button key={h.id} onClick={() => onCompra(h)} className="rounded-xl bg-card p-3 text-left border-l-4 border-accent flex flex-col">
                <span className="font-semibold text-[14px]">{h.title}</span>
                <span className="text-[12px] text-muted">{[h.municipality, h.price_cents != null && price(h.price_cents)].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {!homes.length && <span className="text-[13px] text-muted">No hay casas con ese nombre. Añádela antes en Buscamos.</span>}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

