import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, type Member } from '../../lib/supabase'
import { aiPrompt, parseAny, type ListingData } from '../../lib/listingParse'
import { readImages } from '../../lib/ocr'
import { locateHome } from '../../lib/geo'
import { badPoints, compareSummary, monthlyCost, shortName } from '../../lib/compare'

// El mapa (Leaflet) solo se descarga al abrirlo
const HomesMap = lazy(() => import('./HomesMap'))
import { hhmm, longDate, relativeDay, shortDate, today } from '../../lib/dates'
import { isMapsUrl, mapsHref } from '../../lib/kids'
import {
  COOLING, FEATURES, HEATING, HOME_STATUS, OFFER_STATUS, VISIT_CHECKLIST,
  CRITERIA_GROUPS, FEATURE_GROUPS, coverPhoto, criteriaLabel, mergeLinks, mustHaveCheck, niceCount, parsePrice, perM2, photoUrl, photoUrls, portalName, price, priceInput, priceShort,
  type Check, type CheckValue, type RejectReason, REJECT_REASONS, type DiscardCategory, DISCARD_CATS, discardLabel, type Cooling, type HeatingType, type Home, type Link, type HomeOffer, type HomeStatus, type HomeVisit, type Mudanza, type OfferStatus, type Photo
} from '../../lib/mudanza'
import { Card } from '../../components/ui'
import { Choice, ConfirmDelete, Fab, Sheet, TextArea, TextField } from '../../components/Sheet'
import { StatusPill } from './Vendemos'
import Combobox from '../../components/Combobox'
import HomeHealth from './HomeHealth'
import { aiStatus, allChecks, healthCounts, type Health, type Market } from '../../lib/health'
import { HomePrice } from './HomePrice'
import { buyerFee, buyingCosts, feeLabel, mergeAiReform, rangeK, readyPrice, readyPriceAt, reformTotal, type Reform } from '../../lib/reforma'
import { HomeGastos } from './HomeGastos'
import { HomeSchools, useSchoolSummaries } from './HomeSchools'
import { FilterBar, FilterSheet, useHomeFilters } from './HomeFilters'
import { applyFilters, EMPTY, sortHomes, type Ctx } from '../../lib/homeFilters'
import { OWN_LABEL, distLabel, nearbySchools, schoolSummary, type NearSchool } from '../../lib/colegios'
import { recommend } from '../../lib/pricing'
import { HomeReforma } from './HomeReforma'
import { EditSection, Field, FEATURE_ICON, GroupedChips, ImportSummary, SaveBar, SelectField, thousands, useDirty, useFlash, useSections } from '../../components/FormKit'
import { AdPhotoFetch, AiChanges, AiSources, ImportDiffs, knownForAi, importMessage, merger, sourcesToLinks, type ImportDiff } from '../../components/ListingImport'
import type { AiSource } from '../../lib/listingParse'
import { MADRID_DISTRICTS, MUNICIPALITIES, PROVINCES } from '../../data/places'

const PROVINCE_NAMES = PROVINCES.map(p => p.name)
const municipalitiesOf = (province: string | null) => {
  const code = PROVINCES.find(p => p.name === province)?.code
  return code ? MUNICIPALITIES[code].map(x => x.name) : []
}
const ALL_MUNICIPALITIES = PROVINCES.flatMap(p => MUNICIPALITIES[p.code].map(x => x.name))


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
  const fs = useHomeFilters()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const schools = useSchoolSummaries(m.homes)
  // «🙅 No nos interesa»: se oculta al momento y se hace de verdad a los 6 s (hasta entonces se puede deshacer)
  const [pending, setPending] = useState<{ id: string; title: string; reason: RejectReason | null } | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const commitReject = () => { const p = pendingRef.current; if (p) { setPending(null); void m.rejectProposal(p.id, p.reason) } }
  const reject = (h: Home, reason: RejectReason | null) => {
    commitReject()
    setPending({ id: h.id, title: h.title, reason })
    clearTimeout(timer.current)
    timer.current = setTimeout(commitReject, 6000)
  }
  // Si se sale de Buscamos antes de los 6 s, se hace ya
  useEffect(() => () => { clearTimeout(timer.current); commitReject() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [rejectedOpen, setRejectedOpen] = useState(false)
  const proposals = m.homes.filter(h => h.status === 'propuesta' && h.id !== pending?.id).length
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editHome, setEditHome] = useState<{ open: boolean; home?: Home; initial?: Shared; focus?: EditFocus }>({ open: false })
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
  const t = today()
  const towns = [...new Set(m.homes.map(h => h.municipality).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))

  const ctx: Ctx = { criteria: m.criteria, visits: m.homeVisits, ratings: m.ratings, homes: m.homes, today: t, schools }
  const visibleHomes = m.homes.filter(h => h.id !== pending?.id)
  const list = useMemo(() => sortHomes(applyFilters(visibleHomes, fs.f, ctx), fs.sort, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.homes, m.criteria, m.homeVisits, m.ratings, schools, fs.f, fs.sort, pending])

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

  return (
    <div className="flex flex-col gap-5">
      {/* Qué buscamos: plegado por defecto (presupuesto y localidades + cuántos imprescindibles y valoramos) */}
      <CriteriaCard c={m.criteria} onEdit={() => setCriteriaOpen(true)} />

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
      {proposals > 0 && !(fs.f.statuses.length === 1 && fs.f.statuses[0] === 'propuesta') && (
        <button onClick={() => fs.setF(x => ({ ...x, statuses: ['propuesta'] }))} className="rounded-2xl bg-accent-soft p-3 text-left flex items-center gap-2">
          <span className="text-[20px]" aria-hidden="true">🤖</span>
          <span className="flex-1 text-[14px]"><b>{proposals} propuesta{proposals === 1 ? '' : 's'}</b> de la búsqueda automática por revisar</span>
          <span className="text-sm font-semibold text-accent">Ver ›</span>
        </button>
      )}
      <FilterBar s={fs} count={list.length} statusCount={st => applyFilters(visibleHomes, { ...EMPTY, statuses: st }, ctx).length}
        rejected={m.rejections.filter(r => !r.reproposed_at).length} onRejected={() => setRejectedOpen(true)} onOpen={() => setFiltersOpen(true)} />
      {filtersOpen && (
        <FilterSheet s={fs} towns={towns} ours={m.criteria?.municipalities ?? []} countFor={f => applyFilters(visibleHomes, f, ctx).length} onClose={() => setFiltersOpen(false)} />
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
              onOpen={() => setOpenId(h.id)} picked={picked.includes(h.id)} onPick={() => togglePick(h.id)} onReject={r => reject(h, r)} />
          })}
        </div>
      )}

      {/* Hueco al final para que «+ Piso» (y la barra de comparar) no tapen la última tarjeta */}
      <div className={pickedHomes.length > 0 ? 'h-40' : 'h-24'} aria-hidden="true" />
      {pickedHomes.length > 0 && (
        // Fija justo encima del botón «+ Piso» para que no se tapen
        <div className="fixed inset-x-5 mx-auto max-w-[34rem] bottom-[calc(max(env(safe-area-inset-bottom),8px)+152px)] z-10 flex items-center gap-2 bg-ink text-bg rounded-2xl p-2 pl-4 shadow-lg">
          <span className="text-sm font-semibold flex-1">{pickedHomes.length} marcado{pickedHomes.length > 1 ? 's' : ''} para comparar</span>
          <button onClick={() => setPicked([])} className="min-h-10 px-3 text-sm opacity-80">Quitar</button>
          <button onClick={() => setCompareOpen(true)} disabled={pickedHomes.length < 2}
            className="min-h-10 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-bold disabled:opacity-40">{pickedHomes.length < 2 ? 'Marca otro' : 'Comparar'}</button>
        </div>
      )}

      {pending && (
        <div role="status" className="fixed inset-x-5 mx-auto max-w-[34rem] bottom-[calc(max(env(safe-area-inset-bottom),8px)+88px)] z-20 flex items-center gap-2 bg-ink text-bg rounded-2xl p-2 pl-4 shadow-lg">
          <span className="text-sm flex-1 min-w-0 truncate">🙅 Rechazada{pending.reason ? ` (${REJECT_REASONS[pending.reason].replace(/^\S+\s/, '').toLowerCase()})` : ''}</span>
          <button onClick={() => { clearTimeout(timer.current); setPending(null) }} className="min-h-10 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-bold">Deshacer</button>
        </div>
      )}
      <Fab label="Piso" onClick={() => setEditHome({ open: true })} />
      {rejectedOpen && <RejectedSheet m={m} onClose={() => setRejectedOpen(false)} />}

      {open && !editHome.open && (
        <HomeSheet h={open} m={m} members={members} householdId={householdId}
          onEdit={focus => setEditHome({ open: true, home: open, focus })} onClose={() => setOpenId(null)}
          onReject={r => { setOpenId(null); reject(open, r) }} />
      )}
      {editHome.open && (
        <HomeEditSheet home={editHome.home} initial={editHome.initial} focus={editHome.focus} m={m} householdId={householdId} onClose={() => setEditHome({ open: false })}
          onCreated={() => setEditHome({ open: false })} />
      )}
      {criteriaOpen && <CriteriaSheet m={m} householdId={householdId} onClose={() => setCriteriaOpen(false)} />}
      {compareOpen && pickedHomes.length >= 2 && (
        <CompareSheet homes={pickedHomes} m={m} onRemove={id => setPicked(p => p.filter(x => x !== id))} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  )
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'bad' | 'unknown' | 'warn' }) {
  const cls = tone === 'ok' ? 'bg-accent-soft text-accent' : tone === 'bad' ? 'bg-danger/10 text-danger' : tone === 'warn' ? 'bg-[#C77A12]/15 text-[#C77A12]' : tone === 'unknown' ? 'bg-bg text-muted' : 'bg-bg'
  return <span className={`text-[12px] font-semibold px-2 py-1 rounded-lg ${cls}`}>{children}</span>
}

function StatusBadge({ s }: { s: HomeStatus }) {
  // «Llamar para visita» es una tarea pendiente: se resalta para que no se olvide
  const cls = s === 'favorito' || s === 'oferta' ? 'bg-accent text-white dark:text-bg' : s === 'descartado' ? 'bg-bg text-muted'
    : s === 'llamar' ? 'bg-danger text-white dark:text-bg' : 'bg-accent-soft text-accent'
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cls}`}>{s === 'favorito' ? '★ ' : s === 'llamar' ? '📞 ' : ''}{HOME_STATUS[s]}</span>
}

// ---------- Ficha por grupos plegables ----------
type GroupKey = 'resumen' | 'casa' | 'dinero' | 'docs' | 'zona' | 'seguimiento' | 'enlaces' | 'fotos'
const GROUPS: { k: GroupKey; icon: string; title: string }[] = [
  { k: 'resumen', icon: '🧭', title: 'Resumen' }, { k: 'casa', icon: '🏠', title: 'La casa' }, { k: 'dinero', icon: '💶', title: 'El dinero' },
  { k: 'docs', icon: '📋', title: 'Estado y documentos' },
  { k: 'zona', icon: '📍', title: 'La zona' }, { k: 'seguimiento', icon: '📅', title: 'Seguimiento' }, { k: 'enlaces', icon: '🔗', title: 'Enlaces' },
  { k: 'fotos', icon: '📷', title: 'Fotos' }
]
const GROUPS_KEY = 'ficha.grupos'
/** Grupos abiertos (se recuerdan en este móvil); «go» abre uno y baja hasta él */
function useGroups(initial: GroupKey[]) {
  const [open, setOpen] = useState<Set<GroupKey>>(() => {
    try { const v = localStorage.getItem(GROUPS_KEY); if (v) return new Set([...(JSON.parse(v) as GroupKey[]), ...initial.filter(k => k === 'seguimiento')]) } catch { /* nada */ }
    return new Set(initial)
  })
  const persist = (n: Set<GroupKey>) => { try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...n])) } catch { /* nada */ } }
  const toggle = (k: GroupKey) => setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); persist(n); return n })
  const go = (k: GroupKey) => {
    setOpen(o => { const n = new Set(o); n.add(k); persist(n); return n })
    setTimeout(() => document.getElementById(`grupo-${k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }
  return { isOpen: (k: GroupKey) => open.has(k), toggle, go }
}
type Groups = ReturnType<typeof useGroups>

