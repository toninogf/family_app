import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, type Member } from '../../lib/supabase'
import { aiPrompt, parseAny, type ListingData } from '../../lib/listingParse'
import { readImages } from '../../lib/ocr'
import { locateHome } from '../../lib/geo'
import { badPoints, compareSummary, monthlyCost, shortName, supplyCost } from '../../lib/compare'

// El mapa (Leaflet) solo se descarga al abrirlo
const HomesMap = lazy(() => import('./HomesMap'))
import { hhmm, longDate, relativeDay, shortDate, today } from '../../lib/dates'
import { isMapsUrl, mapsHref } from '../../lib/kids'
import {
  COOLING, FEATURES, HEATING, HOME_STATUS, HOME_STATUS_ORDER, OFFER_STATUS, VISIT_CHECKLIST,
  coverPhoto, mustHaveCheck, parsePrice, perM2, photoUrl, photoUrls, portalName, price, priceInput, priceShort,
  type CheckValue, type Cooling, type HeatingType, type Home, type HomeOffer, type HomeStatus, type HomeVisit, type Mudanza, type OfferStatus, type Photo
} from '../../lib/mudanza'
import { Card } from '../../components/ui'
import { Choice, ConfirmDelete, Fab, MultiChips, Sheet, TextArea, TextField } from '../../components/Sheet'
import { StatusPill } from './Vendemos'
import Combobox from '../../components/Combobox'
import { AdPhotoFetch, ImportDiffs, importMessage, merger, type ImportDiff } from '../../components/ListingImport'
import { MADRID_DISTRICTS, MUNICIPALITIES, PROVINCES } from '../../data/places'

type Sort = 'estado' | 'recientes' | 'precio' | 'm2'
const PROVINCE_NAMES = PROVINCES.map(p => p.name)
const municipalitiesOf = (province: string | null) => {
  const code = PROVINCES.find(p => p.name === province)?.code
  return code ? MUNICIPALITIES[code].map(x => x.name) : []
}
const ALL_MUNICIPALITIES = PROVINCES.flatMap(p => MUNICIPALITIES[p.code].map(x => x.name))

