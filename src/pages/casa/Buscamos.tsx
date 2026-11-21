// Pestaña «Buscamos» de Mudanza: lista y mapa de casas, filtros, propuestas, comparar y decidir.
// Las piezas grandes viven aparte: HomeFicha (la ficha), HomeEdit (alta y edición), HomeCard (tarjeta), Criterios, Comparar, Rechazadas, HomeVisitaOferta y BuscamosComun.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { type Member } from '../../lib/supabase'

// El mapa (Leaflet) solo se descarga al abrirlo
const HomesMap = lazy(() => import('./HomesMap'))
import { addDays, hhmm, relativeDay, today } from '../../lib/dates'
import { coverPhoto, photoUrls, type RejectReason, REJECT_REASONS, type Home, type Mudanza } from '../../lib/mudanza'
import { Card } from '../../components/ui'
import { Fab } from '../../components/Sheet'
import { useSchoolSummaries } from './HomeSchools'
import { FilterBar, FilterSheet, useHomeFilters } from './HomeFilters'
import { applyFilters, EMPTY, sortHomes, type Ctx } from '../../lib/homeFilters'
import { AiHomeSearch } from './AiHomeSearch'
import { AffordCard } from './Afford'
import { DecideButton, DecideSheet } from './Decidir'
import { MarketCard } from './FueraMercado'
import { GROUPS, HomeSheet, type GroupKey, type EditFocus } from './HomeFicha'
import { RejectedSheet } from './Rechazadas'
import { HomeCard } from './HomeCard'
import { CriteriaCard, CriteriaSheet } from './Criterios'
import { HomeEditSheet, type Shared } from './HomeEdit'
import { CompareSheet } from './Comparar'

export default function Buscamos({ m, members, me, householdId }: { m: Mudanza; members: Member[]; me: Member; householdId: string }) {
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
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null)
  // Abrir una ficha desde fuera (pestaña Visitas): /mudanza?piso=<id>&grupo=docs
  const [sp, setSp] = useSearchParams()
  useEffect(() => {
    const p = sp.get('piso')
    if (!p) return
    setOpenId(p)
    const g = sp.get('grupo') as GroupKey | null
    setOpenGroup(g && GROUPS.some(x => x.k === g) ? g : null)
    sp.delete('piso'); sp.delete('grupo'); setSp(sp, { replace: true })
  }, [sp]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const [decideOpen, setDecideOpen] = useState(false)
  // Pisos marcados para comparar (se recuerdan en este móvil)
  const [picked, setPicked] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('compare-picked') ?? '[]') } catch { return [] } })
  useEffect(() => { try { localStorage.setItem('compare-picked', JSON.stringify(picked)) } catch { /* nada */ } }, [picked])
  const pickedHomes = m.homes.filter(h => picked.includes(h.id))
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-4)))
  const t = today()
  const towns = [...new Set(m.homes.map(h => h.municipality).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))

  const ctx: Ctx = { criteria: m.criteria, visits: m.homeVisits, ratings: m.ratings, homes: m.homes, today: t, schools, offers: m.offers, listing: m.listing }
  const visibleHomes = m.homes.filter(h => h.id !== pending?.id)
  const list = useMemo(() => sortHomes(applyFilters(visibleHomes, fs.f, ctx), fs.sort, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.homes, m.criteria, m.homeVisits, m.ratings, schools, fs.f, fs.sort, pending])

  const nextVisits = m.homeVisits.filter(v => v.status === 'scheduled' && v.visit_date >= t)
    .sort((x, y) => x.visit_date.localeCompare(y.visit_date) || x.start_time.localeCompare(y.start_time))
  const toClose = m.homeVisits.filter(v => v.status === 'scheduled' && v.visit_date < t).length
  const navigate = useNavigate()
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
      <AffordCard m={m} householdId={householdId} />
      <CriteriaCard c={m.criteria} onEdit={() => setCriteriaOpen(true)} />

      {/* Visitas: una línea que lleva a la pestaña Visitas (allí está todo) */}
      {(nextVisits.length > 0 || toClose > 0) && (() => {
        const v = nextVisits[0]
        const h = v && m.homes.find(x => x.id === v.home_id)
        const week = nextVisits.filter(x => x.visit_date <= addDays(t, 6)).length
        return (
          <button onClick={() => navigate('/mudanza?vista=visitas')} className="rounded-2xl bg-card px-4 py-3 text-left flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[14px] truncate">
              {v ? <>📅 <b>{relativeDay(v.visit_date)} {hhmm(v.start_time)} · {h?.title ?? 'Visita'}</b>{week > 1 ? <span className="text-muted"> · {week - 1} más esta semana</span> : null}</> : null}
              {toClose > 0 && <span className={v ? 'text-muted' : ''}>{v ? ' · ' : ''}✍️ {toClose} por cerrar</span>}
            </span>
            <span className="text-accent font-semibold" aria-hidden="true">›</span>
          </button>
        )
      })()}

      <DecideButton m={m} members={members} onOpen={() => setDecideOpen(true)} />
      <MarketCard homes={m.homes} prices={m.homePrices} onShow={() => fs.setF(x => ({ ...x, statuses: ['fuera'] }))} />

      <div className="grid grid-cols-2 p-1 rounded-xl bg-card border border-line" role="tablist" aria-label="Vista">
        {([['lista', '☰ Lista'], ['mapa', '🗺️ Mapa']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`min-h-9 rounded-lg text-[13px] font-semibold ${view === k ? 'bg-ink text-bg' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      <AiHomeSearch m={m} householdId={householdId} />
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
        <div className="flex flex-col gap-2.5 homes-grid lg:gap-4">
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
        <HomeSheet h={open} m={m} members={members} householdId={householdId} meId={me.id} startGroup={openGroup}
          onEdit={focus => setEditHome({ open: true, home: open, focus })} onClose={() => { setOpenId(null); setOpenGroup(null) }}
          onReject={r => { setOpenId(null); reject(open, r) }} />
      )}
      {editHome.open && (
        <HomeEditSheet home={editHome.home} initial={editHome.initial} focus={editHome.focus} m={m} householdId={householdId} onClose={() => setEditHome({ open: false })}
          onCreated={() => setEditHome({ open: false })} />
      )}
      {criteriaOpen && <CriteriaSheet m={m} householdId={householdId} onClose={() => setCriteriaOpen(false)} />}
      {decideOpen && <DecideSheet m={m} members={members} onOpenHome={id => { setDecideOpen(false); setOpenId(id) }} onClose={() => setDecideOpen(false)} />}
      {compareOpen && pickedHomes.length >= 2 && (
        <CompareSheet homes={pickedHomes} m={m} onRemove={id => setPicked(p => p.filter(x => x !== id))} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  )
}
