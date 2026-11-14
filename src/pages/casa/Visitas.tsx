// Pestaña «📅 Visitas» de Mudanza: las nuestras (🚗 vamos a ver casas) y las de compradores (🏠 vienen a casa), juntas por fecha.
// No guarda nada propio: cada visita se edita con su formulario de siempre y lo visto va a la ficha de la casa.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Member } from '../../lib/supabase'
import { hhmm, longDate, relativeDay, today } from '../../lib/dates'
import { HOME_STATUS, INTEREST, PREP_ITEMS, portalName, price, type BuyerVisit, type Home, type HomeVisit, type Mudanza } from '../../lib/mudanza'
import { kEur, readyPrice } from '../../lib/reforma'
import { OBJECTION_HELP } from '../../lib/venta'
import { HomeVisitSheet } from './Buscamos'
import { VisitBrief, briefCount } from './VisitBrief'
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

export default function Visitas({ m, members, householdId }: { m: Mudanza; members: Member[]; householdId: string }) {
  const navigate = useNavigate()
  const t = today()
  const adults = members.filter(x => x.kind === 'adult')
  const nameOf = (id: string | null) => members.find(x => x.id === id)?.display_name ?? null
  const [filter, setFilter] = useState<Filter>(() => { try { return (localStorage.getItem('visitas.filtro') as Filter) || 'todas' } catch { return 'todas' } })
  const setF = (f: Filter) => { setFilter(f); try { localStorage.setItem('visitas.filtro', f) } catch { /* nada */ } }
  const [showDone, setShowDone] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [homeVisit, setHomeVisit] = useState<{ home: Home; visit?: HomeVisit } | null>(null)
  const [buyerVisit, setBuyerVisit] = useState<{ visit?: BuyerVisit } | null>(null)
  // «¿Segunda visita?» que habéis dicho «ahora no» (se recuerda en este móvil)
  const [skip, setSkip] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('visitas.segunda.no') ?? '[]') } catch { return [] } })
  const skipHome = (id: string) => { const n = [...skip, id]; setSkip(n); try { localStorage.setItem('visitas.segunda.no', JSON.stringify(n)) } catch { /* nada */ } }
  const rate = (homeId: string, memberId: string, score: number) =>
    m.write('home_ratings', { home_id: homeId, member_id: memberId, household_id: householdId, score, updated_at: new Date().toISOString() }, undefined, 'home_id,member_id')

  const items: Item[] = useMemo(() => [
    ...m.homeVisits.map(v => ({ kind: 'compra' as const, id: v.id, date: v.visit_date, start: v.start_time, end: v.end_time, v, home: m.homes.find(h => h.id === v.home_id) })),
    ...m.visits.map(v => ({ kind: 'venta' as const, id: v.id, date: v.visit_date, start: v.start_time, end: v.end_time, v }))
  ].filter(it => filter === 'todas' || it.kind === filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)), [m.homeVisits, m.visits, m.homes, filter])

  // Por cerrar: previstas que ya han pasado (y de compradores, hechas sin apuntar qué le pareció)
  const toClose = items.filter(it => (it.v.status === 'scheduled' && isPast(it, t)) || (it.kind === 'venta' && it.v.status === 'done' && !it.v.interest))
  const upcoming = items.filter(it => it.v.status === 'scheduled' && !isPast(it, t))
  const rest = items.filter(it => !toClose.includes(it) && !upcoming.includes(it)).reverse()
  const done = rest.filter(it => it.v.status === 'done')
  const cancelled = rest.filter(it => it.v.status !== 'done')
  const byDay = upcoming.reduce<Record<string, Item[]>>((acc, it) => { (acc[it.date] ??= []).push(it); return acc }, {})

  const open = (it: Item) => (it.kind === 'compra' ? it.home && setHomeVisit({ home: it.home, visit: it.v }) : setBuyerVisit({ visit: it.v }))
  const openHome = (id: string, grupo?: string) => navigate(`/mudanza?piso=${id}${grupo ? `&grupo=${grupo}` : ''}`)
  // Casas que os gustaron tras verlas y sin otra visita prevista: ¿segunda visita?
  const second = filter === 'venta' ? [] : m.homes.filter(h => {
    if (skip.includes(h.id) || ['descartado', 'propuesta'].includes(h.status)) return false
    const vs = m.homeVisits.filter(v => v.home_id === h.id)
    if (!vs.some(v => v.status === 'done') || vs.some(v => v.status === 'scheduled')) return false
    const rs = m.ratings.filter(r => r.home_id === h.id)
    const avg = rs.length ? rs.reduce((a, r) => a + r.score, 0) / rs.length : null
    return h.status === 'favorito' || h.status === 'oferta' ? false : (h.status === 'interesa' || (avg != null && avg >= 4))
  })
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
          {toClose.map(it => <CloseCard key={it.id} it={it} m={m} adults={adults} rate={rate} onOpen={() => open(it)} onHome={openHome} />)}
        </section>
      )}

      {second.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">🔁 ¿Segunda visita? <span className="text-muted font-normal text-sm">· os gustaron al verlas</span></h2>
          {second.map(h => {
            const last = m.homeVisits.filter(v => v.home_id === h.id && v.status === 'done').sort((a, b) => b.visit_date.localeCompare(a.visit_date))[0]
            const pend = briefCount(h, m)
            return (
              <div key={h.id} className="rounded-2xl bg-card p-3 flex flex-col gap-1.5 border-l-4 border-accent">
                <span className="font-bold text-[15px] break-words">{h.title}</span>
                <span className="text-[12px] text-muted">{[last && `vista ${relativeDay(last.visit_date).toLowerCase()}`, pend ? `${pend} cosa${pend > 1 ? 's' : ''} por mirar o preguntar` : 'nada pendiente'].filter(Boolean).join(' · ')}</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setHomeVisit({ home: h })} className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-[13px] font-semibold">📅 Apuntar 2ª visita</button>
                  <button onClick={() => openHome(h.id, 'visita')} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold">Qué falta ›</button>
                  <button onClick={() => skipHome(h.id)} className="min-h-10 px-3 rounded-lg text-[13px] text-muted">Ahora no</button>
                </div>
              </div>
            )
          })}
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
          <button onClick={() => setShowDone(!showDone)} className="self-start text-[14px] font-semibold min-h-10">{showDone ? '▾' : '▸'} ✅ Hechas ({done.length})</button>
          {showDone && done.map(it => <VisitCard key={it.id} it={it} m={m} nameOf={nameOf} onOpen={() => open(it)} onHome={openHome} past adults={adults} rate={rate} />)}
        </section>
      )}
      {cancelled.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setShowCancelled(!showCancelled)} className="self-start text-[14px] font-semibold min-h-10 text-muted">{showCancelled ? '▾' : '▸'} Canceladas ({cancelled.length})</button>
          {showCancelled && cancelled.map(it => <VisitCard key={it.id} it={it} m={m} nameOf={nameOf} onOpen={() => open(it)} onHome={openHome} past adults={adults} rate={rate} />)}
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
type Rate = (homeId: string, memberId: string, score: number) => Promise<unknown>