function Group({ k, g, line, extra, children }: { k: GroupKey; g: Groups; line: ReactNode; extra?: ReactNode; children: ReactNode }) {
  const meta = GROUPS.find(x => x.k === k)!
  const open = g.isOpen(k)
  return (
    <section id={`grupo-${k}`} className="flex flex-col gap-2 scroll-mt-3">
      <div className="flex items-center gap-1 border-b border-line pb-1">
        <button onClick={() => g.toggle(k)} aria-expanded={open} className="flex-1 min-w-0 min-h-11 flex items-center gap-2 text-left">
          <span className="text-[16px]" aria-hidden="true">{meta.icon}</span>
          <span className="flex flex-col min-w-0">
            <span className="font-bold text-[16px] leading-tight">{meta.title}</span>
            {!open && line ? <span className="text-[12px] text-muted truncate">{line}</span> : null}
          </span>
          <span className="ml-auto text-muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        {open && extra}
      </div>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  )
}

/** Una línea por grupo, para verlo plegado sin abrirlo */
function useGroupLines(h: Home, m: Mudanza, visits: HomeVisit[], offers: HomeOffer[], nextV: HomeVisit | undefined) {
  const school = useNearestSchool(h)
  const rec = recommend(h, m.homes)
  const checks = mustHaveCheck(h, m.criteria)
  const hc = healthCounts(h)
  const checksAll = allChecks(h)
  const t = reformTotal(h.reform, h)
  const costs = buyingCosts(h)
  const nPhotos = m.photos.filter(p => p.home_id === h.id).length
  const nLinks = (h.links?.length ?? 0) + (h.url ? 1 : 0)
  const join = (...x: (string | number | false | null | undefined)[]) => x.filter(Boolean).join(' · ')
  return {
    resumen: join(rec && `oferta ~${priceShort(rec.open)}`, checks.length > 0 && `cumple ${checks.filter(c => c.ok).length} de ${checks.length}`),
    casa: join(h.size_m2 && `${Number(h.size_m2)} m²`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, h.rooms != null && `${h.rooms} hab.`, h.baths != null && `${h.baths} baños`),
    dinero: join(t ? `reforma ${rangeK(t.lo, t.hi)}` : h.reform?.state === 'listo' ? 'sin reforma' : 'reforma sin valorar', costs > 0 && `gastos ${kShort(costs)}`),
    docs: join(`Catastro ${statusIcon(checksAll.find(c => c.key === 'catastro')?.item.s)}`, `nota simple ${checksAll.find(c => c.key === 'nota_simple')?.item.s === 'unknown' ? 'pendiente' : statusIcon(checksAll.find(c => c.key === 'nota_simple')?.item.s)}`,
      hc.bad ? `❌ ${hc.bad} problema${hc.bad > 1 ? 's' : ''}` : hc.warn ? `⚠️ ${hc.warn} aviso${hc.warn > 1 ? 's' : ''}` : hc.ok ? '✅ sin problemas' : 'sin revisar'),
    zona: join(school ? `${schoolShort(school)} a ${distLabel(school.dist)}` : h.lat == null ? 'sin ubicación' : null, h.municipality),
    seguimiento: join(nextV ? `📅 ${relativeDay(nextV.visit_date).toLowerCase()} ${hhmm(nextV.start_time)}` : visits.length ? `${visits.length} visita${visits.length > 1 ? 's' : ''}` : 'sin visitas', offers[0] && `oferta ${priceShort(offers[0].amount_cents)}`, h.contact_phone && '📞'),
    enlaces: nLinks ? `${nLinks} enlace${nLinks > 1 ? 's' : ''}` : 'sin enlaces',
    fotos: nPhotos ? `${nPhotos} foto${nPhotos > 1 ? 's' : ''}` : 'sin fotos'
  }
}
const statusIcon = (st?: string) => (st === 'ok' ? '✅' : st === 'warn' ? '⚠️' : st === 'bad' ? '❌' : '¿?')
const schoolShort = (s: NearSchool) => (s.type_abbr === 'CP INF-PRI' ? 'CEIP' : s.type_abbr === 'IES' ? 'IES' : OWN_LABEL[s.ownership])

/** Veredicto en 4 casillas: criterios, riesgos, colegio y oferta (cada una lleva a su detalle) */
function Verdict({ h, m, onGo }: { h: Home; m: Mudanza; onGo: (k: GroupKey) => void }) {
  const checks = mustHaveCheck(h, m.criteria)
  const ok = checks.filter(c => c.ok).length
  const viaReform = checks.filter(c => c.ok === false && c.reform).length
  const hc = healthCounts(h)
  const rec = recommend(h, m.homes)
  const school = useNearestSchool(h)
  const tile = (tone: 'ok' | 'warn' | 'bad' | 'none') =>
    `rounded-2xl p-3 text-left flex flex-col gap-0.5 min-w-0 ${tone === 'ok' ? 'bg-accent-soft' : tone === 'warn' ? 'bg-[#C77A12]/12' : tone === 'bad' ? 'bg-danger/10' : 'bg-card'}`
  const crit: 'ok' | 'warn' | 'bad' | 'none' = !checks.length ? 'none' : ok === checks.length ? 'ok' : checks.length - ok - viaReform <= 1 ? 'warn' : 'bad'
  const risk: 'ok' | 'warn' | 'bad' | 'none' = hc.bad ? 'bad' : hc.warn ? 'warn' : hc.ok ? 'ok' : 'none'
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => onGo('casa')} className={tile(crit)}>
        <span className="text-[12px] text-muted">🎯 Criterios</span>
        <span className="text-[17px] font-bold">{checks.length ? `${ok}/${checks.length}` : '—'}{viaReform ? <span className="text-[#C77A12] text-[14px]"> · 🔨{viaReform}</span> : null}</span>
      </button>
      <button onClick={() => onGo('docs')} className={tile(risk)}>
        <span className="text-[12px] text-muted">🩺 Riesgos</span>
        <span className="text-[17px] font-bold">{hc.bad ? `❌ ${hc.bad}` : hc.warn ? `⚠️ ${hc.warn}` : hc.ok ? '✅ Bien' : 'Sin revisar'}</span>
      </button>
      <button onClick={() => onGo('zona')} className={tile(school ? (school.dist <= 1500 ? 'ok' : 'none') : 'none')}>
        <span className="text-[12px] text-muted">🏫 Colegio</span>
        <span className="text-[17px] font-bold truncate">{school ? `${schoolShort(school)} a ${distLabel(school.dist)}` : h.lat == null ? 'Sin ubicación' : '—'}</span>
      </button>
      <div className={tile('none')}>
        <span className="text-[12px] text-muted">💡 Oferta</span>
        <span className="text-[17px] font-bold">{rec ? `~${priceShort(rec.open)}` : '—'}{rec && rec.asking ? <span className="text-muted text-[13px] font-normal"> ({Math.round((rec.open / rec.asking - 1) * 100)} %)</span> : null}</span>
      </div>
    </div>
  )
}

/** ¿Por qué no nos interesa? (opcional: la búsqueda aprende del motivo) */
function ReasonPicker({ onPick }: { onPick: (r: RejectReason | null) => void }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t border-line bg-bg rounded-b-2xl">
      <span className="text-[13px] text-muted">¿Por qué? (así la búsqueda aprende)</span>
      <span className="flex gap-1.5 flex-wrap">
        {(Object.keys(REJECT_REASONS) as RejectReason[]).map(r => (
          <button key={r} type="button" onClick={() => onPick(r)} className="min-h-10 px-3 rounded-full border border-line bg-card text-[13px] font-semibold">{REJECT_REASONS[r]}</button>
        ))}
        <button type="button" onClick={() => onPick(null)} className="min-h-10 px-3 rounded-full text-[13px] text-muted">Sin motivo</button>
      </span>
    </div>
  )
}