/** «En marcha» (todo menos descartados), «Todos» o un estado concreto */
type Filter = 'activos' | 'todos' | HomeStatus
const STATUS_FILTERS: HomeStatus[] = ['interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'oferta', 'descartado']

/** Número para WhatsApp: con prefijo de España si no lo trae */
const waNumber = (phone: string) => { const d = phone.replace(/\D/g, ''); return d.length === 9 ? `34${d}` : d.replace(/^00/, '') }
const nameOf = (id: string | null, members: Member[]) => (id ? members.find(x => x.id === id)?.display_name ?? '' : '')
// Admite «1.200» (miles con punto) y «95,5» (decimales con coma)
const num = (s: string) => {
  const t = s.trim().replace(/\s|m²|m2/gi, '')
  if (!t) return null
  return Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'))
}

export default function Buscamos({ m, members, householdId }: { m: Mudanza; members: Member[]; me: Member; householdId: string }) {
  const [filter, setFilter] = useState<Filter>('activos')
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editHome, setEditHome] = useState<{ open: boolean; home?: Home; initial?: Shared }>({ open: false })
  // Anuncio compartido desde la app de un portal (menú «Compartir» del móvil): abre un piso nuevo ya relleno
  const location = useLocation()
  useEffect(() => {
    const share = (location.state as { share?: Shared } | null)?.share
    if (share) { setEditHome({ open: true, initial: share }); window.history.replaceState({}, '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  // Pisos marcados para comparar (se recuerdan en este móvil)
  const [picked, setPicked] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('compare-picked') ?? '[]') } catch { return [] } })
  useEffect(() => { try { localStorage.setItem('compare-picked', JSON.stringify(picked)) } catch { /* nada */ } }, [picked])
  const pickedHomes = m.homes.filter(h => picked.includes(h.id))
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-4)))
  const [town, setTown] = useState<string>('all')
  const [minP, setMinP] = useState('')
  const [maxP, setMaxP] = useState('')
  const [sort, setSort] = useState<Sort>('estado')
  const [showFilters, setShowFilters] = useState(false)
  const t = today()
  const towns = [...new Set(m.homes.map(h => h.municipality).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))

  const list = useMemo(() => {
    const f = m.homes.filter(h =>
      filter === 'todos' ? true
        : filter === 'activos' ? h.status !== 'descartado'
          : h.status === filter)
    const lo = minP.trim() ? parsePrice(minP) : null
    const hi = maxP.trim() ? parsePrice(maxP) : null
    const g = f.filter(h =>
      (town === 'all' || (town === 'none' ? !h.municipality : h.municipality === town)) &&
      (lo == null || (h.price_cents != null && h.price_cents >= lo)) &&
      (hi == null || (h.price_cents != null && h.price_cents <= hi)))
    const nullsLast = (x: number | null) => (x == null ? Number.MAX_SAFE_INTEGER : x)
    return g.slice().sort((a, b) =>
      sort === 'recientes' ? b.created_at.localeCompare(a.created_at)
        : sort === 'precio' ? nullsLast(a.price_cents) - nullsLast(b.price_cents)
          : sort === 'm2' ? nullsLast(perM2(a)) - nullsLast(perM2(b))
              : HOME_STATUS_ORDER.indexOf(a.status) - HOME_STATUS_ORDER.indexOf(b.status))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.homes, filter, town, minP, maxP, sort])

  const nextVisits = m.homeVisits.filter(v => v.status === 'scheduled' && v.visit_date >= t)
  // Portadas de los pisos de la lista (enlaces temporales pedidos de una vez)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const coverPaths = list.map(h => coverPhoto(h, m.photos)?.path).filter((x): x is string => !!x)
  useEffect(() => {
    if (!coverPaths.length) return
    let alive = true
    photoUrls(coverPaths).then(u => { if (alive) setCovers(c => ({ ...c, ...u })) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverPaths.join()])
  const open = m.homes.find(h => h.id === openId)
  const c = m.criteria

  return (
    <div className="flex flex-col gap-5">
      {/* Qué buscamos */}
      <button onClick={() => setCriteriaOpen(true)} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1.5">
        <span className="flex justify-between items-baseline">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-sm text-accent font-semibold">Editar</span>
        </span>
        {c && (c.max_price_cents || c.min_rooms || c.min_m2 || c.zones.length || c.municipalities?.length || c.must_haves.length) ? (
          <span className="flex gap-1.5 flex-wrap">
            {c.max_price_cents && <Chip>Hasta {priceShort(c.max_price_cents)}</Chip>}
            {c.min_rooms ? <Chip>{c.min_rooms}+ hab.</Chip> : null}
            {c.min_m2 ? <Chip>{c.min_m2}+ m²</Chip> : null}
            {(c.municipalities ?? []).map(z => <Chip key={`m-${z}`}>📍 {z}</Chip>)}
            {c.zones.map(z => <Chip key={z}>{z}</Chip>)}
            {c.must_haves.map(k => <Chip key={k}>{FEATURES[k] ?? k}</Chip>)}
          </span>
        ) : <span className="text-sm text-muted">Presupuesto, zonas e imprescindibles. Cada piso marcará cuáles cumple.</span>}
      </button>

      {nextVisits.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Próximas visitas</h2>
          {nextVisits.map(v => {
            const h = m.homes.find(x => x.id === v.home_id)
            return (
              <button key={v.id} onClick={() => setOpenId(v.home_id)} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-accent">📅 {relativeDay(v.visit_date)} · {hhmm(v.start_time)}</span>
                <span className="text-[15px] font-bold break-words">{h?.title}</span>
                <span className="text-[13px] text-muted">{v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}{h?.zone ? ` · ${h.zone}` : ''}</span>
              </button>
            )
          })}
        </section>
      )}

      <div className="grid grid-cols-2 p-1 rounded-xl bg-card border border-line" role="tablist" aria-label="Vista">
        {([['lista', '☰ Lista'], ['mapa', '🗺️ Mapa']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`min-h-9 rounded-lg text-[13px] font-semibold ${view === k ? 'bg-ink text-bg' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-muted shrink-0">Estado</span>
        <select value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="Filtrar por estado"
          className="flex-1 min-w-0 w-full min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold truncate">
          {([['activos', 'En marcha (sin descartados)'], ['todos', 'Todos'], ...STATUS_FILTERS.map(st => [st, HOME_STATUS[st]])] as [Filter, string][]).map(([k, l]) => {
            const n = k === 'todos' ? m.homes.length : k === 'activos' ? m.homes.filter(h => h.status !== 'descartado').length : m.homes.filter(h => h.status === k).length
            return <option key={k} value={k}>{l} ({n})</option>
          })}
        </select>
      </label>
      <div className="flex gap-2 -mt-2">
        <button onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters} className="min-h-10 px-3 rounded-xl border border-line bg-card text-sm font-semibold">
          Filtrar y ordenar{town !== 'all' || minP || maxP || sort !== 'estado' ? ' •' : ''}
        </button>
        {(town !== 'all' || minP || maxP || sort !== 'estado') && (
          <button onClick={() => { setTown('all'); setMinP(''); setMaxP(''); setSort('estado') }} className="min-h-10 px-2 text-sm text-muted">Quitar</button>
        )}
      </div>
      {showFilters && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Localidad</span>
            <select value={town} onChange={e => setTown(e.target.value)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="all">Todas</option>
              {towns.map(x => <option key={x} value={x}>{x}</option>)}
              <option value="none">Sin localidad</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Precio desde (€)" inputMode="decimal" value={minP} onChange={e => setMinP(e.target.value)} placeholder="200.000" />
            <TextField label="Hasta (€)" inputMode="decimal" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="400.000" />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Ordenar por</span>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="estado">Estado (favoritos primero)</option>
              <option value="recientes">Guardados más recientes</option>
              <option value="precio">Precio, de menor a mayor</option>
              <option value="m2">€/m², de menor a mayor</option>
            </select>
          </label>
        </Card>
      )}
      {pickedHomes.length === 0 && m.homes.length >= 2 && (
        <p className="text-xs text-muted -mt-2">Para comparar, marca «☐ Comparar» en los pisos que quieras (hasta 4).</p>
      )}

      {m.loading ? <p className="text-sm text-muted">Cargando…</p> : list.length === 0 ? (
        <Card><p className="text-sm text-muted">{m.homes.length ? 'Nada en esta lista.' : 'Guarda aquí los pisos que os interesen con «+ Piso»: enlace del anuncio, precio y metros.'}</p></Card>
      ) : view === 'mapa' ? (
        <Suspense fallback={<p className="text-sm text-muted">Cargando mapa…</p>}>
          <HomesMap homes={list} m={m} onOpen={setOpenId} />
        </Suspense>
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map(h => {
            const cp = coverPhoto(h, m.photos)
            return <HomeCard key={h.id} h={h} m={m} cover={cp ? { url: covers[cp.path], ad: cp.kind === 'anuncio' } : null}
              onOpen={() => setOpenId(h.id)} picked={picked.includes(h.id)} onPick={() => togglePick(h.id)} />
          })}
        </div>
      )}

      {pickedHomes.length > 0 && <div className="h-16" aria-hidden="true" />}
      {pickedHomes.length > 0 && (
        // Fija justo encima del botón «+ Piso» para que no se tapen
        <div className="fixed inset-x-5 mx-auto max-w-[34rem] bottom-[calc(max(env(safe-area-inset-bottom),8px)+152px)] z-10 flex items-center gap-2 bg-ink text-bg rounded-2xl p-2 pl-4 shadow-lg">
          <span className="text-sm font-semibold flex-1">{pickedHomes.length} marcado{pickedHomes.length > 1 ? 's' : ''} para comparar</span>
          <button onClick={() => setPicked([])} className="min-h-10 px-3 text-sm opacity-80">Quitar</button>
          <button onClick={() => setCompareOpen(true)} disabled={pickedHomes.length < 2}
            className="min-h-10 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-bold disabled:opacity-40">{pickedHomes.length < 2 ? 'Marca otro' : 'Comparar'}</button>
        </div>
      )}

      <Fab label="Piso" onClick={() => setEditHome({ open: true })} />

      {open && !editHome.open && (
        <HomeSheet h={open} m={m} members={members} householdId={householdId}
          onEdit={() => setEditHome({ open: true, home: open })} onClose={() => setOpenId(null)} />
      )}
      {editHome.open && (
        <HomeEditSheet home={editHome.home} initial={editHome.initial} m={m} householdId={householdId} onClose={() => setEditHome({ open: false })}
          onCreated={() => setEditHome({ open: false })} />
      )}
      {criteriaOpen && <CriteriaSheet m={m} householdId={householdId} onClose={() => setCriteriaOpen(false)} />}
      {compareOpen && pickedHomes.length >= 2 && (
        <CompareSheet homes={pickedHomes} m={m} onRemove={id => setPicked(p => p.filter(x => x !== id))} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  )
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'bad' | 'unknown' }) {
  const cls = tone === 'ok' ? 'bg-accent-soft text-accent' : tone === 'bad' ? 'bg-danger/10 text-danger' : tone === 'unknown' ? 'bg-bg text-muted' : 'bg-bg'
  return <span className={`text-[12px] font-semibold px-2 py-1 rounded-lg ${cls}`}>{children}</span>
}

function StatusBadge({ s }: { s: HomeStatus }) {
  // «Llamar para visita» es una tarea pendiente: se resalta para que no se olvide
  const cls = s === 'favorito' || s === 'oferta' ? 'bg-accent text-white dark:text-bg' : s === 'descartado' ? 'bg-bg text-muted'
    : s === 'llamar' ? 'bg-danger text-white dark:text-bg' : 'bg-accent-soft text-accent'
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cls}`}>{s === 'favorito' ? '★ ' : s === 'llamar' ? '📞 ' : ''}{HOME_STATUS[s]}</span>
}

function HomeCard({ h, m, cover, onOpen, picked, onPick }: {
  h: Home; m: Mudanza; cover: { url?: string; ad: boolean } | null; onOpen: () => void; picked: boolean; onPick: () => void
}) {
  const checks = mustHaveCheck(h, m.criteria)
  const pm2 = perM2(h)
  const next = m.homeVisits.find(v => v.home_id === h.id && v.status === 'scheduled' && v.visit_date >= today())
  const nPhotos = m.photos.filter(p => p.home_id === h.id).length
  const maps = h.maps_url || h.address || h.municipality ? mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url }) : null
  return (
    <div className={`bg-card rounded-2xl flex flex-col overflow-hidden ${h.status === 'descartado' ? 'opacity-60' : ''}`}>
    {cover && (
      <button onClick={onOpen} aria-label={`Abrir ${h.title}`} className="block w-full aspect-[16/9] bg-bg">
        {cover.url && <img src={cover.url} alt="" loading="lazy" className={`w-full h-full object-cover ${cover.ad ? 'object-top' : ''}`} />}
      </button>
    )}
    <button onClick={onOpen} className="p-4 text-left flex flex-col gap-2">
      <span className="flex justify-between items-start gap-2">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[16px] font-bold leading-snug">{h.title}</span>
          <span className={`text-[13px] font-semibold ${h.municipality ? 'text-accent' : 'text-muted'}`}>
            📍 {h.zone ? <span className="font-normal text-muted">{h.zone} · </span> : null}{h.municipality ?? 'Sin localidad'}
          </span>
        </span>
        <StatusBadge s={h.status} />
      </span>
      <span className="text-[14px]">
        <b>{price(h.price_cents)}</b>
        <span className="text-muted">
          {[h.size_m2 && `${Number(h.size_m2)} m²`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, pm2 && `${price(pm2)}/m²`, h.rooms != null && `${h.rooms} hab.`, h.baths != null && `${h.baths} baños`].filter(Boolean).map(x => ` · ${x}`).join('')}
        </span>
      </span>
      {checks.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {checks.map(c => <Chip key={c.label} tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>)}
        </span>
      )}
      {(next || nPhotos > 0 || h.minutes_to_school != null) && (
        <span className="text-[13px] text-muted">
          {[next && `Visita ${relativeDay(next.visit_date).toLowerCase()} ${hhmm(next.start_time)}`, h.minutes_to_school != null && `${h.minutes_to_school} min al cole`, nPhotos > 0 && `${nPhotos} foto${nPhotos > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
    <div className="flex border-t border-line">
      <button type="button" onClick={onPick} aria-pressed={picked}
        className={`min-h-11 px-3 flex items-center gap-1.5 text-[13px] font-semibold shrink-0 ${picked ? 'text-accent bg-accent-soft' : 'text-muted'}`}>
        {picked ? '☑' : '☐'} Comparar
      </button>
      {h.url && (
        <a href={h.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-h-11 px-3 flex items-center gap-1.5 text-accent text-[13px] font-semibold border-l border-line min-w-0">
          🔗 <span className="truncate">{portalName(h.url) ?? 'Anuncio'}</span> ↗
        </a>
      )}
      {maps && (
        <a href={maps} target="_blank" rel="noopener noreferrer" className="flex-1 min-h-11 px-3 flex items-center gap-1.5 text-accent text-[13px] font-semibold border-l border-line min-w-0">
          📍 <span className="truncate">Cómo llegar</span> ↗
        </a>
      )}
    </div>
    </div>
  )
}

function HomeSheet({ h, m, members, householdId, onEdit, onClose }: {
  h: Home; m: Mudanza; members: Member[]; householdId: string; onEdit: () => void; onClose: () => void
}) {
  const [visitSheet, setVisitSheet] = useState<{ open: boolean; visit?: HomeVisit }>({ open: false })
  const [offerSheet, setOfferSheet] = useState<{ open: boolean; offer?: HomeOffer }>({ open: false })
  const [discarding, setDiscarding] = useState(false)
  const [reason, setReason] = useState(h.discard_reason ?? '')
  const [confirming, setConfirming] = useState(false)
  const adults = members.filter(x => x.kind === 'adult')
  const visits = m.homeVisits.filter(v => v.home_id === h.id)
  const offers = m.homeOffers.filter(o => o.home_id === h.id)
  const checks = mustHaveCheck(h, m.criteria)
  const pm2 = perM2(h)
  const maps = mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url })

  const setStatus = (status: HomeStatus, extra: Record<string, unknown> = {}) => m.write('homes', { status, ...extra }, h.id)

  if (visitSheet.open) {
    return <HomeVisitSheet home={h} visit={visitSheet.visit} adults={adults} m={m} onClose={() => setVisitSheet({ open: false })} />
  }
  if (offerSheet.open) {
    return <HomeOfferSheet home={h} offer={offerSheet.offer} m={m} onClose={() => setOfferSheet({ open: false })} />
  }

  return (
    <Sheet title={h.title} onClose={onClose}>
      <div className="flex flex-col gap-1 -mt-3">
        <span className="text-[22px] font-bold">{price(h.price_cents)}</span>
        <span className="text-sm text-muted">
          {[h.size_m2 && `${Number(h.size_m2)} m² construidos`, h.useful_m2 && `${Number(h.useful_m2)} m² útiles`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, pm2 && `${price(pm2)}/m²`, h.rooms != null && `${h.rooms} hab.`, h.baths != null && `${h.baths} baños`, h.floor && `planta ${h.floor}`, h.year_built && `de ${h.year_built}`].filter(Boolean).join(' · ')}
        </span>
        {(h.address || h.zone || h.municipality) && <span className="text-sm">{[h.address, h.zone, h.municipality, h.province].filter(Boolean).join(' · ')}</span>}
        {h.url && (
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent font-semibold underline underline-offset-2 break-all">
            {portalName(h.url)}: {h.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}{h.url.length > 70 ? '…' : ''}
          </a>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="min-h-11 px-4 rounded-xl bg-card border border-line text-accent text-sm font-semibold flex items-center">Abrir en {portalName(h.url)} ↗</a>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="min-h-11 px-4 rounded-xl bg-card border border-line text-accent text-sm font-semibold flex items-center">Cómo llegar ↗</a>}
        <button onClick={onEdit} className="min-h-11 px-4 rounded-xl bg-card border border-line text-sm font-semibold">Editar datos</button>
      </div>

      <Choice<HomeStatus> label="Estado" value={h.status} onChange={s => (s === 'descartado' ? setDiscarding(true) : setStatus(s, { discard_reason: null }))}
        options={(['interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'oferta', 'descartado'] as HomeStatus[]).map(s => ({ value: s, label: HOME_STATUS[s] }))} />
      {discarding && (
        <div className="flex flex-col gap-2 bg-card rounded-2xl p-4">
          <TextField label="¿Por qué lo descartáis?" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Ej. demasiado ruido, reforma cara" autoFocus />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDiscarding(false)} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
            <button onClick={async () => { await setStatus('descartado', { discard_reason: reason.trim() || null }); setDiscarding(false) }} className="min-h-10 px-4 rounded-lg bg-ink text-bg text-sm font-semibold">Descartar</button>
          </div>
        </div>
      )}
      {h.status === 'descartado' && h.discard_reason && <p className="text-sm text-muted -mt-3">Descartado: {h.discard_reason}</p>}

      {checks.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-bold text-[15px]">Imprescindibles</h3>
          <span className="flex gap-1 flex-wrap">
            {checks.map(c => <Chip key={c.label} tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>)}
          </span>
        </section>
      )}

      <NotesBox h={h} m={m} />

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[15px]">Visitas</h3>
          <button onClick={() => setVisitSheet({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Visita</button>
        </div>
        {visits.length === 0 ? <p className="text-sm text-muted">Sin visitas. Al apuntarla sale en la Agenda.</p> : visits.map(v => {
          const marked = Object.values(v.checklist ?? {}).filter(x => x.v).length
          const bad = Object.values(v.checklist ?? {}).filter(x => x.v === 'mal').length
          return (
            <button key={v.id} onClick={() => setVisitSheet({ open: true, visit: v })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
              <span className="flex justify-between text-[15px] font-semibold">
                <span>{longDate(v.visit_date)} · {hhmm(v.start_time)}</span>
                <span className="text-[13px] text-muted">{v.status === 'done' ? 'Hecha' : v.status === 'cancelled' ? 'Cancelada' : 'Prevista'}</span>
              </span>
              <span className="text-[13px] text-muted">
                {v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}
                {marked > 0 && ` · Revisado ${marked}/${VISIT_CHECKLIST.length}`}{bad > 0 && ` · ${bad} punto${bad > 1 ? 's' : ''} malo${bad > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
      </section>

      <Photos h={h} m={m} householdId={householdId} kind="anuncio" />
      <Photos h={h} m={m} householdId={householdId} kind="foto" />

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[15px]">Ofertas que hacemos</h3>
          <button onClick={() => setOfferSheet({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Oferta</button>
        </div>
        {offers.map(o => (
          <button key={o.id} onClick={() => setOfferSheet({ open: true, offer: o })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
            <span className="flex justify-between items-baseline gap-2">
              <span className="text-[16px] font-bold">{price(o.amount_cents)}</span>
              <StatusPill status={o.status} />
            </span>
            <span className="text-[13px] text-muted">
              {shortDate(o.offer_date)}{h.price_cents ? ` · ${Math.round((o.amount_cents / h.price_cents - 1) * 1000) / 10}% sobre el precio` : ''}
              {o.counter_cents ? ` · contraoferta ${price(o.counter_cents)}` : ''}
            </span>
          </button>
        ))}
      </section>

      {(h.contact || h.agency || h.contact_phone || h.contact_email || h.advertiser || h.listing_ref) && (
        <section className="flex flex-col gap-2 bg-card rounded-2xl p-3">
          <h3 className="font-bold text-[15px]">Contacto</h3>
          <p className="text-sm">
            {h.advertiser === 'particular' ? '🙋 Particular' : h.advertiser === 'agencia' ? '🏢 Agencia' : ''}
            {h.agency ? `${h.advertiser ? ' · ' : ''}${h.agency}` : ''}
            {h.contact ? `${h.advertiser || h.agency ? ' · ' : ''}${h.contact}` : ''}
          </p>
          {h.listing_ref && <p className="text-xs text-muted">Referencia del anuncio: {h.listing_ref}</p>}
          {(h.contact_phone || h.contact_email) && (
            <div className="flex flex-wrap gap-2">
              {h.contact_phone && (
                <>
                  <a href={`tel:${h.contact_phone.replace(/[^\d+]/g, '')}`} className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold flex items-center">📞 {h.contact_phone}</a>
                  <a href={`https://wa.me/${waNumber(h.contact_phone)}`} target="_blank" rel="noopener noreferrer" className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">WhatsApp</a>
                </>
              )}
              {h.contact_email && <a href={`mailto:${h.contact_email}`} className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">✉️ Email</a>}
            </div>
          )}
        </section>
      )}

      {(h.community_fee_cents != null || h.ibi_cents != null || supplyCost(h) != null || h.energy || h.heating_type || h.cooling || h.minutes_to_school != null || h.features.length > 0) && (
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="font-bold text-[15px]">Más datos</h3>
          {h.features.length > 0 && <p>{h.features.map(k => FEATURES[k] ?? k).join(' · ')}</p>}
          {h.community_fee_cents != null && <p>Comunidad: {price(h.community_fee_cents)}/mes</p>}
          {h.ibi_cents != null && <p>IBI: {price(h.ibi_cents)}/año</p>}
          {supplyCost(h) != null && <p>Suministros: {[h.electricity_cents != null && `luz ${price(h.electricity_cents)}`, h.water_cents != null && `agua ${price(h.water_cents)}`, h.heating_cents != null && `calefacción ${price(h.heating_cents)}`].filter(Boolean).join(' · ')} al mes</p>}
          {h.energy && <p>Certificado energético: {h.energy}</p>}
          {(h.heating_type || h.cooling) && <p>{[h.heating_type && `Calefacción: ${HEATING[h.heating_type]}`, h.cooling && `Aire: ${COOLING[h.cooling]}`].filter(Boolean).join(' · ')}</p>}
          {h.minutes_to_school != null && <p>{h.minutes_to_school} min al cole</p>}
        </section>
      )}

      <ConfirmDelete label="Eliminar piso (con sus visitas, fotos y notas)" confirming={confirming} setConfirming={setConfirming}
        onConfirm={async () => { await m.removeHome(h.id); onClose() }} />
    </Sheet>
  )
}

/** Notas y comentarios del piso: un único texto compartido, que se edita aquí mismo y se guarda solo */
function NotesBox({ h, m }: { h: Home; m: Mudanza }) {
  const [text, setText] = useState(h.notes ?? '')
  const [saved, setSaved] = useState(false)
  useEffect(() => { setText(h.notes ?? '') }, [h.notes])
  async function save() {
    if ((text.trim() || null) === (h.notes ?? null)) return
    await m.write('homes', { notes: text.trim() || null }, h.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }
  return (
    <section className="flex flex-col gap-2 bg-card rounded-2xl p-4">
      <TextArea label="Notas y comentarios" value={text} onChange={e => setText(e.target.value)} onBlur={save} maxLength={1000}
        placeholder="Lo que os ha gustado, lo que no, dudas para la próxima visita…" />
      {saved && <p role="status" className="text-xs text-accent">Guardado</p>}
    </section>
  )
}

function Photos({ h, m, householdId, kind }: { h: Home; m: Mudanza; householdId: string; kind: 'foto' | 'anuncio' }) {
  const photos = m.photos.filter(p => p.home_id === h.id && (p.kind ?? 'foto') === kind)
  const ad = kind === 'anuncio'
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<Photo | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(photos.filter(p => !urls[p.id]).map(async p => [p.id, await photoUrl(p.path)] as const)).then(pairs => {
      if (!alive || !pairs.length) return
      setUrls(u => ({ ...u, ...Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]) }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map(p => p.id).join()])

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    for (const f of Array.from(files).slice(0, 10)) await m.addPhoto(householdId, h.id, f, kind)
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">{ad ? '📸 Capturas del anuncio' : '🖼️ Fotos'}</h3>
        <label className="min-h-10 px-2 text-sm font-semibold text-accent flex items-center cursor-pointer">
          {busy ? 'Subiendo…' : ad ? '+ Capturas' : '+ Fotos'}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={e => { add(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {photos.length === 0 ? <p className="text-sm text-muted">{ad
        ? 'Guarda capturas del anuncio: así lo tenéis aunque lo borren del portal.'
        : 'Fotos del anuncio o de la visita: se guardan en privado, solo para vosotros. La primera sale de portada (en cada foto puedes elegir otra).'}</p> : (
        <div className={`grid ${ad ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5`}>
          {photos.map(p => (
            <button key={p.id} onClick={() => setView(p)} className={`${ad ? 'aspect-[9/16]' : 'aspect-square'} rounded-lg overflow-hidden bg-bg`}>
              {urls[p.id] && <img src={urls[p.id]} alt="" className={`w-full h-full ${ad ? 'object-cover object-top' : 'object-cover'}`} loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col" onClick={() => setView(null)}>
          <div className="flex justify-between p-3" onClick={e => e.stopPropagation()}>
            <button onClick={async () => { await m.removePhoto(view); setView(null) }} className="min-h-11 px-3 text-sm font-semibold text-white">{ad ? 'Borrar captura' : 'Borrar foto'}</button>
            <span className="flex items-center">
              {coverPhoto(h, m.photos)?.id === view.id
                ? <span className="min-h-11 px-3 text-sm font-semibold text-white/80 flex items-center">★ Es la portada</span>
                : <button onClick={async () => { await m.write('homes', { cover_photo_id: view.id }, h.id); setView(null) }} className="min-h-11 px-3 text-sm font-semibold text-white">☆ Poner de portada</button>}
              <button onClick={() => setView(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
            </span>
          </div>
          <div className={`flex-1 p-2 ${ad ? 'overflow-y-auto' : 'flex items-center justify-center'}`}>
            {urls[view.id] && <img src={urls[view.id]} alt="" className={ad ? 'w-full h-auto' : 'max-w-full max-h-full object-contain'} />}
          </div>
        </div>
      )}
    </section>
  )
}

function HomeVisitSheet({ home, visit, adults, m, onClose }: { home: Home; visit?: HomeVisit; adults: Member[]; m: Mudanza; onClose: () => void }) {
  const [date, setDate] = useState(visit?.visit_date ?? today())
  const [start, setStart] = useState(hhmm(visit?.start_time) || '18:00')
  const [end, setEnd] = useState(hhmm(visit?.end_time))
  const [attendee, setAttendee] = useState<string | null>(visit?.attendee_id ?? null)
  const [status, setStatus] = useState<HomeVisit['status']>(visit?.status ?? 'scheduled')
  const [checklist, setChecklist] = useState<Record<string, CheckValue>>(visit?.checklist ?? {})
  const [notes, setNotes] = useState(visit?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const setItem = (k: string, patch: Partial<CheckValue>) =>
    setChecklist(c => ({ ...c, [k]: { v: c[k]?.v ?? '', n: c[k]?.n ?? '', ...patch } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end && end <= start) { setError('La hora de fin debe ser posterior a la de inicio'); return }
    const clean = Object.fromEntries(Object.entries(checklist)
      .filter(([, x]) => x.v || x.n?.trim())
      .map(([k, x]) => [k, { v: x.v, n: (x.n ?? '').trim().slice(0, 300) }]))
    const err = await m.write('home_visits', {
      home_id: home.id, visit_date: date, start_time: start, end_time: end || null, attendee_id: attendee, status, checklist: clean, notes: notes.trim() || null
    }, visit?.id)
    if (err) { setError(err); return }
    // El piso avanza de estado solo
    if (status === 'done' && (home.status === 'interesa' || home.status === 'llamar' || home.status === 'visita_pedida')) await m.write('homes', { status: 'visitado' }, home.id)
    else if (status === 'scheduled' && (home.status === 'interesa' || home.status === 'llamar')) await m.write('homes', { status: 'visita_pedida' }, home.id)
    onClose()
  }

  return (
    <Sheet title={`Visita · ${home.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Día" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Hora" type="time" value={start} onChange={e => setStart(e.target.value)} required />
          <TextField label="Hasta" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <Choice<string | null> label="Quién va" value={attendee} onChange={setAttendee}
          options={[{ value: null, label: 'Los dos' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
        <Choice<HomeVisit['status']> label="Estado" value={status} onChange={setStatus}
          options={[{ value: 'scheduled', label: 'Prevista' }, { value: 'done', label: 'Hecha' }, { value: 'cancelled', label: 'Cancelada' }]} />

        <section className="flex flex-col gap-3 bg-card rounded-2xl p-4">
          <h3 className="font-bold text-[15px]">Qué revisar en la visita</h3>
          {VISIT_CHECKLIST.map(item => {
            const val = checklist[item.key]
            return (
              <div key={item.key} className="flex flex-col gap-1.5 border-b border-line last:border-0 pb-3 last:pb-0">
                <div className="flex justify-between items-center gap-2">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold">{item.label}</span>
                    {item.hint && <span className="text-[12px] text-muted">{item.hint}</span>}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    {(['ok', 'mal'] as const).map(v => (
                      <button type="button" key={v} aria-pressed={val?.v === v} onClick={() => setItem(item.key, { v: val?.v === v ? '' : v })}
                        className={`min-h-10 px-3 rounded-lg text-[13px] font-bold border ${val?.v === v ? (v === 'ok' ? 'bg-accent text-white dark:text-bg border-accent' : 'bg-danger text-white dark:text-bg border-danger') : 'bg-bg border-line'}`}>
                        {v === 'ok' ? 'Bien' : 'Mal'}
                      </button>
                    ))}
                  </span>
                </div>
                <input value={val?.n ?? ''} onChange={e => setItem(item.key, { n: e.target.value })} maxLength={300} placeholder="Nota…" aria-label={`Nota sobre ${item.label}`}
                  className="min-h-10 px-3 rounded-lg border border-line bg-bg text-[15px]" />
              </div>
            )
          })}
        </section>

        <TextArea label="Notas de la visita" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{visit ? 'Guardar' : 'Apuntar visita'}</button>
        {visit && <ConfirmDelete label="Eliminar visita" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('home_visits', visit.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

function HomeOfferSheet({ home, offer, m, onClose }: { home: Home; offer?: HomeOffer; m: Mudanza; onClose: () => void }) {
  const [amount, setAmount] = useState(priceInput(offer?.amount_cents))
  const [date, setDate] = useState(offer?.offer_date ?? today())
  const [deadline, setDeadline] = useState(offer?.response_deadline ?? '')
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? 'pending')
  const [counter, setCounter] = useState(priceInput(offer?.counter_cents))
  const [notes, setNotes] = useState(offer?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const cents = parsePrice(amount)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cents) { setError('Escribe el importe'); return }
    const counterCents = counter.trim() ? parsePrice(counter) : null
    if (counter.trim() && !counterCents) { setError('La contraoferta no es un importe válido'); return }
    const err = await m.write('home_offers', {
      home_id: home.id, amount_cents: cents, offer_date: date, response_deadline: deadline || null, status, counter_cents: counterCents, notes: notes.trim() || null
    }, offer?.id)
    if (err) { setError(err); return }
    if (!offer && home.status !== 'oferta') await m.write('homes', { status: 'oferta' }, home.id)
    onClose()
  }

  return (
    <Sheet title={`Oferta · ${home.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Importe que ofrecemos (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ej. 310.000" autoFocus={!offer} />
        {cents && home.price_cents && (
          <p className="text-sm text-muted -mt-3">{price(cents)} · {Math.round((cents / home.price_cents - 1) * 1000) / 10}% sobre los {price(home.price_cents)} que piden</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Fecha" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Esperamos respuesta" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <Choice<OfferStatus> label="Estado" value={status} onChange={setStatus}
          options={(Object.keys(OFFER_STATUS) as OfferStatus[]).map(k => ({ value: k, label: OFFER_STATUS[k] }))} />
        {status === 'countered' && <TextField label="Su contraoferta (€)" inputMode="decimal" value={counter} onChange={e => setCounter(e.target.value)} />}
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Condiciones, arras, plazos…" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{offer ? 'Guardar' : 'Apuntar oferta'}</button>
        {offer && <ConfirmDelete label="Eliminar oferta" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('home_offers', offer.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

type Shared = { url?: string | null; text?: string | null; files?: File[] }

function HomeEditSheet({ home, initial, m, householdId, onClose, onCreated }: {
  home?: Home; initial?: Shared; m: Mudanza; householdId: string; onClose: () => void; onCreated: () => void
}) {
  // Capturas del anuncio: se leen en el móvil para rellenar la ficha y se guardan con el piso al guardar
  const [shots, setShots] = useState<File[]>([])
  // Fotos traídas desde los enlaces que dé la IA (se guardan como fotos del piso)
  const [photoLinks, setPhotoLinks] = useState<string[]>([])
  const [diffs, setDiffs] = useState<ImportDiff[]>([])
  const [adPhotos, setAdPhotos] = useState<File[]>([])
  const [ocr, setOcr] = useState<string | null>(null)
  const [title, setTitle] = useState(home?.title ?? '')
  const [url, setUrl] = useState(home?.url ?? initial?.url ?? '')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState(false)
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [amount, setAmount] = useState(priceInput(home?.price_cents))
  const [m2, setM2] = useState(home?.size_m2 != null ? String(Number(home.size_m2)).replace('.', ',') : '')
  const [useful, setUseful] = useState(home?.useful_m2 != null ? String(Number(home.useful_m2)).replace('.', ',') : '')
  const [plot, setPlot] = useState(home?.plot_m2 != null ? String(Number(home.plot_m2)).replace('.', ',') : '')
  const [year, setYear] = useState(home?.year_built?.toString() ?? '')
  const [rooms, setRooms] = useState(home?.rooms?.toString() ?? '')
  const [baths, setBaths] = useState(home?.baths?.toString() ?? '')
  const [floor, setFloor] = useState(home?.floor ?? '')
  const [zone, setZone] = useState(home?.zone ?? '')
  const [province, setProvince] = useState<string | null>(home?.province ?? 'Madrid')
  const [municipality, setMunicipality] = useState<string | null>(home?.municipality ?? null)
  const [address, setAddress] = useState(home?.address ?? '')
  const [maps, setMaps] = useState(home?.maps_url ?? '')
  const [features, setFeatures] = useState<string[]>(home?.features ?? [])
  const [fee, setFee] = useState(priceInput(home?.community_fee_cents))
  const [ibi, setIbi] = useState(priceInput(home?.ibi_cents))
  const [power, setPower] = useState(priceInput(home?.electricity_cents))
  const [water, setWater] = useState(priceInput(home?.water_cents))
  const [heating, setHeating] = useState(priceInput(home?.heating_cents))
  const [energy, setEnergy] = useState<string | null>(home?.energy ?? null)
  const [heatType, setHeatType] = useState<HeatingType | null>(home?.heating_type ?? null)
  const [cooling, setCooling] = useState<Cooling | null>(home?.cooling ?? null)
  const [minutes, setMinutes] = useState(home?.minutes_to_school?.toString() ?? '')
  const [contact, setContact] = useState(home?.contact ?? '')
  const [advertiser, setAdvertiser] = useState<'agencia' | 'particular' | null>(home?.advertiser ?? null)
  const [agency, setAgency] = useState(home?.agency ?? '')
  const [phone, setPhone] = useState(home?.contact_phone ?? '')
  const [email, setEmail] = useState(home?.contact_email ?? '')
  const [listingRef, setListingRef] = useState(home?.listing_ref ?? '')
  const [notes, setNotes] = useState(home?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /** Rellena la ficha con lo que se haya sacado del anuncio (solo los datos encontrados) */
  /** Rellena solo lo vacío; lo que ya tenía otro valor se ofrece aparte (no se machaca) */
  function apply(d: ListingData) {
    if (d.photo_urls?.length) setPhotoLinks(l => [...new Set([...l, ...d.photo_urls!])].slice(0, 20))
    const f = merger()
    const eur = (v?: number) => (v ? priceInput(Math.round(v * 100)) : null)
    f.put('nombre', title, d.title, setTitle, { diff: false })
    f.put('precio', amount, eur(d.price_eur), setAmount)
    f.put('m²', m2, d.size_m2 ? String(d.size_m2).replace('.', ',') : null, setM2)
    f.put('m² útiles', useful, d.useful_m2 ? String(d.useful_m2).replace('.', ',') : null, setUseful)
    f.put('parcela', plot, d.plot_m2 ? String(d.plot_m2).replace('.', ',') : null, setPlot)
    f.put('año', year, d.year_built ? String(d.year_built) : null, setYear)
    f.put('habitaciones', rooms, d.rooms != null ? String(d.rooms) : null, setRooms)
    f.put('baños', baths, d.baths != null ? String(d.baths) : null, setBaths)
    f.put('planta', floor, d.floor, setFloor)
    f.put('localidad', municipality, d.municipality, v => { setProvince('Madrid'); setMunicipality(v) })
    f.put('zona', zone, d.zone?.slice(0, 60), setZone)
    f.put('dirección', address, d.address?.slice(0, 120), setAddress)
    f.put('certificado', energy, d.energy, setEnergy)
    f.put('tipo de calefacción', heatType ? HEATING[heatType] : null, d.heating_type ? HEATING[d.heating_type] : null, () => setHeatType(d.heating_type!))
    f.put('aire', cooling ? COOLING[cooling] : null, d.cooling ? COOLING[d.cooling] : null, () => setCooling(d.cooling!))
    f.put('comunidad', fee, eur(d.community_eur), setFee)
    f.put('IBI', ibi, eur(d.ibi_eur), setIbi)
    f.put('luz', power, eur(d.power_eur), setPower)
    f.put('agua', water, eur(d.water_eur), setWater)
    f.put('calefacción', heating, eur(d.heating_eur), setHeating)
    f.put('notas', notes, d.notes, setNotes, { diff: false })
    f.put('anunciante', advertiser, d.advertiser, v => setAdvertiser(v as 'agencia' | 'particular'))
    f.put('agencia', agency, d.agency?.slice(0, 120), setAgency)
    f.put('contacto', contact, d.contact?.slice(0, 120), setContact)
    f.put('teléfono', phone, d.phone?.slice(0, 30), setPhone)
    f.put('email', email, d.email?.slice(0, 120), setEmail)
    f.put('referencia', listingRef, d.ref?.slice(0, 60), setListingRef)
    // Las características solo se añaden (nunca se quita ninguna)
    const newF = (d.features ?? []).filter(x => !features.includes(x))
    if (newF.length) { setFeatures([...features, ...newF]); f.filled.push('características') }
    setDiffs(f.diffs)
    return f
  }

  function fromText(text: string, intro = 'Rellenado') {
    const r = apply(parseAny(text))
    setImportNote(importMessage(intro, r.filled, r.diffs.length))
    return r.filled
  }

  /** Intenta leer el anuncio desde el servidor; muchos portales (Idealista sobre todo) solo dejan ver la vista previa */
  async function readLink(link = url) {
    const full = link.trim() && (/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`)
    if (!full) return
    setReading(true); setImportNote(null)
    const { data, error } = await supabase.functions.invoke('listing-preview', { body: { url: full } })
    setReading(false)
    const res = data as { blocked?: boolean; error?: string; title?: string; description?: string; text?: string } | null
    if (error || !res || res.blocked || res.error) {
      setImportNote({ ok: false, text: res?.error && !res.blocked ? res.error : 'El portal no deja leer el anuncio desde la app. Pídeselo a una IA con los botones de abajo, o sube capturas.' })
      return
    }
    const got = fromText([res.title, res.description, res.text].filter(Boolean).join('\n'), 'Leído del anuncio')
    if (got.length && !got.includes('precio') && !amount.trim()) {
      setImportNote({ ok: true, text: `Leído del anuncio: ${got.join(', ')}. El portal no deja ver el resto: para el precio y la ficha completa, pídeselo a una IA con los botones de abajo.` })
    }
  }

  /** Abre ChatGPT, Gemini o Claude con la petición ya escrita (y copiada, por si la app no la recoge) */
  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude') {
    const full = url.trim() && (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
    if (!full) return
    const prompt = aiPrompt(full.replace(/\?.*$/, ''))
    try { await navigator.clipboard.writeText(prompt) } catch { /* sin permiso: se abre igualmente */ }
    const q = encodeURIComponent(prompt)
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setImportNote({ ok: true, text: ai === 'gemini'
      ? 'Petición copiada: pégala en Gemini. Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».'
      : 'Si no aparece escrita, pégala (está copiada). Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».' })
    window.open(target, '_blank', 'noopener')
  }

  /** Lee lo copiado (la respuesta de la IA o el texto del anuncio) y rellena la ficha */
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('vacío')
      setPasted(text)
      fromText(text, 'Rellenado con la respuesta')
    } catch {
      setPasteOpen(true)
      setImportNote({ ok: false, text: 'No he podido leer lo copiado. Mantén pulsado el cuadro de abajo y elige «Pegar».' })
    }
  }

  async function addShots(list: File[]) {
    const imgs = list.filter(f => f.type.startsWith('image/')).slice(0, 10 - shots.length)
    if (!imgs.length) return
    setShots(s => [...s, ...imgs])
    setImportNote(null)
    try {
      setOcr('Preparando el lector de texto…')
      const text = await readImages(imgs, p => setOcr(`Leyendo captura ${p.image} de ${p.total}… ${p.pct}%`))
      setOcr(null)
      setPasted(prev => [prev, text].filter(Boolean).join('\n'))
      fromText([pasted, text].filter(Boolean).join('\n'), 'Leído de las capturas')
    } catch {
      setOcr(null)
      setImportNote({ ok: false, text: 'No se han podido leer las capturas. Se guardarán igualmente con el piso; puedes rellenar a mano o pegar el texto.' })
    }
  }

  // Si viene de «Compartir», se rellena solo
  useEffect(() => {
    if (!initial) return
    if (initial.files?.length) void addShots(initial.files)
    if (initial.text) fromText(initial.text, 'Rellenado con lo compartido')
    // Con capturas ya está todo: no hace falta intentar leer el enlace (Idealista suele bloquearlo)
    if (initial.url && !initial.files?.length) void readLink(initial.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre para reconocerlo (ej. «3 hab. calle Mayor»)'); return }
    const priceCents = amount.trim() ? parsePrice(amount) : null
    if (amount.trim() && !priceCents) { setError('El precio no es válido'); return }
    const cleanUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : null
    if (phone.trim() && !/^[0-9 +().-]{3,30}$/.test(phone.trim())) { setError('El teléfono solo puede llevar números, espacios y +'); return }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('El email no es válido'); return }
    if (maps.trim() && !isMapsUrl(maps.trim())) { setError('El enlace de mapa debe ser de Google Maps (Compartir → Copiar enlace)'); return }
    const ints = [rooms, baths, minutes].map(x => (x.trim() ? parseInt(x, 10) : null))
    if (ints.some(x => x != null && (isNaN(x) || x < 0))) { setError('Revisa habitaciones, baños y minutos'); return }
    const size = num(m2)
    if (size != null && (isNaN(size) || size <= 0)) { setError('Los metros no son válidos'); return }
    const usefulM2 = num(useful), plotM2 = num(plot)
    if ([usefulM2, plotM2].some(x => x != null && (isNaN(x) || x <= 0))) { setError('Revisa los metros útiles y de parcela'); return }
    const yearN = year.trim() ? parseInt(year, 10) : null
    if (yearN != null && (isNaN(yearN) || yearN < 1700 || yearN > 2100)) { setError('El año de construcción no es válido'); return }
    setBusy(true); setError('')
    const data = {
      title: title.trim(), url: cleanUrl, price_cents: priceCents, size_m2: size, useful_m2: usefulM2, plot_m2: plotM2, year_built: yearN, rooms: ints[0], baths: ints[1], floor: floor.trim() || null,
      zone: zone.trim() || null, province, municipality, address: address.trim() || null, maps_url: maps.trim() || null, features,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, ibi_cents: ibi.trim() ? parsePrice(ibi) : null, energy, heating_type: heatType, cooling,
      electricity_cents: power.trim() ? parsePrice(power) : null, water_cents: water.trim() ? parsePrice(water) : null, heating_cents: heating.trim() ? parsePrice(heating) : null,
      minutes_to_school: ints[2], contact: contact.trim() || null, notes: notes.trim() || null,
      advertiser, agency: advertiser === 'particular' ? null : agency.trim() || null, contact_phone: phone.trim() || null,
      contact_email: email.trim() || null, listing_ref: listingRef.trim() || null
    }
    let homeId = home?.id
    let err: string | undefined
    if (home) err = await m.write('homes', data, home.id)
    else { const r = await m.createHome(data); err = r.error; homeId = r.id }
    // Las capturas se suben con el piso ya creado
    if (!err && homeId && shots.length) {
      setOcr(`Guardando ${shots.length} captura${shots.length === 1 ? '' : 's'}…`)
      for (const f of shots) await m.addPhoto(householdId, homeId, f, 'anuncio')
      setOcr(null)
    }
    if (!err && homeId && adPhotos.length) {
      for (const [i, f] of adPhotos.entries()) { setOcr(`Guardando fotos… ${i + 1} de ${adPhotos.length}`); await m.addPhoto(householdId, homeId, f, 'foto') }
      setOcr(null)
    }
    // Situarlo en el mapa en segundo plano (si es nuevo o ha cambiado la dirección)
    if (!err && homeId) {
      const id = homeId
      void locateHome(id, { address: data.address, zone: data.zone, municipality: data.municipality, province: data.province, maps_url: data.maps_url,
        geo_query: home?.geo_query ?? null, lat: home?.lat ?? null }).then(changed => { if (changed) void m.reload() })
    }
    setBusy(false)
    if (err) setError(err); else if (home) onClose(); else onCreated()
  }

  return (
    <Sheet title={home ? 'Editar piso' : 'Nuevo piso'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          <p className="text-sm font-bold">📥 Rellenar desde el anuncio</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <TextField label="Enlace del anuncio" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.idealista.com/inmueble/…" />
            </div>
            <button type="button" onClick={() => readLink()} disabled={!url.trim() || reading}
              className="min-h-12 px-3 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold shrink-0 disabled:opacity-40">{reading ? 'Leyendo…' : 'Leer'}</button>
          </div>
          {url.trim() && (() => {
            const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
            const portal = portalName(full)
            return portal
              ? <a href={full} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold">✓ Anuncio de {portal} · abrir ↗</a>
              : <span className="text-xs text-danger">Ese enlace no parece válido</span>
          })()}
          {url.trim() && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Que una IA lea el anuncio y te dé los datos:</span>
              <div className="grid grid-cols-3 gap-2">
                {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => askAi(k)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">{l} ↗</button>
                ))}
              </div>
              <button type="button" onClick={pasteFromClipboard} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar respuesta de la IA</button>
            </div>
          )}
          <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center gap-2 text-sm font-semibold text-accent cursor-pointer ${ocr ? 'opacity-50 pointer-events-none' : ''}`}>
            📸 {shots.length ? `Añadir más capturas (${shots.length})` : 'Subir capturas del anuncio'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { void addShots(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          </label>
          {shots.length > 0 && !ocr && <p className="text-xs text-muted">Las capturas se guardan con el piso al pulsar «Guardar», por si borran el anuncio.</p>}
          {ocr && <p role="status" className="text-xs text-muted">{ocr}</p>}
          {pasteOpen ? (
            <div className="flex flex-col gap-2">
              <TextArea label="Texto del anuncio" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={20000}
                placeholder="Pega aquí el precio, las características básicas, el edificio, el certificado…" />
              <button type="button" onClick={() => fromText(pasted)} disabled={!pasted.trim()}
                className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Rellenar con este texto</button>
            </div>
          ) : (
            <button type="button" onClick={() => setPasteOpen(true)} className="self-start min-h-10 text-sm text-accent font-semibold">📋 Pegar el texto del anuncio</button>
          )}
          <AdPhotoFetch urls={photoLinks} photos={adPhotos} onPhotos={setAdPhotos} />
          {importNote && <p role="status" className={`text-xs ${importNote.ok ? 'text-accent' : 'text-danger'}`}>{importNote.text}</p>}
          <ImportDiffs diffs={diffs} onChange={setDiffs} />
        </div>
        <TextField label="Nombre para reconocerlo" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Ático luminoso calle Mayor" autoFocus={!home} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Precio (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="320.000" />
          <TextField label="Metros (m²)" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} placeholder="95" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Parcela (m²)" inputMode="decimal" value={plot} onChange={e => setPlot(e.target.value)} placeholder="800" />
          <TextField label="Útiles (m²)" inputMode="decimal" value={useful} onChange={e => setUseful(e.target.value)} />
          <TextField label="Año constr." inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Habitaciones" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <TextField label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} />
          <TextField label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} placeholder="3º" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Provincia</span>
            <select value={province ?? ''} onChange={e => { setProvince(e.target.value || null); setMunicipality(null) }}
              className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="">—</option>
              {PROVINCE_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Combobox key={province ?? 'none'} label="Localidad" value={municipality} onChange={setMunicipality} options={municipalitiesOf(province)} placeholder="Escribe: Alcob…" />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona o barrio'}</span>
          <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'distritos-madrid' : undefined}
            placeholder={municipality === 'Madrid' ? 'Elige un distrito o escribe el barrio' : 'Ej. Casco antiguo'}
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
          {municipality === 'Madrid' && <datalist id="distritos-madrid">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
        </label>
        <TextField label="Dirección (opcional)" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} />
        <TextField label="Enlace de Google Maps (opcional)" type="url" inputMode="url" value={maps} onChange={e => setMaps(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
        <MultiChips label="Tiene" value={features} onChange={setFeatures} options={Object.entries(FEATURES).map(([value, label]) => ({ value, label }))} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Comunidad (€/mes)" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} />
          <TextField label="IBI (€/año)" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Luz (€/mes)" inputMode="decimal" value={power} onChange={e => setPower(e.target.value)} />
          <TextField label="Agua (€/mes)" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} />
          <TextField label="Calefacción (€/mes)" inputMode="decimal" value={heating} onChange={e => setHeating(e.target.value)} />
        </div>
        <p className="text-xs text-muted -mt-3">Gasto medio al mes; si es bimestral, divide la factura entre dos.</p>
        <Choice<string | null> label="Certificado energético" value={energy} onChange={setEnergy}
          options={[...'ABCDEFG'.split('').map(l => ({ value: l as string | null, label: l })), { value: null, label: '?' }]} />
        <Choice<HeatingType | null> label="Calefacción" value={heatType} onChange={setHeatType}
          options={[...(Object.keys(HEATING) as HeatingType[]).map(k => ({ value: k as HeatingType | null, label: HEATING[k] })), { value: null, label: '?' }]} />
        <Choice<Cooling | null> label="Aire acondicionado" value={cooling} onChange={setCooling}
          options={[...(['splits', 'conductos', 'aerotermia', 'si', 'no'] as Cooling[]).map(k => ({ value: k as Cooling | null, label: COOLING[k] })), { value: null, label: '?' }]} />
        <TextField label="Minutos al cole" inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Ej. 10 (andando o en coche, como lo midáis)" />
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-3">
          <legend className="text-sm font-bold px-1">Contacto del anuncio</legend>
          <Choice<'agencia' | 'particular' | null> label="¿Quién lo anuncia?" value={advertiser} onChange={setAdvertiser}
            options={[{ value: 'agencia', label: '🏢 Agencia' }, { value: 'particular', label: '🙋 Particular' }, { value: null, label: '?' }]} />
          {advertiser !== 'particular' && <TextField label="Agencia" value={agency} onChange={e => setAgency(e.target.value)} maxLength={120} placeholder="Nombre de la inmobiliaria" />}
          <TextField label="Persona de contacto" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="600 000 000" />
            <TextField label="Referencia" value={listingRef} onChange={e => setListingRef(e.target.value)} maxLength={60} placeholder="Ref. del anuncio" />
          </div>
          <TextField label="Email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} />
        </fieldset>
        <TextArea label="Notas y comentarios" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : home ? 'Guardar' : 'Guardar piso'}
        </button>
      </form>
    </Sheet>
  )
}

function CriteriaSheet({ m, householdId, onClose }: { m: Mudanza; householdId: string; onClose: () => void }) {
  const c = m.criteria
  const [max, setMax] = useState(priceInput(c?.max_price_cents))
  const [rooms, setRooms] = useState(c?.min_rooms?.toString() ?? '')
  const [m2, setM2] = useState(c?.min_m2?.toString() ?? '')
  const [zones, setZones] = useState((c?.zones ?? []).join(', '))
  const [towns, setTowns] = useState<string[]>(c?.municipalities ?? [])
  const [pick, setPick] = useState(0)
  const [must, setMust] = useState<string[]>(c?.must_haves ?? [])
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const maxCents = max.trim() ? parsePrice(max) : null
    if (max.trim() && !maxCents) { setError('El presupuesto no es válido'); return }
    const err = await m.write('search_criteria', {
      household_id: householdId, max_price_cents: maxCents,
      min_rooms: rooms.trim() ? parseInt(rooms, 10) : null, min_m2: m2.trim() ? parseInt(m2, 10) : null,
      zones: zones.split(',').map(z => z.trim()).filter(Boolean).slice(0, 15).map(z => z.slice(0, 40)), municipalities: towns, must_haves: must
    }, undefined, 'household_id')
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title="Qué buscamos" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Presupuesto máximo (€)" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="Ej. 350.000" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Habitaciones mínimas" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <TextField label="Metros mínimos" inputMode="numeric" value={m2} onChange={e => setM2(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Combobox key={pick} label="Localidades (Comunidad de Madrid)" value={null} options={ALL_MUNICIPALITIES.filter(x => !towns.includes(x))}
            onChange={v => { if (v) { setTowns(ts => (ts.includes(v) ? ts : [...ts, v])); setPick(p => p + 1) } }} placeholder="Añadir localidad…" />
          {towns.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {towns.map(x => (
                <button type="button" key={x} onClick={() => setTowns(towns.filter(y => y !== x))} className="min-h-9 px-3 rounded-full bg-ink text-bg text-[13px] font-semibold">
                  {x} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <TextField label="Zonas o barrios (separados por comas)" value={zones} onChange={e => setZones(e.target.value)} placeholder="Ej. Chamberí, Salamanca" />
        <MultiChips label="Imprescindibles" value={must} onChange={setMust} options={Object.entries(FEATURES).map(([value, label]) => ({ value, label }))} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
      </form>
    </Sheet>
  )
}

/** «**texto**» → negrita */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>
}

function CompareSheet({ homes, m, onRemove, onClose }: { homes: Home[]; m: Mudanza; onRemove: (id: string) => void; onClose: () => void }) {
  const summary = compareSummary(homes, m.criteria, m.homeVisits)
  const musts = (h: Home) => { const c = mustHaveCheck(h, m.criteria); return c.length ? c.filter(x => x.ok).length / c.length : null }
  const ENERGY = 'ABCDEFG'

  // Cada fila: cómo se muestra y, si tiene sentido, qué valor es mejor (para resaltarlo)
  type Row = { label: string; show: (h: Home) => ReactNode; value?: (h: Home) => number | null; better?: 'low' | 'high' }
  const rows: Row[] = [
    { label: 'Precio', show: h => price(h.price_cents), value: h => h.price_cents, better: 'low' },
    { label: 'm²', show: h => (h.size_m2 != null ? Number(h.size_m2) : '—'), value: h => (h.size_m2 != null ? Number(h.size_m2) : null), better: 'high' },
    { label: 'Parcela', show: h => (h.plot_m2 != null ? `${Number(h.plot_m2)} m²` : '—'), value: h => (h.plot_m2 != null ? Number(h.plot_m2) : null), better: 'high' },
    { label: 'Año', show: h => h.year_built ?? '—', value: h => h.year_built, better: 'high' },
    { label: '€/m²', show: h => price(perM2(h)), value: perM2, better: 'low' },
    { label: 'Habitaciones', show: h => h.rooms ?? '—', value: h => h.rooms, better: 'high' },
    { label: 'Baños', show: h => h.baths ?? '—', value: h => h.baths, better: 'high' },
    { label: 'Planta', show: h => h.floor ?? '—' },
    { label: 'Localidad', show: h => h.municipality ?? '—' },
    { label: 'Zona', show: h => h.zone ?? '—' },
    { label: 'Extras', show: h => (h.features.length ? h.features.map(f => FEATURES[f] ?? f).join(', ') : '—'), value: h => h.features.length, better: 'high' },
    { label: 'Imprescindibles', show: h => { const c = mustHaveCheck(h, m.criteria); return c.length ? `${c.filter(x => x.ok).length}/${c.length}` : '—' }, value: musts, better: 'high' },
    { label: 'Comunidad', show: h => (h.community_fee_cents != null ? `${price(h.community_fee_cents)}/mes` : '—'), value: h => h.community_fee_cents, better: 'low' },
    { label: 'IBI', show: h => (h.ibi_cents != null ? `${price(h.ibi_cents)}/año` : '—'), value: h => h.ibi_cents, better: 'low' },
    { label: 'Luz', show: h => (h.electricity_cents != null ? `${price(h.electricity_cents)}/mes` : '—'), value: h => h.electricity_cents, better: 'low' },
    { label: 'Agua', show: h => (h.water_cents != null ? `${price(h.water_cents)}/mes` : '—'), value: h => h.water_cents, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_cents != null ? `${price(h.heating_cents)}/mes` : '—'), value: h => h.heating_cents, better: 'low' },
    { label: 'Gastos fijos', show: h => (monthlyCost(h) != null ? `${price(monthlyCost(h))}/mes` : '—'), value: monthlyCost, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_type ? HEATING[h.heating_type] : '—'), value: () => null, better: 'high' },
    { label: 'Aire', show: h => (h.cooling ? COOLING[h.cooling] : '—'), value: () => null, better: 'high' },
    { label: 'Energía', show: h => h.energy ?? '—', value: h => (h.energy ? ENERGY.indexOf(h.energy) : null), better: 'low' },
    { label: 'Al cole', show: h => (h.minutes_to_school != null ? `${h.minutes_to_school} min` : '—'), value: h => h.minutes_to_school, better: 'low' },
    { label: 'Puntos malos', show: h => badPoints(h, m.homeVisits).length || '—', value: h => badPoints(h, m.homeVisits).length, better: 'low' }
  ]
  const isBest = (r: Row, h: Home) => {
    if (!r.value || !r.better) return false
    const vals = homes.map(r.value).filter((v): v is number => v != null)
    const v = r.value(h)
    if (v == null || vals.length < 2 || new Set(vals).size < 2) return false
    return v === (r.better === 'low' ? Math.min(...vals) : Math.max(...vals))
  }

  return (
    <Sheet title="Comparar pisos" onClose={onClose}>
      <section className="flex flex-col gap-2 bg-card rounded-2xl p-4">
        <h3 className="font-bold text-[15px]">Diferencias importantes</h3>
        {summary.length === 0
          ? <p className="text-sm text-muted">No hay diferencias destacables con los datos que tenéis. Completa precio, metros y extras para que salgan.</p>
          : <ul className="flex flex-col gap-1.5">{summary.map((t, i) => <li key={i} className="text-[14px] leading-snug"><Rich text={t} /></li>)}</ul>}
      </section>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="text-[13px] border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg text-left p-2" />
              {homes.map(h => (
                <th key={h.id} className="p-2 text-left align-bottom min-w-[120px] font-bold">
                  <span className="block">{shortName(h)}</span>
                  <button onClick={() => onRemove(h.id)} className="text-[11px] font-semibold text-muted">✕ quitar</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <th scope="row" className="sticky left-0 bg-bg text-left p-2 text-muted font-semibold border-t border-line whitespace-nowrap">{r.label}</th>
                {homes.map(h => (
                  <td key={h.id} className={`p-2 border-t border-line ${isBest(r, h) ? 'text-accent font-bold bg-accent-soft' : ''}`}>{r.show(h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">En azul, el mejor de cada fila.</p>
    </Sheet>
  )
}