function VisitCard({ it, m, nameOf, onOpen, onHome, past, adults, rate }: {
  it: Item; m: Mudanza; nameOf: (id: string | null) => string | null; onOpen: () => void; onHome: (id: string, grupo?: string) => void; past?: boolean
  adults?: Member[]; rate?: Rate
}) {
  const [prepOpen, setPrepOpen] = useState(false)
  const time = `${hhmm(it.start)}${it.end ? `–${hhmm(it.end)}` : ''}`
  const st = it.v.status === 'cancelled' ? ' · cancelada' : it.v.status === 'done' ? ' · hecha' : it.v.status === 'no_show' ? ' · no vino' : ''
  if (it.kind === 'compra') {
    const h = it.home
    const ready = h ? readyPrice(h) : null
    const maps = h ? mapsLink(h) : null
    const ad = h ? h.url ?? h.links[0]?.url ?? null : null
    // Nota media de los dos (si la habéis puesto) para ver de un vistazo cómo salió la visita
    const rs = h ? m.ratings.filter(r => r.home_id === h.id) : []
    const score = rs.length ? rs.reduce((a, r) => a + r.score, 0) / rs.length : null
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
            {ad && <a href={ad} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🔗 {portalName(ad) ?? 'Anuncio'} ↗</a>}
            {h?.contact_phone && <a href={`tel:${h.contact_phone.replace(/\s+/g, '')}`} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold flex items-center">📞 {h.agency ?? h.contact ?? 'Llamar'}</a>}
            {h && <button onClick={() => setPrepOpen(!prepOpen)} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold">🎯 Para la visita {prepOpen ? '▾' : '▸'}</button>}
            {h && <button onClick={() => onHome(h.id)} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold">Ficha ›</button>}
          </div>
        )}
        {past && h && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[12px] font-semibold">{HOME_STATUS[h.status]}</span>
            {score != null && <span className="text-[12px] text-muted">· ⭐ {score.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span>}
            {ad && <a href={ad} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🔗 {portalName(ad) ?? 'Anuncio'} ↗</a>}
            <button onClick={() => onHome(h.id)} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold">Ficha ›</button>
          </div>
        )}
        {past && h && adults && rate && it.v.status === 'done' && <Stars h={h} m={m} adults={adults} rate={rate} />}
        {prepOpen && h && <VisitBrief h={h} m={m} compact />}
      </div>
    )
  }
  const v = it.v
  const prior = previousOf(v, m.visits)
  const visits = prior.length + 1
  return (
    <div className={`rounded-2xl bg-card p-3 flex flex-col gap-1.5 border-l-4 border-[#C77A12] ${past ? 'opacity-70' : ''}`}>
      <button onClick={onOpen} className="text-left flex flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[#C77A12]">🏠 Vienen a casa · {past ? `${relativeDay(it.date)} · ` : ''}{time}{st}</span>
        <span className="font-bold text-[15px]">{v.contact_name || 'Comprador'}{visits > 1 ? <span className="text-muted font-normal text-[13px]"> · {visits}ª visita</span> : null}</span>
        <span className="text-[12px] text-muted">
          {[v.source && `vía ${v.source}`, `enseña ${nameOf(v.host_id) ?? 'cualquiera'}`, !past && `preparar la casa ${v.prep_done.length}/${PREP_ITEMS.length}`, v.interest && `interés ${INTEREST[v.interest].toLowerCase()}`].filter(Boolean).join(' · ')}
        </span>
      </button>
      {!past && prior.length > 0 && <Repeat prior={prior} />}
      {!past && v.contact_phone && (
        <div className="flex gap-1.5 flex-wrap">
          <a href={`tel:${v.contact_phone.replace(/\s+/g, '')}`} className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold flex items-center">📞 Llamar</a>
        </div>
      )}
    </div>
  )
}