/** Propuestas rechazadas: para recuperar alguna si os equivocasteis */
function RejectedSheet({ m, onClose }: { m: Mudanza; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const list = m.rejections.filter(r => !r.reproposed_at)
  return (
    <Sheet title={`Rechazadas (${list.length})`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">La búsqueda automática no las vuelve a proponer, salvo que bajen de precio un 5 % o más.</p>
        {list.length === 0 && <p className="text-sm text-muted">No hay ninguna.</p>}
        {list.map(r => (
          <div key={r.id} className="rounded-xl bg-card p-3 flex flex-col gap-1">
            <span className="text-[14px] font-semibold">{r.title ?? 'Sin título'}</span>
            <span className="text-[12px] text-muted">
              {[r.municipality, r.price_cents != null && priceShort(r.price_cents), r.size_m2 && `${Number(r.size_m2)} m²`, r.plot_m2 && `parcela ${Number(r.plot_m2)} m²`, r.reason && REJECT_REASONS[r.reason], new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
            </span>
            <span className="flex gap-1.5 flex-wrap mt-1">
              {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center text-accent">🔗 Anuncio ↗</a>}
              <button type="button" disabled={busy === r.id} onClick={async () => { setBusy(r.id); await m.restoreRejection(r.id); setBusy(null) }}
                className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold disabled:opacity-50">↩️ Volver a proponer</button>
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Chip de un criterio: ✓ verde, ✗ rojo, ? gris o 🔨 ámbar si no lo tiene pero está en la reforma */
function CheckChip({ c }: { c: Check }) {
  if (c.ok === false && c.reform) return <Chip tone="warn">🔨 {c.label}: no tiene · {/piscina/i.test(c.label) ? 'hacerla' : 'con reforma'} ~{kShort(c.reform.cents)}</Chip>
  return <Chip tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>
}

/** Título sin repetir la zona ni la localidad (ya salen en la línea 📍) */
function shortTitle(h: Home) {
  const drop = [h.zone, h.municipality].filter(Boolean).map(x => x!.trim().toLowerCase())
  const parts = h.title.split(/\s+·\s+|\s+-\s+|,\s+/)
  const kept = parts.filter((p, i) => i === 0 || !drop.includes(p.trim().toLowerCase()))
  return kept.join(' · ').replace(/\s+(en|·)\s*$/i, '') || h.title
}

/** Colegio más cercano (primaria) para la tarjeta, cuando hay ubicación */
function useNearestSchool(h: Home) {
  const [s, setS] = useState<NearSchool | null>(null)
  useEffect(() => {
    if (h.lat == null || h.lng == null) return
    let alive = true
    nearbySchools(h.lat, h.lng).then(l => { if (alive) { const x = schoolSummary(l); setS(x.pubPri ?? x.closest ?? null) } }).catch(() => {})
    return () => { alive = false }
  }, [h.lat, h.lng])
  return s
}

function HomeCard({ h, m, cover, onOpen, picked, onPick, onReject }: {
  h: Home; m: Mudanza; cover: { url?: string; ad: boolean } | null; onOpen: () => void; picked: boolean; onPick: () => void
  onReject: (r: RejectReason | null) => void
}) {
  const checks = mustHaveCheck(h, m.criteria)
  const pm2 = perM2(h)
  const next = m.homeVisits.find(v => v.home_id === h.id && v.status === 'scheduled' && v.visit_date >= today())
  const maps = h.maps_url || h.address || h.municipality ? mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url }) : null
  const school = useNearestSchool(h)
  const [askDelete, setAskDelete] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const ready = readyPrice(h)
  const t = reformTotal(h.reform, h)
  const costs = buyingCosts(h)
  const budget = m.criteria?.max_price_cents ?? null
  const over = budget != null && ready != null && ready > budget
  const title = shortTitle(h)

  const fails = checks.filter(c => c.ok === false)
  const viaReform = fails.filter(c => c.reform).length
  const unknown = checks.filter(c => c.ok == null).length
  const nice = niceCount(h, m.criteria)
  const facts = [h.size_m2 && `${Number(h.size_m2)} m²`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, h.rooms != null && `${h.rooms} hab.`, h.baths != null && `${h.baths} baños`, pm2 && `${price(pm2)}/m²`].filter(Boolean)
  const extra = [
    school && `🏫 ${school.type_abbr === 'CP INF-PRI' ? 'CEIP' : school.ownership === 'publico' ? 'Público' : OWN_LABEL[school.ownership]} a ${distLabel(school.dist)}`,
    next && `📅 Visita ${relativeDay(next.visit_date).toLowerCase()} ${hhmm(next.start_time)}`,
  ].filter(Boolean)

  return (
    <div className="bg-card rounded-2xl flex flex-col overflow-hidden">
    {cover && (
      <button onClick={onOpen} aria-label={`Abrir ${h.title}`} className="block w-full aspect-[2/1] bg-bg">
        {cover.url && <img src={cover.url} alt="" loading="lazy" className={`w-full h-full object-cover ${cover.ad ? 'object-top' : ''}`} />}
      </button>
    )}
    <button onClick={onOpen} className="p-4 text-left flex flex-col gap-2">
      <span className="flex justify-between items-start gap-2">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[16px] font-bold leading-snug">{title}</span>
          <span className={`text-[13px] font-semibold ${h.municipality ? 'text-accent' : 'text-muted'}`}>
            📍 {h.zone ? <span className="font-normal text-muted">{h.zone} · </span> : null}{h.municipality ?? 'Sin localidad'}
          </span>
        </span>
        <StatusBadge s={h.status} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="flex justify-between items-baseline gap-2">
          <span className="text-[13px] text-muted">Piden</span>
          <span className="text-[17px] font-bold">{price(h.price_cents)}</span>
        </span>
        {ready != null && (
          <span className="flex justify-between items-baseline gap-2">
            <span className="text-[13px] text-muted min-w-0 truncate">
              Para entrar a vivir <span className="text-[11px]">· {[t ? `+${rangeK(t.lo, t.hi)} reforma` : h.reform?.state === 'listo' ? 'sin reforma' : 'reforma ¿?', costs ? `+${kShort(costs)} gastos` : null].filter(Boolean).join(' · ')}</span>
            </span>
            <span className={`text-[17px] font-bold shrink-0 ${over ? 'text-danger' : budget != null ? 'text-accent' : ''}`}>{price(ready)}</span>
          </span>
        )}
        <OfferLine h={h} m={m} compact />
      </span>
      {facts.length > 0 && <span className="text-[13px] text-muted">{facts.join(' · ')}</span>}
      {(checks.length > 0 || nice.want.length > 0) && (
        <span className="text-[13px]">
          {checks.length > 0 && <span className={fails.length ? '' : 'text-accent font-semibold'}>🎯 Cumple {checks.length - fails.length - unknown} de {checks.length}{unknown ? ` (${unknown} sin dato)` : ''}{viaReform ? <span className="text-[#C77A12]"> · 🔨 {viaReform} con reforma</span> : null}</span>}
          {checks.length > 0 && nice.want.length > 0 && <span className="text-muted"> · </span>}
          {nice.want.length > 0 && <span>⭐ {nice.got.length} de {nice.want.length} que valoramos{nice.viaReform.length ? <span className="text-[#C77A12]"> (+🔨{nice.viaReform.length})</span> : null}</span>}
        </span>
      )}
      {fails.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {fails.map(c => <CheckChip key={c.label} c={c} />)}
        </span>
      )}
      {extra.length > 0 && <span className="text-[13px] text-muted">{extra.join(' · ')}</span>}
      {h.status === 'descartado' && discardLabel(h) && <span className="text-[13px] text-muted">Descartado: {discardLabel(h)}</span>}
    </button>
    {h.links?.length > 0 && <div className="px-4 pb-3 -mt-1"><LinkChips links={h.links} ourPrice={h.price_cents} /></div>}
    {h.status === 'propuesta' && (
      <div className="flex border-t border-line">
        <button type="button" onClick={() => void m.write('homes', { status: 'interesa' }, h.id)} className="flex-1 min-h-11 text-[14px] font-bold text-accent">👍 Me interesa</button>
        <button type="button" onClick={() => setAskReason(!askReason)} aria-expanded={askReason} className="flex-1 min-h-11 text-[14px] font-semibold text-muted border-l border-line">🙅 No nos interesa</button>
      </div>
    )}
    {h.status === 'propuesta' && askReason && <ReasonPicker onPick={r => { setAskReason(false); onReject(r) }} />}
    {askDelete && (
      <div className="flex flex-col gap-2 border-t border-line p-3 bg-danger/5" role="alert">
        <span className="text-[13px]">¿Borrar esta ficha con sus visitas, fotos y notas? No se puede deshacer.{h.status === 'propuesta' ? ' Puede volver a proponerse en otra búsqueda; con «🙅 No nos interesa» no vuelve.' : ''}</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => setAskDelete(false)} className="flex-1 min-h-10 rounded-lg border border-line text-[13px] font-semibold">Cancelar</button>
          <button type="button" onClick={() => void m.removeHome(h.id)} className="flex-1 min-h-10 rounded-lg bg-danger text-white text-[13px] font-semibold">Borrar</button>
        </span>
      </div>
    )}
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
      <button type="button" onClick={() => setAskDelete(true)} aria-label="Borrar la ficha" className="min-h-11 px-4 text-[15px] text-muted border-l border-line shrink-0">🗑️</button>
    </div>
    </div>
  )
}

type EditFocus = 'datos' | 'gastos' | 'contacto' | 'fotos'

/**
 * Ficha de un piso: pensada para decidir qué hacer con él (llamar, visitar, ofertar o descartar) y tener a mano lo
 * necesario. Arriba lo visual y la acción que toca; luego los datos de un vistazo, si conviene, el seguimiento y el resto.
 */
function HomeSheet({ h, m, members, householdId, onEdit, onClose, onReject }: {
  h: Home; m: Mudanza; members: Member[]; householdId: string; onEdit: (focus?: EditFocus) => void; onClose: () => void
  onReject: (r: RejectReason | null) => void
}) {
  const [visitSheet, setVisitSheet] = useState<{ open: boolean; visit?: HomeVisit }>({ open: false })
  const [offerSheet, setOfferSheet] = useState<{ open: boolean; offer?: HomeOffer }>({ open: false })
  const [discarding, setDiscarding] = useState(false)
  const [reason, setReason] = useState(h.discard_reason ?? '')
  const [cat, setCat] = useState<DiscardCategory | null>(h.discard_category)
  const [confirming, setConfirming] = useState(false)
  const adults = members.filter(x => x.kind === 'adult')
  const visits = m.homeVisits.filter(v => v.home_id === h.id)
  const offers = m.homeOffers.filter(o => o.home_id === h.id)
  const pm2 = perM2(h)
  const maps = mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url })
  const setStatus = (status: HomeStatus, extra: Record<string, unknown> = {}) => m.write('homes', { status, ...extra }, h.id)
  // Título corto (el resto del nombre ya sale en la línea de lugar)
  const short = h.title.split(' · ')[0] || h.title
  const place = [h.zone, h.municipality].filter(Boolean).join(' · ')

  const nextV = visits.filter(v => v.status === 'scheduled' && v.visit_date >= today()).sort((x, y) => x.visit_date.localeCompare(y.visit_date))[0]
  const groups = useGroups(nextV ? ['resumen', 'seguimiento'] : ['resumen'])
  const sum = useGroupLines(h, m, visits, offers, nextV)

  if (visitSheet.open) return <HomeVisitSheet home={h} visit={visitSheet.visit} adults={adults} m={m} onClose={() => setVisitSheet({ open: false })} />
  if (offerSheet.open) return <HomeOfferSheet home={h} offer={offerSheet.offer} m={m} onClose={() => setOfferSheet({ open: false })} />

  return (
    <Sheet title={short} onClose={onClose}>
      {/* 1. Cabecera visual */}
      <div className="-mt-3 flex flex-col gap-2">
        <Gallery h={h} m={m} onAdd={() => onEdit('fotos')} />
        <TwoPrices h={h} m={m} budget={m.criteria?.max_price_cents ?? null} />
        <div className="flex justify-between items-center gap-2">
          <span className="text-[13px] text-muted truncate min-w-0">{[pm2 && `${price(pm2)}/m²`, place].filter(Boolean).join(' · ')}</span>
          <select value={discarding ? 'descartado' : h.status} aria-label="Estado del piso"
            onChange={e => { const st = e.target.value as HomeStatus; if (st === 'descartado') setDiscarding(true); else { setDiscarding(false); void setStatus(st, { discard_reason: null, discard_category: null }) } }}
            className="max-w-[52%] min-h-10 px-2 rounded-xl border border-line bg-card text-[13px] font-semibold">
            {(['propuesta', 'interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'oferta', 'descartado'] as HomeStatus[]).map(st => (
              <option key={st} value={st}>{st === 'favorito' ? '★ ' : st === 'llamar' ? '📞 ' : ''}{HOME_STATUS[st]}</option>
            ))}
          </select>
        </div>
        {h.address && <span className="text-[13px] -mt-1">📍 {h.address}</span>}
      </div>
      {discarding && (
        <div className="flex flex-col gap-2 bg-card rounded-2xl p-4">
          <span className="text-sm font-medium text-muted">¿Por qué lo descartáis?</span>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(DISCARD_CATS) as DiscardCategory[]).map(k => (
              <button key={k} type="button" onClick={() => setCat(k)} aria-pressed={cat === k}
                className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${cat === k ? 'bg-ink text-bg border-ink' : 'bg-bg border-line'}`}>{DISCARD_CATS[k]}</button>
            ))}
          </div>
          <TextField label={cat === 'otro' ? 'Cuéntalo' : 'Detalle (opcional)'} value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
            placeholder={cat === 'ubicacion' ? 'Ej. carretera muy ruidosa' : cat === 'precio' ? 'Ej. no bajan de 640.000 €' : 'Ej. el vecino tiene perros'} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDiscarding(false)} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
            <button disabled={!cat || (cat === 'otro' && !reason.trim())} onClick={async () => { await setStatus('descartado', { discard_category: cat, discard_reason: reason.trim() || null }); setDiscarding(false) }}
              className="min-h-10 px-4 rounded-lg bg-ink text-bg text-sm font-semibold disabled:opacity-40">Descartar</button>
          </div>
        </div>
      )}
      {h.status === 'descartado' && discardLabel(h) && <p className="text-sm text-muted -mt-3">Descartado: {discardLabel(h)}</p>}

      {/* 2. Lo que toca hacer ahora */}
      <PrimaryActions h={h} offers={offers} maps={maps}
        onVisit={() => setVisitSheet({ open: true })} onOffer={o => setOfferSheet({ open: true, offer: o })}
        onEdit={onEdit} onRecover={() => setStatus('interesa', { discard_reason: null, discard_category: null })} onReject={onReject} />

      <Group k="resumen" g={groups} line={sum.resumen}>
        <Verdict h={h} m={m} onGo={groups.go} />
        <HomePrice h={h} m={m} />
      </Group>

      <Group k="casa" g={groups} line={sum.casa}>
        <QuickFacts h={h} m={m} onEdit={onEdit} />
      </Group>

      <Group k="dinero" g={groups} line={sum.dinero}>
        <HomeReforma h={h} m={m} householdId={householdId} />
        <HomeGastos h={h} m={m} />
      </Group>

      <Group k="docs" g={groups} line={sum.docs}>
        <HomeHealth h={h} m={m} householdId={householdId} />
      </Group>

      <Group k="zona" g={groups} line={sum.zona}>
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="self-start min-h-10 px-3 rounded-xl border border-line text-[13px] font-semibold text-accent flex items-center">📍 Cómo llegar ↗</a>}
        <HomeSchools h={h} m={m} />
      </Group>

      <Group k="seguimiento" g={groups} line={sum.seguimiento}
        extra={<span className="flex">
          <button onClick={() => setVisitSheet({ open: true })} className="min-h-9 px-2 text-sm font-semibold text-accent">+ Visita</button>
          <button onClick={() => setOfferSheet({ open: true })} className="min-h-9 px-2 text-sm font-semibold text-accent">+ Oferta</button>
        </span>}>
        {visits.length + offers.length === 0 ? <p className="text-sm text-muted">Aún no hay visitas ni ofertas. Las visitas salen en la Agenda.</p> : (
          [...visits.map(v => ({ date: v.visit_date, el: (
            <button key={v.id} onClick={() => setVisitSheet({ open: true, visit: v })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
              <span className="flex justify-between gap-2 text-[14px] font-semibold">
                <span>👀 Visita · {longDate(v.visit_date)} · {hhmm(v.start_time)}</span>
                <span className="text-[12px] text-muted shrink-0">{v.status === 'done' ? 'Hecha' : v.status === 'cancelled' ? 'Cancelada' : 'Prevista'}</span>
              </span>
              <VisitSummary v={v} members={members} />
            </button>
          ) })), ...offers.map(o => ({ date: o.offer_date, el: (
            <button key={o.id} onClick={() => setOfferSheet({ open: true, offer: o })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
              <span className="flex justify-between items-baseline gap-2">
                <span className="text-[14px] font-semibold">💶 Oferta · {price(o.amount_cents)}</span>
                <StatusPill status={o.status} />
              </span>
              <span className="text-[12px] text-muted">
                {shortDate(o.offer_date)}{h.price_cents ? ` · ${Math.round((o.amount_cents / h.price_cents - 1) * 1000) / 10} % sobre el precio` : ''}
                {o.counter_cents ? ` · contraoferta ${price(o.counter_cents)}` : ''}
              </span>
            </button>
          ) }))].sort((a, b) => b.date.localeCompare(a.date)).map(x => x.el)
        )}
        <NotesBox h={h} m={m} />
        <ContactCard h={h} onEdit={() => onEdit('contacto')} />
      </Group>

      <Group k="enlaces" g={groups} line={sum.enlaces} extra={<button onClick={() => onEdit()} aria-label="Editar los enlaces" className="min-h-9 px-2 text-sm">✏️</button>}>
        {h.url && (
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="min-h-11 px-3 rounded-xl bg-bg flex items-center gap-2 text-[14px] font-semibold text-accent">
            <span className="flex-1 min-w-0 truncate">⭐ {portalName(h.url) ?? 'Anuncio'} <span className="text-muted font-normal">· principal</span></span>
            <span className="shrink-0">{price(h.price_cents)} ↗</span>
          </a>
        )}
        {h.links?.length > 0 ? <LinkChips links={h.links} ourPrice={h.price_cents} big /> : !h.url && <p className="text-[13px] text-muted">Sin enlaces. Añádelos con ✏️ (otros portales, web de la inmobiliaria…).</p>}
      </Group>

      <Group k="fotos" g={groups} line={sum.fotos}>
        <Photos h={h} m={m} householdId={householdId} kind="foto" />
        <Photos h={h} m={m} householdId={householdId} kind="anuncio" />
      </Group>

      <button onClick={() => onEdit()} className="self-start min-h-11 px-4 rounded-xl border border-line text-sm font-semibold">✏️ Editar todos los datos</button>
      {/* Borrar, siempre a mano al final de la ficha */}
      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <ConfirmDelete label="🗑️ Borrar esta ficha (con sus visitas, fotos y notas)" confirming={confirming} setConfirming={setConfirming}
          onConfirm={async () => { await m.removeHome(h.id); onClose() }} />
        {h.status === 'propuesta' && <p className="text-[12px] text-muted">Si la borras, la búsqueda automática podría volver a proponerla. Con «🙅 No nos interesa» no vuelve (salvo que baje de precio).</p>}
      </div>
    </Sheet>
  )
}

/** Fotos deslizables arriba de la ficha (la portada primero) */
function Gallery({ h, m, onAdd }: { h: Home; m: Mudanza; onAdd: () => void }) {
  const cover = coverPhoto(h, m.photos)
  const own = m.photos.filter(p => p.home_id === h.id)
  const fotos = own.filter(p => (p.kind ?? 'foto') === 'foto')
  const list = (fotos.length ? fotos : own.slice(0, 1))
  const ordered = cover ? [cover, ...list.filter(p => p.id !== cover.id)] : list
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [big, setBig] = useState<string | null>(null)
  const key = ordered.map(p => p.path).join()
  useEffect(() => {
    if (!ordered.length) return
    let alive = true
    photoUrls(ordered.map(p => p.path)).then(u => { if (alive) setUrls(u) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!ordered.length) {
    return <button onClick={onAdd} className="w-full aspect-[16/7] rounded-2xl border border-dashed border-line text-sm font-semibold text-accent">🖼️ Añadir fotos</button>
  }
  return (
    <>
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {ordered.map((p, i) => (
          <button key={p.id} onClick={() => setBig(urls[p.path] ?? null)} aria-label={`Foto ${i + 1} de ${ordered.length}`}
            className={`relative shrink-0 snap-center rounded-2xl overflow-hidden bg-bg aspect-[4/3] ${ordered.length > 1 ? 'w-[86%]' : 'w-full'}`}>
            {urls[p.path] && <img src={urls[p.path]} alt="" loading={i ? 'lazy' : 'eager'} className={`w-full h-full object-cover ${p.kind === 'anuncio' ? 'object-top' : ''}`} />}
            {i === 0 && ordered.length > 1 && <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold">1/{ordered.length} ⇢</span>}
          </button>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-40 bg-black/95 flex flex-col" onClick={() => setBig(null)}>
          <div className="flex justify-end px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
            <button onClick={() => setBig(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 pb-[max(env(safe-area-inset-bottom),8px)]">
            <img src={big} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      )}
    </>
  )
}

/** La acción que toca según el estado, y los accesos rápidos */
function PrimaryActions({ h, offers, maps, onVisit, onOffer, onEdit, onRecover, onReject }: {
  h: Home; offers: HomeOffer[]; maps: string | null | undefined; onVisit: () => void; onOffer: (o?: HomeOffer) => void
  onEdit: (focus?: EditFocus) => void; onRecover: () => void; onReject: (r: RejectReason | null) => void
}) {
  const [askReason, setAskReason] = useState(false)
  const who = h.agency || h.contact || (h.advertiser === 'particular' ? 'el particular' : 'el anunciante')
  const tel = h.contact_phone ? `tel:${h.contact_phone.replace(/[^\d+]/g, '')}` : null
  const btn = 'min-h-12 px-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2'
  const main = 'bg-accent text-white dark:text-bg'
  const second = 'bg-card border border-line'
  const call = tel
    ? <a href={tel} className={`${btn} ${main} flex-1 min-w-0`}><span className="truncate">📞 Llamar a {who}</span></a>
    : <button onClick={() => onEdit('contacto')} className={`${btn} ${second} flex-1`}>📞 Añadir el teléfono</button>
  const wa = h.contact_phone ? <a href={`https://wa.me/${waNumber(h.contact_phone)}`} target="_blank" rel="noopener noreferrer" className={`${btn} ${second}`}>WhatsApp</a> : null
  const lastOffer = offers[0]
  let row: ReactNode
  switch (h.status) {
    case 'propuesta': row = <><button onClick={onRecover} className={`${btn} ${main} flex-1`}>👍 Me interesa</button><button onClick={() => setAskReason(!askReason)} aria-expanded={askReason} className={`${btn} ${second}`}>🙅 No nos interesa</button></>; break
    case 'interesa': case 'llamar': row = <>{call}{wa}</>; break
    case 'visita_pedida': row = <><button onClick={onVisit} className={`${btn} ${main} flex-1`}>📅 Apuntar la visita</button>{tel && <a href={tel} className={`${btn} ${second}`}>📞</a>}</>; break
    case 'visitado': case 'favorito': row = <><button onClick={() => onOffer()} className={`${btn} ${main} flex-1`}>💶 Hacer oferta</button><button onClick={onVisit} className={`${btn} ${second}`}>📅 Otra visita</button></>; break
    case 'oferta': row = <><button onClick={() => onOffer(lastOffer)} className={`${btn} ${main} flex-1`}>💶 {lastOffer ? `Ver la oferta (${price(lastOffer.amount_cents)})` : 'Apuntar la oferta'}</button>{tel && <a href={tel} className={`${btn} ${second}`}>📞</a>}</>; break
    default: row = <button onClick={onRecover} className={`${btn} ${second} flex-1`}>↩️ Recuperar este piso</button>
  }
  const small = 'min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold flex items-center gap-1'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">{row}</div>
      {h.status === 'propuesta' && askReason && <ReasonPicker onPick={onReject} />}
      <div className="flex gap-1.5 flex-wrap">
        {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className={`${small} text-accent`}>🔗 {portalName(h.url) ?? 'Anuncio'} ↗</a>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className={`${small} text-accent`}>📍 Cómo llegar ↗</a>}
        <button onClick={() => onEdit()} className={small}>✏️ Editar</button>
      </div>
    </div>
  )
}

/** Los dos precios que deciden: lo que piden (para ofertar) y lo que nos cuesta entrar a vivir (para comparar) */
function TwoPrices({ h, m, budget }: { h: Home; m: Mudanza; budget: number | null }) {
  const ready = readyPrice(h)
  const t = reformTotal(h.reform, h)
  const costs = buyingCosts(h)
  const over = budget != null && ready != null ? ready - budget : null
  const bad = over != null && over > 0
  return (
    <div className="rounded-2xl bg-card p-3 flex flex-col gap-2">
      <div className="flex justify-between items-baseline gap-2">
        <span className="flex flex-col min-w-0">
          <span className="text-[13px] text-muted">Piden</span>
          <span className="text-[11px] text-muted">sobre esto se oferta</span>
        </span>
        <span className="text-[24px] font-bold leading-tight shrink-0">{price(h.price_cents)}</span>
      </div>
      <div className={`flex justify-between items-baseline gap-2 border-t border-line pt-2`}>
        <span className="flex flex-col min-w-0">
          <span className="text-[13px] text-muted">Para entrar a vivir</span>
          <span className="text-[11px] text-muted">
            {[t ? `+${rangeK(t.lo, t.hi)} reforma` : h.reform?.state === 'listo' ? 'sin reforma' : 'reforma sin valorar', costs ? `+${kShort(costs)} gastos` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={`text-[24px] font-bold leading-tight shrink-0 ${bad ? 'text-danger' : over != null ? 'text-accent' : ''}`}>{price(ready)}</span>
      </div>
      {over != null && <span className={`text-[12px] font-semibold text-right -mt-1 ${bad ? 'text-danger' : 'text-accent'}`}>{bad ? `${kShort(over)} por encima del presupuesto` : `${kShort(-over)} por debajo del presupuesto`}</span>}
      <OfferLine h={h} m={m} />
    </div>
  )
}

/** Tercera cifra: nuestra oferta (si la hay) o la recomendada, y lo que costaría entrar a vivir si la aceptan */
function OfferLine({ h, m, compact }: { h: Home; m: Mudanza; compact?: boolean }) {
  const last = m.homeOffers.filter(o => o.home_id === h.id).sort((a, b) => b.offer_date.localeCompare(a.offer_date))[0]
  const rec = last ? null : recommend(h, m.homes)
  if (!last && !rec) return null
  const p = last ? (last.status === 'countered' && last.counter_cents ? last.counter_cents : last.amount_cents) : rec!.open
  const ready = readyPriceAt(h, p)
  const budget = m.criteria?.max_price_cents ?? null
  const diff = budget != null ? ready - budget : null
  const st = last ? (last.status === 'pending' ? '⏳ pendiente' : last.status === 'countered' ? `↩️ contraoferta ${last.counter_cents ? price(last.counter_cents) : ''}` : last.status === 'accepted' ? '✅ aceptada' : last.status === 'rejected' ? '❌ rechazada' : 'retirada') : null
  const fit = diff == null ? null : diff > 0 ? <span className="text-danger">{kShort(diff)} por encima</span> : <span className="text-accent">✅ dentro del presupuesto</span>
  if (compact) {
    return (
      <span className="flex flex-col">
        <span className="flex justify-between items-baseline gap-2">
          <span className="text-[13px] text-muted min-w-0 truncate">{last ? 'Nuestra oferta' : 'Oferta recomendada'}{last ? <span className="text-[11px]"> · {st}</span> : <span className="text-[11px]"> · tope {priceShort(rec!.max)}</span>}</span>
          <span className="text-[15px] font-bold shrink-0">{last ? price(last.amount_cents) : `~${priceShort(rec!.open)}`}</span>
        </span>
        <span className="text-[11px] text-muted text-right">si os la aceptan: entrar a vivir {priceShort(ready)}{fit ? <> · {fit}</> : null}</span>
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-2">
      <div className="flex justify-between items-baseline gap-2">
        <span className="flex flex-col min-w-0">
          <span className="text-[13px] text-muted">{last ? 'Nuestra oferta' : 'Oferta recomendada'}</span>
          <span className="text-[11px] text-muted">{last ? st : `tope razonable ${price(rec!.max)}`}</span>
        </span>
        <span className="text-[20px] font-bold leading-tight shrink-0">{last ? price(last.amount_cents) : `~${price(rec!.open)}`}</span>
      </div>
      <span className="text-[12px] text-muted text-right">si os la aceptan: entrar a vivir {price(ready)}{fit ? <> · {fit}</> : null}</span>
    </div>
  )
}

/** «41,5 k€» */
const kShort = (c: number) => `${(c / 100000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€`


/** «Qué buscamos» en la portada: lo básico siempre a la vista y el detalle al desplegar */
function CriteriaCard({ c, onEdit }: { c: Mudanza['criteria']; onEdit: () => void }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('buscamos.criterios') === '1' } catch { return false } })
  const toggle = () => setOpen(o => { try { localStorage.setItem('buscamos.criterios', o ? '0' : '1') } catch { /* sin almacenamiento */ } return !o })
  const nice = c?.nice_to_haves ?? []
  const has = c && (c.max_price_cents || c.min_rooms || c.min_m2 || c.zones.length || c.municipalities?.length || c.must_haves.length || nice.length)
  if (!has) {
    return (
      <button onClick={onEdit} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1.5">
        <span className="flex justify-between items-baseline">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-sm text-accent font-semibold">Editar</span>
        </span>
        <span className="text-sm text-muted">Presupuesto, zonas, imprescindibles y lo que valoramos. Cada piso marcará cuáles cumple.</span>
      </button>
    )
  }
  const basics = [
    c.max_price_cents ? `Hasta ${priceShort(c.max_price_cents)} para entrar a vivir` : null,
    c.min_rooms ? `${c.min_rooms}+ hab.` : null,
    c.min_m2 ? `${c.min_m2}+ m²` : null
  ].filter(Boolean).join(' · ')
  const places = [...(c.municipalities ?? []), ...c.zones]
  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <button onClick={toggle} aria-expanded={open} className="flex-1 min-h-10 text-left flex items-center gap-2">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <button onClick={onEdit} className="min-h-10 px-1 text-sm text-accent font-semibold">Editar</button>
      </div>
      <button onClick={toggle} className="text-left flex flex-col gap-1">
        {basics && <span className="text-[14px] font-semibold">{basics}</span>}
        {places.length > 0 && <span className="text-[13px] text-muted truncate">📍 {places.join(', ')}</span>}
        {!open && (c.must_haves.length > 0 || nice.length > 0) && (
          <span className="flex gap-1.5 flex-wrap mt-0.5">
            {c.must_haves.length > 0 && <Chip>🎯 {c.must_haves.length} imprescindible{c.must_haves.length === 1 ? '' : 's'}</Chip>}
            {nice.length > 0 && <Chip>⭐ {nice.length} que valoramos</Chip>}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          {c.must_haves.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-muted">🎯 Imprescindibles</span>
              <span className="flex gap-1.5 flex-wrap">{c.must_haves.map(k => <Chip key={k}>{FEATURE_ICON[k] ? `${FEATURE_ICON[k]} ` : ''}{criteriaLabel(k)}</Chip>)}</span>
            </div>
          )}
          {nice.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-muted">⭐ Valoramos</span>
              <span className="flex gap-1.5 flex-wrap">{nice.map(k => <Chip key={k}>{FEATURE_ICON[k] ? `${FEATURE_ICON[k]} ` : ''}{criteriaLabel(k)}</Chip>)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Los datos de un vistazo, con iconos; gastos al mes e imprescindibles */
function QuickFacts({ h, m, onEdit }: { h: Home; m: Mudanza; onEdit: (focus?: EditFocus) => void }) {
  const [costsOpen, setCostsOpen] = useState(false)
  const [mustOpen, setMustOpen] = useState(false)
  const checks = mustHaveCheck(h, m.criteria)
  const met = checks.filter(c => c.ok).length
  const nice = niceCount(h, m.criteria)
  const [niceOpen, setNiceOpen] = useState(false)
  const monthly = monthlyCost(h)
  const facts: [string, string][] = ([
    h.size_m2 && ['🏠', `${Number(h.size_m2)} m²${h.useful_m2 ? ` (${Number(h.useful_m2)} útiles)` : ''}`],
    h.plot_m2 && ['🌳', `parcela ${Number(h.plot_m2)} m²`],
    h.rooms != null && ['🛏', `${h.rooms} hab.`],
    h.baths != null && ['🛁', `${h.baths} baños`],
    h.floor && ['🏢', h.floor.length > 18 ? `${h.floor.slice(0, 18)}…` : h.floor],
    h.year_built && ['🏗', `de ${h.year_built}`],
    h.energy && ['⚡', `certif. ${h.energy}`],
    h.heating_type && ['🔥', HEATING[h.heating_type]],
    h.cooling && ['❄️', `aire: ${COOLING[h.cooling]}`],
    h.minutes_to_school != null && ['🏫', `${h.minutes_to_school} min al cole`]
  ].filter(Boolean) as [string, string][])
  // Extras que no estén ya dichos arriba (calefacción y aire van con su tipo)
  const extras = h.features.filter(f => !(f === 'calefaccion' && h.heating_type) && !(f === 'aire' && h.cooling))
  return (
    <section className="bg-card rounded-2xl p-3 flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">De un vistazo</h3>
        <button onClick={() => onEdit('datos')} aria-label="Editar los datos" className="min-h-9 px-2 text-sm">✏️</button>
      </div>
      {facts.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {facts.map(([i, t]) => <span key={i + t} className="text-[13px] flex gap-1.5 min-w-0"><span aria-hidden="true">{i}</span><span className="truncate">{t}</span></span>)}
        </div>
      ) : <p className="text-sm text-muted">Sin datos todavía: rellénalos desde el anuncio con «✏️».</p>}
      {extras.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {extras.map(f => <span key={f} className="px-2 py-0.5 rounded-lg bg-bg text-[12px]">{FEATURE_ICON[f] ?? '•'} {FEATURES[f] ?? f}</span>)}
        </span>
      )}
      {h.features.includes('placas_solares') && h.health?.solar?.n && <span className="text-[12px] text-muted -mt-1">🔆 {h.health.solar.n}</span>}
      <button onClick={() => (monthly != null ? setCostsOpen(!costsOpen) : onEdit('gastos'))} className="flex justify-between items-center text-left border-t border-line pt-2">
        <span className="text-[13px] text-muted">💶 Gastos al mes</span>
        <span className="text-[14px] font-semibold">{monthly != null ? `~${price(monthly)}` : 'Añadir'}{monthly != null && <span className="text-muted"> {costsOpen ? '▾' : '▸'}</span>}</span>
      </button>
      {costsOpen && monthly != null && (
        <div className="text-[12px] text-muted grid grid-cols-2 gap-x-3 -mt-1">
          {h.community_fee_cents != null && <span>Comunidad {price(h.community_fee_cents)}</span>}
          {h.ibi_cents != null && <span>IBI {price(Math.round(h.ibi_cents / 12))}/mes</span>}
          {h.electricity_cents != null && <span>Luz {price(h.electricity_cents)}</span>}
          {h.water_cents != null && <span>Agua {price(h.water_cents)}</span>}
          {h.heating_cents != null && <span>Calefacción {price(h.heating_cents)}</span>}
          <button onClick={() => onEdit('gastos')} className="text-left text-accent font-semibold">✏️ Cambiar</button>
        </div>
      )}
      {checks.length > 0 && (
        <>
          <button onClick={() => setMustOpen(!mustOpen)} className="flex justify-between items-center text-left border-t border-line pt-2">
            <span className="text-[13px] text-muted">🎯 Imprescindibles</span>
            <span className={`text-[14px] font-semibold ${met === checks.length ? 'text-accent' : ''}`}>{met === checks.length ? '✅' : '⚠️'} {met} de {checks.length} <span className="text-muted">{mustOpen ? '▾' : '▸'}</span></span>
          </button>
          {mustOpen && (
            <span className="flex gap-1 flex-wrap -mt-1">
              {checks.map(c => <CheckChip key={c.label} c={c} />)}
            </span>
          )}
        </>
      )}
      {nice.want.length > 0 && (
        <>
          <button onClick={() => setNiceOpen(!niceOpen)} className="flex justify-between items-center text-left border-t border-line pt-2">
            <span className="text-[13px] text-muted">⭐ Lo que valoramos</span>
            <span className="text-[14px] font-semibold">{nice.got.length} de {nice.want.length} <span className="text-muted">{niceOpen ? '▾' : '▸'}</span></span>
          </button>
          {niceOpen && (
            <span className="flex gap-1 flex-wrap -mt-1">
              {nice.want.map(k => <Chip key={k} tone={nice.got.includes(k) ? 'ok' : nice.viaReform.includes(k) ? 'warn' : 'unknown'}>{nice.got.includes(k) ? '✓' : nice.viaReform.includes(k) ? '🔨' : '·'} {criteriaLabel(k)}{nice.viaReform.includes(k) ? ' (con reforma)' : ''}</Chip>)}
            </span>
          )}
        </>
      )}
    </section>
  )
}

function VisitSummary({ v, members }: { v: HomeVisit; members: Member[] }) {
  const marked = Object.values(v.checklist ?? {}).filter(x => x.v).length
  const bad = Object.values(v.checklist ?? {}).filter(x => x.v === 'mal').length
  return (
    <span className="text-[12px] text-muted">
      {v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}
      {marked > 0 && ` · Revisado ${marked}/${VISIT_CHECKLIST.length}`}{bad > 0 && ` · ${bad} punto${bad > 1 ? 's' : ''} malo${bad > 1 ? 's' : ''}`}
      {v.status === 'done' && !marked && ' · ¿Cómo fue? Apúntalo'}
    </span>
  )
}

function ContactCard({ h, onEdit }: { h: Home; onEdit: () => void }) {
  const has = h.contact || h.agency || h.contact_phone || h.contact_email || h.advertiser || h.listing_ref || h.buyer_fee_kind
  return (
    <section className="flex flex-col gap-2 bg-card rounded-2xl p-3">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">Contacto</h3>
        <button onClick={onEdit} aria-label="Editar el contacto" className="min-h-9 px-2 text-sm">✏️</button>
      </div>
      {!has ? <button onClick={onEdit} className="self-start text-sm text-accent font-semibold min-h-10">+ Añadir quién lo anuncia y su teléfono</button> : (
        <>
          <p className="text-sm">
            {h.advertiser === 'particular' ? '🙋 Particular' : h.advertiser === 'agencia' ? '🏢 Agencia' : ''}
            {h.agency ? `${h.advertiser ? ' · ' : ''}${h.agency}` : ''}
            {h.contact ? `${h.advertiser || h.agency ? ' · ' : ''}${h.contact}` : ''}
          </p>
          {h.listing_ref && <p className="text-xs text-muted">Referencia del anuncio: {h.listing_ref}</p>}
          {h.advertiser !== 'particular' && (
            <p className={`text-[13px] ${h.buyer_fee_kind ? '' : 'text-[#C77A12]'}`}>
              💼 Honorarios para el comprador: {h.buyer_fee_kind ? <b>{feeLabel(h)}</b> : 'sin preguntar'}
              {(buyerFee(h) ?? 0) > 0 ? <span className="text-muted"> · ~{price(buyerFee(h))} con IVA</span> : null}
              {h.buyer_fee_note ? <span className="block text-xs text-muted">{h.buyer_fee_note}</span> : null}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {h.contact_phone && <a href={`tel:${h.contact_phone.replace(/[^\d+]/g, '')}`} className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">📞 {h.contact_phone}</a>}
            {h.contact_phone && <a href={`https://wa.me/${waNumber(h.contact_phone)}`} target="_blank" rel="noopener noreferrer" className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">WhatsApp</a>}
            {h.contact_email && <a href={`mailto:${h.contact_email}`} className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold flex items-center">✉️ Email</a>}
          </div>
        </>
      )}
    </section>
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
  const [view, setViewRaw] = useState<Photo | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const setView = (p: Photo | null) => { setConfirmDel(false); setViewRaw(p) }

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
            <button type="button" key={p.id} onClick={() => setView(p)} className={`${ad ? 'aspect-[9/16]' : 'aspect-square'} rounded-lg overflow-hidden bg-bg`}>
              {urls[p.id] && <img src={urls[p.id]} alt="" className={`w-full h-full ${ad ? 'object-cover object-top' : 'object-cover'}`} loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col" onClick={() => setView(null)}>
          {/* Debajo de la barra de estado del móvil (la app ocupa toda la pantalla) */}
          <div className="flex justify-between items-center gap-2 px-3 pb-3 pt-[max(env(safe-area-inset-top),12px)]" onClick={e => e.stopPropagation()}>
            {confirmDel ? (
              <button type="button" onClick={async () => { await m.removePhoto(view); setConfirmDel(false); setView(null) }} className="min-h-11 px-4 rounded-xl bg-danger text-white text-sm font-bold">¿Seguro? Borrar</button>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="min-h-11 px-4 rounded-xl bg-white/15 text-white text-sm font-semibold">🗑️ {ad ? 'Borrar captura' : 'Borrar foto'}</button>
            )}
            <span className="flex items-center">
              {coverPhoto(h, m.photos)?.id === view.id
                ? <span className="min-h-11 px-3 text-sm font-semibold text-white/80 flex items-center">★ Es la portada</span>
                : <button type="button" onClick={async () => { await m.write('homes', { cover_photo_id: view.id }, h.id); setView(null) }} className="min-h-11 px-3 text-sm font-semibold text-white">☆ Poner de portada</button>}
              <button type="button" onClick={() => setView(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
            </span>
          </div>
          <div className={`flex-1 p-2 pb-[max(env(safe-area-inset-bottom),8px)] ${ad ? 'overflow-y-auto' : 'flex items-center justify-center'}`}>
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

function HomeEditSheet({ home, initial, m, householdId, onClose, onCreated, focus }: {
  home?: Home; initial?: Shared; m: Mudanza; householdId: string; onClose: () => void; onCreated: () => void; focus?: EditFocus
}) {
  // Bloques: en un piso nuevo, abiertos «anuncio» y «lo básico»; al venir del ✏️ de la ficha, solo ese bloque
  const focusSection = focus ? ({ datos: 'basico', gastos: 'gastos', contacto: 'contacto', fotos: 'enlaces' } as const)[focus] : null
  const sections = useSections(home ? (focusSection ? [focusSection] : []) : ['anuncio', 'basico'])
  useEffect(() => {
    if (!focusSection) return
    const t = setTimeout(() => document.getElementById(`edit-${focusSection}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [focusSection])
  const { flash, show: showFlash } = useFlash()
  const [summary, setSummary] = useState<{ filled: number; diffs: number } | null>(null)
  const [leaving, setLeaving] = useState(false)
  // Capturas del anuncio: se leen en el móvil para rellenar la ficha y se guardan con el piso al guardar
  const [shots, setShots] = useState<File[]>([])
  // Fotos traídas desde los enlaces que dé la IA (se guardan como fotos del piso)
  const [photoLinks, setPhotoLinks] = useState<string[]>([])
  const [diffs, setDiffs] = useState<ImportDiff[]>([])
  const [sources, setSources] = useState<AiSource[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [links, setLinks] = useState<Link[]>(home?.links ?? [])
  // Lo que diga la IA de ITE, urbanización, VPO… (no pisa lo que hayáis puesto a mano) y la referencia catastral
  const [health, setHealth] = useState<Health>(home?.health ?? {})
  const [cadRef, setCadRef] = useState<string | null>(home?.cadastral_ref ?? null)
  const [market, setMarket] = useState<Market | null>(home?.market ?? null)
  const [changes, setChanges] = useState<string | undefined>()
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
  const [feeKind, setFeeKind] = useState<'no' | 'pct' | 'fijo' | null>(home?.buyer_fee_kind ?? null)
  const [feePct, setFeePct] = useState(home?.buyer_fee_pct != null ? String(Number(home.buyer_fee_pct)).replace('.', ',') : '')
  const [feeAmount, setFeeAmount] = useState(priceInput(home?.buyer_fee_cents))
  const [feeVat, setFeeVat] = useState(home?.buyer_fee_vat ?? true)
  const [feeNote, setFeeNote] = useState(home?.buyer_fee_note ?? '')
  const [notes, setNotes] = useState(home?.notes ?? '')
  // La reforma que proponga la IA (solo se guarda si la IA ha dicho algo; el resto se edita en la ficha)
  const [reform, setReform] = useState<Reform | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /** Rellena la ficha con lo que se haya sacado del anuncio (solo los datos encontrados) */
  /** Rellena solo lo vacío; lo que ya tenía otro valor se ofrece aparte (no se machaca) */
  function apply(d: ListingData) {
    if (d.photo_urls?.length) setPhotoLinks(l => [...new Set([...l, ...d.photo_urls!])].slice(0, 20))
    if (d.sources?.length) {
      setSources(d.sources)
      setPicked(d.sources.map(x => x.url).filter(u => u.replace(/\?.*$/, '') !== url.trim().replace(/\?.*$/, '')))
    }
    if (d.changes) setChanges(d.changes)
    if (d.reform) setReform(r => mergeAiReform(r ?? home?.reform ?? {}, d.reform!))
    if (d.cadastral_ref && !cadRef) setCadRef(d.cadastral_ref)
    if (d.zone_m2_eur || d.asking_m2_eur) {
      setMarket(mk => ({
        ...(mk ?? {}), at: new Date().toISOString(),
        ...(d.zone_m2_eur ? { paid_m2: d.zone_m2_eur, paid_note: d.zone_m2_note } : {}),
        ...(d.asking_m2_eur ? { asking_m2: d.asking_m2_eur, asking_note: d.asking_m2_note } : {})
      }))
    }
    if (d.solar_note && health.solar?.src !== 'manual') setHealth(hl => ({ ...hl, solar: { s: 'ok', n: d.solar_note!, src: 'ia' } }))
    if (d.checks) {
      const next: Health = { ...health, ...(d.solar_note && health.solar?.src !== 'manual' ? { solar: { s: 'ok' as const, n: d.solar_note, src: 'ia' as const } } : {}) }
      for (const [k, text] of Object.entries(d.checks ?? {})) {
        if (next[k]?.src === 'manual') continue
        next[k] = { s: aiStatus(k, text), n: text.replace(/^\s*(BIEN|REVISAR|PROBLEMA|NO CONSTA)\s*[—–:-]*\s*/i, '').slice(0, 400) || text.slice(0, 400), src: 'ia', ...(next[k]?.files ? { files: next[k].files } : {}) }
      }
      setHealth(next)
    }
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
    if (d.buyer_fee && !feeKind) {
      setFeeKind(d.buyer_fee.kind)
      if (d.buyer_fee.pct != null) setFeePct(String(d.buyer_fee.pct).replace('.', ','))
      if (d.buyer_fee.eur != null) setFeeAmount(priceInput(Math.round(d.buyer_fee.eur * 100)))
      if (d.buyer_fee.vat_included) setFeeVat(false)
      if (d.buyer_fee.note) setFeeNote(`IA: ${d.buyer_fee.note}`.slice(0, 300))
      f.filled.push('honorarios')
    }
    f.put('agencia', agency, d.agency?.slice(0, 120), setAgency)
    f.put('contacto', contact, d.contact?.slice(0, 120), setContact)
    f.put('teléfono', phone, d.phone?.slice(0, 30), setPhone)
    f.put('email', email, d.email?.slice(0, 120), setEmail)
    f.put('referencia', listingRef, d.ref?.slice(0, 60), setListingRef)
    // Las características solo se añaden (nunca se quita ninguna)
    const newF = (d.features ?? []).filter(x => !features.includes(x))
    if (newF.length) { setFeatures([...features, ...newF]); f.filled.push('características') }
    setDiffs(f.diffs)
    const touched = [...f.filled, ...f.diffs.map(x => x.label)]
    showFlash(f.filled, f.diffs.map(x => x.label))
    sections.reveal(SECTIONS.filter(sec => fieldsOf(sec.id).some(([k]) => touched.includes(k))).map(sec => sec.id))
    if (touched.length) setSummary({ filled: f.filled.length, diffs: f.diffs.length })
    return f
  }

  // Qué datos tiene cada bloque (para el contador, el resumen y «pedir solo lo que falta»)
  function fieldsOf(id: string): [string, string][] {
    switch (id) {
      case 'basico': return [['precio', amount], ['m²', m2], ['parcela', plot], ['m² útiles', useful], ['año', year], ['habitaciones', rooms], ['baños', baths], ['planta', floor]]
      case 'ubicacion': return [['localidad', municipality ?? ''], ['zona', zone], ['dirección', address], ['mapa', maps]]
      case 'equip': return [['características', features.length ? 'x' : ''], ['certificado', energy ?? ''], ['tipo de calefacción', heatType ?? ''], ['aire', cooling ?? ''], ['minutos al cole', minutes]]
      case 'gastos': return [['comunidad', fee], ['IBI', ibi], ['luz', power], ['agua', water], ['calefacción', heating]]
      case 'contacto': return [['anunciante', advertiser ?? ''], ['agencia', advertiser === 'particular' ? 'x' : agency || contact], ['teléfono', phone], ['email', email], ['referencia', listingRef]]
      default: return []
    }
  }
  const countOf = (id: string) => { const f = fieldsOf(id); return { filled: f.filter(([, v]) => v.trim()).length, total: f.length } }
  const flashedIn = (id: string) => fieldsOf(id).some(([k]) => flash[k])
  const missingForAi = SECTIONS.flatMap(sec => fieldsOf(sec.id)).filter(([k, v]) => !v.trim() && !['mapa', 'minutos al cole', 'anunciante'].includes(k)).map(([k]) => k)

  const dirty = useDirty({ title, url, amount, m2, useful, plot, year, rooms, baths, floor, zone, province, municipality, address, maps, features, fee, ibi, power, water, heating,
    energy, heatType, cooling, minutes, contact, advertiser, agency, phone, email, listingRef, feeKind, feePct, feeAmount, feeVat, feeNote, notes, links, shots: shots.length, ad: adPhotos.length, picked, health, cadRef, market })
  const requestClose = () => { if (dirty && !busy) setLeaving(true); else onClose() }

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
  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude', onlyMissing = false) {
    const full = url.trim() && (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
    if (!full) return
    const prompt = aiPrompt(full.replace(/\?.*$/, ''), knownForAi({
      'Precio': amount && `${amount} €`, 'Tipo y nombre': title, 'Dirección': address, 'Zona': zone, 'Localidad': municipality,
      'Metros construidos': m2, 'Metros útiles': useful, 'Parcela (m²)': plot, 'Habitaciones': rooms, 'Baños': baths, 'Planta': floor,
      'Año de construcción': year, 'Extras': features.map(f => FEATURES[f] ?? f).join(', '), 'Certificado energético': energy,
      'Calefacción': heatType && HEATING[heatType], 'Aire acondicionado': cooling && COOLING[cooling],
      'Comunidad (€/mes)': fee, 'IBI (€/año)': ibi, 'Luz (€/mes)': power, 'Agua (€/mes)': water, 'Calefacción (€/mes)': heating,
      'Anunciante': advertiser, 'Agencia': agency, 'Referencia': listingRef
    }), onlyMissing ? missingForAi : undefined)
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
      contact_email: email.trim() || null, listing_ref: listingRef.trim() || null,
      buyer_fee_kind: advertiser === 'particular' ? null : feeKind, buyer_fee_vat: feeVat, buyer_fee_note: feeNote.trim() || null,
      buyer_fee_pct: feeKind === 'pct' && feePct.trim() ? Math.min(10, Math.max(0, Number(feePct.replace(',', '.')) || 0)) : null,
      buyer_fee_cents: feeKind === 'fijo' && feeAmount.trim() ? parsePrice(feeAmount) : null,
      health, cadastral_ref: cadRef, market, ...(reform ? { reform } : {}),
      links: mergeLinks(links.filter(l => l.url.trim()).map(l => ({ ...l, label: l.label.trim(),
        url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim().replace(/^http:/i, 'https:') : `https://${l.url.trim()}` })), sourcesToLinks(sources, picked), [cleanUrl])
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

  const fl = (k: string) => flash[k]
  const cnt = (id: string) => countOf(id)
  return (
    <Sheet title={home ? 'Editar piso' : 'Nuevo piso'} onClose={requestClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre para reconocerlo" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Ático luminoso calle Mayor" autoFocus={!home && !initial} flash={fl('nombre')} />
        {summary && (
          <ImportSummary filled={summary.filled} diffs={summary.diffs}
            missing={SECTIONS.map(sec => ({ id: sec.id, title: sec.title, n: cnt(sec.id).total - cnt(sec.id).filled }))}
            onGo={id => sections.reveal([id], id)} />
        )}

        <EditSection id="anuncio" icon="📥" title="Rellenar desde el anuncio" open={sections.isOpen('anuncio')} onToggle={() => sections.toggle('anuncio')}>
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
              ? <a href={full} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold -mt-2">✓ Anuncio de {portal} · abrir ↗</a>
              : <span className="text-xs text-danger -mt-2">Ese enlace no parece válido</span>
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
              {home && missingForAi.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-xs text-muted">🎯 Pedir solo lo que falta ({missingForAi.length}: {missingForAi.slice(0, 4).join(', ')}{missingForAi.length > 4 ? '…' : ''}):</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => askAi(k, true)} className="min-h-10 rounded-xl border border-dashed border-line bg-card text-[13px] font-semibold">{l} ↗</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center gap-2 text-sm font-semibold text-accent cursor-pointer ${ocr ? 'opacity-50 pointer-events-none' : ''}`}>
            📸 {shots.length ? `Añadir más capturas (${shots.length})` : 'Subir capturas del anuncio'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { void addShots(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          </label>
          {shots.length > 0 && !ocr && <p className="text-xs text-muted -mt-2">Las capturas se guardan con el piso al pulsar «Guardar», por si borran el anuncio.</p>}
          {ocr && <p role="status" className="text-xs text-muted">{ocr}</p>}
          {pasteOpen ? (
            <div className="flex flex-col gap-2">
              <TextArea label="Texto del anuncio" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={20000}
                placeholder="Pega aquí el precio, las características básicas, el edificio, el certificado…" />
              <button type="button" onClick={() => fromText(pasted)} disabled={!pasted.trim()}
                className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Rellenar con este texto</button>
            </div>
          ) : (
            <button type="button" onClick={() => setPasteOpen(true)} className="self-start min-h-10 text-sm text-accent font-semibold -mt-2">📋 Pegar el texto del anuncio</button>
          )}
          <AdPhotoFetch urls={photoLinks} photos={adPhotos} onPhotos={setAdPhotos} />
          {importNote && <p role="status" className={`text-xs ${importNote.ok ? 'text-accent' : 'text-danger'}`}>{importNote.text}</p>}
          <ImportDiffs diffs={diffs} onChange={setDiffs} />
          <AiChanges text={changes} />
          <AiSources sources={sources} picked={picked} onPicked={setPicked} ourPrice={amount.trim() ? parsePrice(amount) : null} />
        </EditSection>

        <EditSection id="basico" icon="🏠" title="Lo básico" {...cnt('basico')} flashed={flashedIn('basico')} open={sections.isOpen('basico')} onToggle={() => sections.toggle('basico')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio" suffix="€" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} onBlur={() => setAmount(thousands)} placeholder="320.000" flash={fl('precio')} />
            <Field label="Construidos" suffix="m²" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} placeholder="95" flash={fl('m²')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Parcela" suffix="m²" inputMode="decimal" value={plot} onChange={e => setPlot(e.target.value)} flash={fl('parcela')} />
            <Field label="Útiles" suffix="m²" inputMode="decimal" value={useful} onChange={e => setUseful(e.target.value)} flash={fl('m² útiles')} />
            <Field label="Año" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} flash={fl('año')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Habitaciones" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} flash={fl('habitaciones')} />
            <Field label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} flash={fl('baños')} />
            <Field label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} placeholder="3º" flash={fl('planta')} />
          </div>
        </EditSection>

        <EditSection id="ubicacion" icon="📍" title="Ubicación" {...cnt('ubicacion')} flashed={flashedIn('ubicacion')} open={sections.isOpen('ubicacion')} onToggle={() => sections.toggle('ubicacion')}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Provincia</span>
              <select value={province ?? ''} onChange={e => { setProvince(e.target.value || null); setMunicipality(null) }}
                className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
                <option value="">—</option>
                {PROVINCE_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <div className={`rounded-xl ${fl('localidad') ? 'ring-2 ring-accent' : ''}`}>
              <Combobox key={province ?? 'none'} label="Localidad" value={municipality} onChange={setMunicipality} options={municipalitiesOf(province)} placeholder="Escribe: Alcob…" />
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona, urbanización o barrio'}{fl('zona') ? ' ✨' : ''}</span>
            <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'distritos-madrid' : undefined}
              placeholder={municipality === 'Madrid' ? 'Elige un distrito o escribe el barrio' : 'Ej. Casco antiguo'}
              className={`w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent ${fl('zona') ? 'ring-2 ring-accent' : ''}`} />
            {municipality === 'Madrid' && <datalist id="distritos-madrid">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
          </label>
          <Field label="Dirección" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} flash={fl('dirección')} />
          <Field label="Enlace de Google Maps" type="url" inputMode="url" value={maps} onChange={e => setMaps(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          <p className="text-xs text-muted -mt-2">Con la dirección o el enlace de Maps, el piso sale bien situado en el mapa y se pueden comprobar el Catastro y las zonas inundables.</p>
        </EditSection>

        <EditSection id="equip" icon="🔧" title="Equipamiento" {...cnt('equip')} flashed={flashedIn('equip')} open={sections.isOpen('equip')} onToggle={() => sections.toggle('equip')}>
          <GroupedChips label={`Tiene${fl('características') ? ' ✨' : ''}`} groups={FEATURE_GROUPS} labels={k => FEATURES[k] ?? k} value={features} onChange={setFeatures} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField<string> label="Certificado energético" value={energy} onChange={setEnergy} flash={fl('certificado')}
              options={'ABCDEFG'.split('').map(x => ({ value: x, label: x }))} />
            <Field label="Minutos al cole" inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="10" />
            <SelectField<HeatingType> label="Calefacción" value={heatType} onChange={setHeatType} flash={fl('tipo de calefacción')}
              options={(Object.keys(HEATING) as HeatingType[]).map(k => ({ value: k, label: HEATING[k] }))} />
            <SelectField<Cooling> label="Aire acondicionado" value={cooling} onChange={setCooling} flash={fl('aire')}
              options={(['splits', 'conductos', 'aerotermia', 'si', 'no'] as Cooling[]).map(k => ({ value: k, label: COOLING[k] }))} />
          </div>
        </EditSection>

        <EditSection id="gastos" icon="💶" title="Gastos" {...cnt('gastos')} flashed={flashedIn('gastos')} open={sections.isOpen('gastos')} onToggle={() => sections.toggle('gastos')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comunidad" suffix="€/mes" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} flash={fl('comunidad')} />
            <Field label="IBI" suffix="€/año" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} onBlur={() => setIbi(thousands)} flash={fl('IBI')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Luz" suffix="€" inputMode="decimal" value={power} onChange={e => setPower(e.target.value)} flash={fl('luz')} />
            <Field label="Agua" suffix="€" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} flash={fl('agua')} />
            <Field label="Calefacción" suffix="€" inputMode="decimal" value={heating} onChange={e => setHeating(e.target.value)} flash={fl('calefacción')} />
          </div>
          <p className="text-xs text-muted -mt-2">Luz, agua y calefacción: gasto medio al mes (si la factura es bimestral, divídela entre dos).</p>
        </EditSection>

        <EditSection id="contacto" icon="📞" title="Contacto" {...cnt('contacto')} flashed={flashedIn('contacto')} open={sections.isOpen('contacto')} onToggle={() => sections.toggle('contacto')}>
          <Choice<'agencia' | 'particular' | null> label="¿Quién lo anuncia?" value={advertiser} onChange={setAdvertiser}
            options={[{ value: 'agencia', label: '🏢 Agencia' }, { value: 'particular', label: '🙋 Particular' }, { value: null, label: '?' }]} />
          {advertiser !== 'particular' && <Field label="Agencia" value={agency} onChange={e => setAgency(e.target.value)} maxLength={120} placeholder="Nombre de la inmobiliaria" flash={fl('agencia')} />}
          <Field label="Persona de contacto" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} flash={fl('contacto')} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="600 000 000" flash={fl('teléfono')} />
            <Field label="Referencia" value={listingRef} onChange={e => setListingRef(e.target.value)} maxLength={60} placeholder="Ref. del anuncio" flash={fl('referencia')} />
          </div>
          <Field label="Email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} flash={fl('email')} />
          {advertiser !== 'particular' && (
            <div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
              <SelectField<'no' | 'pct' | 'fijo'> label="💼 Honorarios para el comprador" value={feeKind} onChange={setFeeKind} empty="Sin preguntar" flash={fl('honorarios')}
                options={[{ value: 'no', label: 'No cobra al comprador' }, { value: 'pct', label: 'Un % del precio' }, { value: 'fijo', label: 'Un importe fijo' }]} />
              {feeKind === 'pct' && <Field label="Porcentaje" inputMode="decimal" value={feePct} onChange={e => setFeePct(e.target.value)} suffix="%" placeholder="3" />}
              {feeKind === 'fijo' && <Field label="Importe" inputMode="decimal" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} onBlur={e => setFeeAmount(thousands(e.target.value))} suffix="€" />}
              {(feeKind === 'pct' || feeKind === 'fijo') && (
                <label className="flex items-center gap-2 text-[14px] min-h-10">
                  <input type="checkbox" checked={feeVat} onChange={e => setFeeVat(e.target.checked)} className="w-5 h-5" />
                  <span>Más IVA (21 %)</span>
                </label>
              )}
              <Field label="Nota" value={feeNote} onChange={e => setFeeNote(e.target.value)} maxLength={300} placeholder="Ej. se pagan en arras / negociable" />
              <p className="text-[12px] text-muted -mt-1">En Madrid lo normal es que pague el vendedor, pero algunas agencias cobran también al comprador. Se suma al precio para entrar a vivir.</p>
            </div>
          )}
        </EditSection>

        <EditSection id="enlaces" icon="🔗" title={home ? 'Enlaces y fotos' : 'Otros enlaces'} open={sections.isOpen('enlaces')} onToggle={() => sections.toggle('enlaces')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-muted mb-1">Otros enlaces de este piso</legend>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={l.label} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 40) } : x)))} placeholder="Nombre"
                  aria-label="Nombre del enlace" className="w-28 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold" />
                <input value={l.url} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" inputMode="url"
                  aria-label="Enlace" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px]" />
                {l.price_cents ? <span className="text-[12px] text-muted shrink-0">{priceShort(l.price_cents)}</span> : null}
                <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Quitar enlace" className="w-9 text-muted text-xl">×</button>
              </div>
            ))}
            {links.length < 10 && <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="self-start min-h-10 text-sm text-accent font-semibold">+ Añadir enlace (otro portal, la inmobiliaria…)</button>}
          </fieldset>
          {home && (
            <>
              <Photos h={home} m={m} householdId={householdId} kind="foto" />
              <Photos h={home} m={m} householdId={householdId} kind="anuncio" />
              <p className="text-xs text-muted -mt-2">Toca una foto para verla, borrarla o ponerla de portada.</p>
            </>
          )}
        </EditSection>

        <TextArea label="Notas y comentarios" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        <SaveBar dirty={dirty} busy={busy} label={home ? 'Guardar' : 'Guardar piso'} status={ocr} error={error}
          leaving={leaving} onStay={() => setLeaving(false)} onLeave={onClose} />
      </form>
    </Sheet>
  )
}

const SECTIONS = [
  { id: 'basico', title: 'Lo básico' }, { id: 'ubicacion', title: 'Ubicación' }, { id: 'equip', title: 'Equipamiento' },
  { id: 'gastos', title: 'Gastos' }, { id: 'contacto', title: 'Contacto' }
]

function CriteriaSheet({ m, householdId, onClose }: { m: Mudanza; householdId: string; onClose: () => void }) {
  const c = m.criteria
  const [max, setMax] = useState(priceInput(c?.max_price_cents))
  const [rooms, setRooms] = useState(c?.min_rooms?.toString() ?? '')
  const [m2, setM2] = useState(c?.min_m2?.toString() ?? '')
  const [zones, setZones] = useState((c?.zones ?? []).join(', '))
  const [towns, setTowns] = useState<string[]>(c?.municipalities ?? [])
  const [pick, setPick] = useState(0)
  const [must, setMust] = useState<string[]>(c?.must_haves ?? [])
  const [nice, setNice] = useState<string[]>(c?.nice_to_haves ?? [])
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const maxCents = max.trim() ? parsePrice(max) : null
    if (max.trim() && !maxCents) { setError('El presupuesto no es válido'); return }
    const err = await m.write('search_criteria', {
      household_id: householdId, max_price_cents: maxCents,
      min_rooms: rooms.trim() ? parseInt(rooms, 10) : null, min_m2: m2.trim() ? parseInt(m2, 10) : null,
      zones: zones.split(',').map(z => z.trim()).filter(Boolean).slice(0, 15).map(z => z.slice(0, 40)), municipalities: towns, must_haves: must.slice(0, 20), nice_to_haves: nice.filter(k => !must.includes(k)).slice(0, 40)
    }, undefined, 'household_id')
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title="Qué buscamos" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Presupuesto máximo para entrar a vivir (€)" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="Ej. 650.000" />
        <p className="text-[12px] text-muted -mt-3">Lo que os cuesta en total: precio + reforma + impuestos y gastos. Así todos los pisos se comparan igual.</p>
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
        <details className="rounded-2xl border border-line p-3" open={must.length > 0}>
          <summary className="font-bold text-[15px] cursor-pointer">🎯 Imprescindibles{must.length ? ` · ${must.length}` : ''}</summary>
          <p className="text-[12px] text-muted mt-1 mb-2">Sin esto no nos interesa. Cada piso dirá si lo cumple.</p>
          <GroupedChips label="" groups={CRITERIA_GROUPS} labels={criteriaLabel} value={must} onChange={v => { setMust(v); setNice(n => n.filter(k => !v.includes(k))) }} />
        </details>
        <details className="rounded-2xl border border-line p-3" open={nice.length > 0}>
          <summary className="font-bold text-[15px] cursor-pointer">⭐ Valoramos{nice.length ? ` · ${nice.length}` : ''}</summary>
          <p className="text-[12px] text-muted mt-1 mb-2">Suma puntos pero no descarta. Puedes ordenar la lista por esto.</p>
          <GroupedChips label="" groups={CRITERIA_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => !must.includes(k)) })).filter(g => g.keys.length)} labels={criteriaLabel} value={nice} onChange={setNice} />
        </details>
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
  const schools = useSchoolSummaries(homes)
  const musts = (h: Home) => { const c = mustHaveCheck(h, m.criteria); return c.length ? c.filter(x => x.ok).length / c.length : null }
  const ENERGY = 'ABCDEFG'

  // Cada fila: cómo se muestra y, si tiene sentido, qué valor es mejor (para resaltarlo)
  type Row = { label: string; show: (h: Home) => ReactNode; value?: (h: Home) => number | null; better?: 'low' | 'high' }
  const rows: Row[] = [
    { label: 'Precio', show: h => price(h.price_cents), value: h => h.price_cents, better: 'low' },
    { label: 'Reforma', show: h => { const t = reformTotal(h.reform, h); return t ? rangeK(t.lo, t.hi) : h.reform?.state === 'listo' ? 'No necesita' : '¿?' }, value: h => (h.reform?.state || h.reform?.items?.length ? reformTotal(h.reform, h)?.mid ?? 0 : null), better: 'low' },
    { label: 'Gastos de compra', show: h => (h.price_cents != null ? price(buyingCosts(h)) : '—'), value: h => (h.price_cents != null ? buyingCosts(h) : null), better: 'low' },
    { label: 'Honorarios comprador', show: h => (h.advertiser === 'particular' ? 'No (particular)' : h.buyer_fee_kind === 'no' ? 'No' : buyerFee(h) != null ? price(buyerFee(h)) : '¿?'), value: h => (h.advertiser === 'particular' ? 0 : buyerFee(h)), better: 'low' },
    { label: 'Para entrar a vivir', show: h => price(readyPrice(h)), value: readyPrice, better: 'low' },
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
    { label: 'Imprescindibles', show: h => { const c = mustHaveCheck(h, m.criteria); const r = c.filter(x => x.reform).length; return c.length ? <>{c.filter(x => x.ok).length}/{c.length}{r ? <span className="text-[#C77A12]"> · 🔨{r}</span> : null}</> : '—' }, value: musts, better: 'high' },
    { label: 'Valoramos', show: h => { const n = niceCount(h, m.criteria); return n.want.length ? `${n.got.length}/${n.want.length}` : '—' }, value: h => (m.criteria?.nice_to_haves?.length ? niceCount(h, m.criteria).got.length : null), better: 'high' },
    { label: 'Piscina', show: h => (h.features.includes('piscina') ? 'Propia' : h.features.includes('piscina_comunitaria') ? 'Comunitaria' : '—'), value: h => (h.features.includes('piscina') ? 2 : h.features.includes('piscina_comunitaria') ? 1 : 0), better: 'high' },
    { label: 'Comunidad', show: h => (h.community_fee_cents != null ? `${price(h.community_fee_cents)}/mes` : '—'), value: h => h.community_fee_cents, better: 'low' },
    { label: 'IBI', show: h => (h.ibi_cents != null ? `${price(h.ibi_cents)}/año` : '—'), value: h => h.ibi_cents, better: 'low' },
    { label: 'Luz', show: h => (h.electricity_cents != null ? `${price(h.electricity_cents)}/mes` : '—'), value: h => h.electricity_cents, better: 'low' },
    { label: 'Agua', show: h => (h.water_cents != null ? `${price(h.water_cents)}/mes` : '—'), value: h => h.water_cents, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_cents != null ? `${price(h.heating_cents)}/mes` : '—'), value: h => h.heating_cents, better: 'low' },
    { label: 'Gastos fijos', show: h => (monthlyCost(h) != null ? `${price(monthlyCost(h))}/mes` : '—'), value: monthlyCost, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_type ? HEATING[h.heating_type] : '—'), value: () => null, better: 'high' },
    { label: 'Placas solares', show: h => (h.features.includes('placas_solares') ? `Sí${h.health?.solar?.n ? ` (${h.health.solar.n.slice(0, 40)})` : ''}` : h.features.includes('solar_termica') ? 'Térmicas' : '—'), value: h => (h.features.includes('placas_solares') ? 1 : 0), better: 'high' },
    { label: 'Aire', show: h => (h.cooling ? COOLING[h.cooling] : '—'), value: () => null, better: 'high' },
    { label: 'Energía', show: h => h.energy ?? '—', value: h => (h.energy ? ENERGY.indexOf(h.energy) : null), better: 'low' },
    { label: 'Colegios < 1,5 km', show: h => (schools[h.id] ? schools[h.id].near : '—'), value: h => schools[h.id]?.near ?? null, better: 'high' },
    { label: 'Público primaria', show: h => { const s = schools[h.id]?.pubPri; return s ? `${distLabel(s.dist)}${s.bilingual ? ' · bil.' : ''}` : '—' }, value: h => schools[h.id]?.pubPri?.dist ?? null, better: 'low' },
    { label: 'Instituto público', show: h => { const s = schools[h.id]?.pubSec; return s ? distLabel(s.dist) : '—' }, value: h => schools[h.id]?.pubSec?.dist ?? null, better: 'low' },
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

/** Enlaces extra de un piso (otros portales, la inmobiliaria), con su precio y aviso si es más barato */
function LinkChips({ links, ourPrice, big }: { links: Link[]; ourPrice: number | null; big?: boolean }) {
  return (
    <span className="flex gap-1.5 flex-wrap items-center">
      <span className="text-[12px] text-muted">También en:</span>
      {links.map(l => {
        const low = l.price_cents != null && ourPrice != null && l.price_cents < ourPrice
        return (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            className={`${big ? 'min-h-10 px-3 text-[13px]' : 'min-h-8 px-2.5 text-[12px]'} rounded-full border font-semibold flex items-center gap-1 ${low ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-accent'}`}>
            {l.label || portalName(l.url)}{l.price_cents ? ` · ${priceShort(l.price_cents)}` : ''}{low ? ' ⬇️' : ''} ↗
          </a>
        )
      })}
    </span>
  )
}