/** «Por cerrar»: la visita ya pasó; un toque para apuntar cómo fue */
function CloseCard({ it, m, adults, rate, onOpen, onHome }: { it: Item; m: Mudanza; adults: Member[]; rate: Rate; onOpen: () => void; onHome: (id: string, grupo?: string) => void }) {
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
        {h && it.v.status === 'done' && <Stars h={h} m={m} adults={adults} rate={rate} />}
        {h && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => onHome(h.id, 'estado')} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold bg-card">🔍 Apuntar lo visto</button>
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

/** Nota rápida de cada uno (1–5) al cerrar la visita: la misma que usa la ficha y el comparador */
function Stars({ h, m, adults, rate }: { h: Home; m: Mudanza; adults: Member[]; rate: Rate }) {
  return (
    <div className="flex flex-col gap-1">
      {adults.map(a => {
        const cur = m.ratings.find(r => r.home_id === h.id && r.member_id === a.id)?.score ?? 0
        return (
          <div key={a.id} className="flex items-center gap-1">
            <span className="text-[12px] w-16 truncate" style={{ color: a.color }}>{a.display_name}</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => void rate(h.id, a.id, n)} aria-label={`${a.display_name}: ${n} de 5`}
                className={`w-9 h-9 text-[20px] leading-none ${n <= cur ? '' : 'opacity-25 grayscale'}`}>⭐</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Visitas anteriores del mismo comprador (por teléfono o, si no hay, por nombre) */
function previousOf(v: BuyerVisit, all: BuyerVisit[]) {
  const norm = (x: string | null) => (x ?? '').replace(/\s+/g, '').toLowerCase()
  return all.filter(x => x.id !== v.id && x.status === 'done' && (x.visit_date < v.visit_date || (x.visit_date === v.visit_date && x.start_time < v.start_time)) && (
    (v.contact_phone && norm(x.contact_phone) === norm(v.contact_phone)) || (!v.contact_phone && v.contact_name && norm(x.contact_name) === norm(v.contact_name))
  )).sort((a, b) => b.visit_date.localeCompare(a.visit_date))
}

/** Comprador que vuelve: buena señal; sus objeciones de la vez anterior con la respuesta preparada */
function Repeat({ prior }: { prior: BuyerVisit[] }) {
  const last = prior[0]
  const objs = [...new Set(prior.flatMap(p => p.objections))]
  return (
    <div className="rounded-xl bg-accent-soft p-2.5 flex flex-col gap-1">
      <span className="text-[13px] font-semibold">🔁 Vuelve ({prior.length + 1}ª visita): buena señal</span>
      <span className="text-[12px] text-muted">
        La última vez ({relativeDay(last.visit_date).toLowerCase()}){last.interest ? `: interés ${INTEREST[last.interest].toLowerCase()}` : ''}{last.liked ? ` · le gustó: ${last.liked}` : ''}
      </span>
      {objs.length > 0 && (
        <div className="flex flex-col gap-1 mt-0.5">
          <span className="text-[12px] font-semibold">Lo que le frenaba, y qué contestar:</span>
          {objs.map(o => (
            <span key={o} className="text-[12px]"><b>{o}</b>{OBJECTION_HELP[o] ? `: ${OBJECTION_HELP[o].reply}` : ''}</span>
          ))}
        </div>
      )}
    </div>
  )
}
