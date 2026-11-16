// Ficha de una casa en Buscamos: grupos plegables (resumen, análisis, casa, dinero, reforma, docs, estado, zona, visitas, oferta…)
import { useEffect, useState, type ReactNode } from 'react'
import { type Member } from '../../lib/supabase'
import { monthlyCost } from '../../lib/compare'

import { hhmm, longDate, relativeDay, shortDate, today } from '../../lib/dates'
import { mapsHref } from '../../lib/kids'
import { COOLING, FEATURES, HEATING, HOME_STATUS, OFFER_STATUS, accessCount, shownFeatures, coverPhoto, criteriaLabel, mustHaveCheck, niceCount, perM2, photoUrl, photoUrls, portalName, price, priceShort, roomsLabel, type RejectReason, type DiscardCategory, DISCARD_CATS, discardLabel, type Home, type HomeOffer, type HomeStatus, type HomeVisit, type Mudanza, type Photo } from '../../lib/mudanza'
import { ConfirmDelete, Sheet, TextArea, TextField } from '../../components/Sheet'
import { StatusPill } from './Vendemos'
import HomeHealth from './HomeHealth'
import { allChecks, healthCounts } from '../../lib/health'
import { HomePrice } from './HomePrice'
import { buyerFee, buyingCosts, feeLabel, rangeK, readyPrice, readyPriceAt, reformTotal, REFORM_STATE } from '../../lib/reforma'
import { HomeGastos } from './HomeGastos'
import { HomeSchools } from './HomeSchools'
import { GroupBox, useOpenGroups } from '../../components/Groups'
import { OWN_LABEL, distLabel, type NearSchool } from '../../lib/colegios'
import { recommend } from '../../lib/pricing'
import { HomeReforma } from './HomeReforma'
import { briefLists } from './VisitBrief'
import { VisitQA } from './VisitQA'
import { qaProgress } from '../../lib/visitQA'
import { Stars, rateHome } from './HomeStars'
import { DeepAnalysisPanel, deepLine } from './DeepAnalysis'
import { fmtScore, homeScore, scoreTone } from '../../lib/score'
import { FEATURE_ICON } from '../../components/FormKit'
import { waNumber, nameOf, Chip, CheckChip, useNearestSchool, ScoreBadge, LinkChips, kShort } from './BuscamosComun'
import { ReasonPicker } from './Rechazadas'
import { HomeVisitSheet, HomeOfferSheet } from './HomeVisitaOferta'

// ---------- Ficha por grupos plegables ----------
export type GroupKey = 'resumen' | 'analisis' | 'visitas' | 'casa' | 'dinero' | 'reforma' | 'docs' | 'estado' | 'zona' | 'oferta' | 'enlaces' | 'fotos' | 'notas'
export const GROUPS: { k: GroupKey; icon: string; title: string }[] = [
  { k: 'resumen', icon: '🧭', title: 'Resumen' }, { k: 'analisis', icon: '🔬', title: 'Análisis a fondo (IA)' }, { k: 'casa', icon: '🏠', title: 'La casa' },
  { k: 'dinero', icon: '💶', title: 'Gastos e impuestos' }, { k: 'reforma', icon: '🔨', title: 'Reforma' },
  { k: 'docs', icon: '📄', title: 'Documentos' }, { k: 'estado', icon: '🔍', title: 'Estado de la vivienda' },
  { k: 'zona', icon: '📍', title: 'La zona' }, { k: 'visitas', icon: '👀', title: 'Visitas' }, { k: 'oferta', icon: '💶', title: 'Oferta' }, { k: 'enlaces', icon: '🔗', title: 'Enlaces' },
  { k: 'fotos', icon: '📷', title: 'Fotos' }, { k: 'notas', icon: '📝', title: 'Notas y comentarios' }
]
/** Grupos abiertos de la ficha (se recuerdan en este móvil); «go» abre uno y baja hasta él */
export const useGroups = (initial: GroupKey[]) => useOpenGroups<GroupKey>('ficha.grupos', initial.filter(k => k !== 'visitas'), initial.filter(k => k === 'visitas'))
export type Groups = ReturnType<typeof useGroups>

export function Group({ k, g, line, extra, children, lineAlways }: { k: GroupKey; g: Groups; line: ReactNode; extra?: ReactNode; children: ReactNode; lineAlways?: boolean }) {
  const meta = GROUPS.find(x => x.k === k)!
  return <GroupBox id={k} icon={meta.icon} title={meta.title} line={line} open={g.isOpen(k)} onToggle={() => g.toggle(k)} extra={extra} lineAlways={lineAlways}>{children}</GroupBox>
}

/** Una línea por grupo, para verlo plegado sin abrirlo */
export function useGroupLines(h: Home, m: Mudanza, visits: HomeVisit[], offers: HomeOffer[], nextV: HomeVisit | undefined) {
  const school = useNearestSchool(h)
  const rec = recommend(h, m.homes)
  const checks = mustHaveCheck(h, m.criteria)
  const hc = healthCounts(h, 'docs')
  const he = healthCounts(h, 'estado')
  const brief = briefLists(h, m)
  const checksAll = allChecks(h)
  const t = reformTotal(h.reform, h)
  const costs = buyingCosts(h)
  const nPhotos = m.photos.filter(p => p.home_id === h.id).length
  const nLinks = (h.links?.length ?? 0) + (h.url ? 1 : 0)
  const lastOffer = offers.slice().sort((x, y) => y.offer_date.localeCompare(x.offer_date))[0]
  const join = (...x: (string | number | false | null | undefined)[]) => x.filter(Boolean).join(' · ')
  return {
    analisis: deepLine(h),
    resumen: join(rec && `oferta ~${priceShort(rec.open)}`, checks.length > 0 && `cumple ${checks.filter(c => c.ok).length} de ${checks.length}`),
    casa: join(h.size_m2 && `${Number(h.size_m2)} m²`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, roomsLabel(h), h.baths != null && `${h.baths} baños`),
    dinero: join(monthlyCost(h) != null && `${price(monthlyCost(h))}/mes`,
      h.advertiser !== 'particular' && (!h.buyer_fee_kind ? 'honorarios ¿?' : (buyerFee(h) ?? 0) > 0 ? `honorarios ${kShort(buyerFee(h)!)}` : 'sin honorarios'),
      costs > 0 && `impuestos y gastos ${kShort(costs)}`),
    reforma: t ? `${rangeK(t.lo, t.hi)}${h.reform?.state ? ` · ${REFORM_STATE[h.reform.state].label.toLowerCase()}` : ''}` : h.reform?.state === 'listo' ? 'para entrar a vivir' : h.reform?.state ? `${REFORM_STATE[h.reform.state].label.toLowerCase()} · sin partidas` : 'sin valorar',
    estado: join(`✅ ${he.ok}`, `⚠️ ${he.warn}`, he.bad > 0 && `⛔ ${he.bad}`, `❓ ${he.unknown}`),
    docs: join(`✅ ${hc.ok}`, `⚠️ ${hc.warn}`, hc.bad > 0 && `⛔ ${hc.bad}`, `❓ ${hc.unknown}`, `Catastro ${statusIcon(checksAll.find(c => c.key === 'catastro')?.item.s)}`,
      `nota simple ${checksAll.find(c => c.key === 'nota_simple')?.item.s === 'unknown' ? 'pendiente' : statusIcon(checksAll.find(c => c.key === 'nota_simple')?.item.s)}`),
    zona: join(school ? `${schoolShort(school)} a ${distLabel(school.dist)}` : h.lat == null ? 'sin ubicación' : null, h.municipality),
    visitas: join(nextV ? `📅 ${relativeDay(nextV.visit_date).toLowerCase()} ${hhmm(nextV.start_time)}` : visits.length ? `${visits.length} visita${visits.length > 1 ? 's' : ''}` : 'sin visitas',
      (() => { const r = m.ratings.filter(x => x.home_id === h.id); return r.length ? `${(r.reduce((a, x) => a + x.score, 0) / r.length).toLocaleString('es-ES', { maximumFractionDigits: 1 })}/10 ⭐` : null })(),
      brief.warn.length > 0 && `⚠️ ${brief.warn.length}`, (() => { const p = qaProgress(h, m.criteria); return p.pending ? `📋 ${p.pending} sin responder` : '📋 completo' })(), h.contact_phone && '📞'),
    brief: (() => { const p = qaProgress(h, m.criteria); return join(`📋 ${p.done}/${p.total}`, p.later > 0 && `🕓 ${p.later}`, brief.deal.length > 0 && `${brief.deal.length} ideas`) })(),
    oferta: lastOffer ? join(`${price(lastOffer.amount_cents)}`, OFFER_STATUS[lastOffer.status]?.toLowerCase(), offers.length > 1 && `${offers.length} ofertas`) : join('sin oferta', rec && `recomendada ~${priceShort(rec.open)}`),
    enlaces: nLinks ? `${nLinks} enlace${nLinks > 1 ? 's' : ''}` : 'sin enlaces',
    fotos: nPhotos ? `${nPhotos} foto${nPhotos > 1 ? 's' : ''}` : 'sin fotos',
    notas: h.notes ? h.notes.replace(/\s+/g, ' ').slice(0, 60) + (h.notes.length > 60 ? '…' : '') : 'sin notas'
  }
}
export const statusIcon = (st?: string) => (st === 'ok' ? '✅' : st === 'warn' ? '⚠️' : st === 'bad' ? '❌' : '¿?')
export const schoolShort = (s: NearSchool) => (s.type_abbr === 'CP INF-PRI' ? 'CEIP' : s.type_abbr === 'IES' ? 'IES' : OWN_LABEL[s.ownership])

/** Veredicto en 4 casillas: criterios, riesgos, colegio y oferta (cada una lleva a su detalle) */
export function Verdict({ h, m, onGo }: { h: Home; m: Mudanza; onGo: (k: GroupKey) => void }) {
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

/** 💬 Ideas para negociar (salen de la ficha) */
export function DealIdeas({ h, m }: { h: Home; m: Mudanza }) {
  const deal = briefLists(h, m).deal
  if (!deal.length) return null
  return (
    <details className="rounded-xl bg-card p-3">
      <summary className="font-semibold text-[14px] cursor-pointer">💬 Ideas para negociar ({deal.length})</summary>
      <div className="flex flex-col gap-0.5 mt-1">{deal.map(x => <span key={x} className="text-[13px] text-muted">· {x}</span>)}</div>
    </details>
  )
}

/** En el Resumen de la ficha: la nota y de dónde sale */
export function ScoreCard({ h, m }: { h: Home; m: Mudanza }) {
  const school = useNearestSchool(h)
  const s = homeScore(h, m, school?.dist ?? null)
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-3 text-left">
        <ScoreBadge s={s} big />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="font-bold text-[15px]">Nota de la casa</span>
          <span className="text-[12px] text-muted">
            {s.penalty ? `${fmtScore(s.before)} − ${s.penalty.pct} % por imprescindibles que no cumple` : s.provisional ? 'Provisional: faltan datos (*)' : 'Con vuestros criterios y pesos'}
          </span>
        </span>
        <span className="text-sm font-semibold text-accent">{open ? 'Ocultar' : 'Por qué'}</span>
      </button>
      <div className="flex flex-col gap-1">
        {s.blocks.map(b => (
          <div key={b.k} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[13px]">
              <span className="w-40 shrink-0 truncate">{b.icon} {b.label}</span>
              <span className="flex-1 h-2 rounded-full bg-bg overflow-hidden"><span className={`block h-full ${scoreTone(b.score).split(' ')[0]} ${b.missing ? 'opacity-40' : ''}`} style={{ width: `${b.score * 10}%` }} /></span>
              <span className="w-8 text-right font-semibold">{fmtScore(b.score)}</span>
              <span className="w-9 text-right text-[11px] text-muted">{b.weight} %</span>
            </span>
            {open && b.why.map(w => <span key={w} className="text-[12px] text-muted pl-5">· {w}</span>)}
          </div>
        ))}
        {s.penalty && s.penalty.items.map(x => (
          <span key={x.label} className="text-[13px] text-danger font-semibold">−{x.pct} % por no cumplir: {x.label.toLowerCase()}{x.near ? ' (por poco)' : ''}</span>
        ))}
      </div>
      {open && <p className="text-[11px] text-muted">Los pesos se cambian en «Qué buscamos». Vuestra opinión solo cuenta cuando habéis puntuado la casa (1 a 10).</p>}
    </div>
  )
}

export type EditFocus = 'datos' | 'gastos' | 'contacto' | 'fotos' | 'reforma' | 'honorarios' | 'compra' | 'zona' | 'enlaces'

/**
 * Ficha de un piso: pensada para decidir qué hacer con él (llamar, visitar, ofertar o descartar) y tener a mano lo
 * necesario. Arriba lo visual y la acción que toca; luego los datos de un vistazo, si conviene, el seguimiento y el resto.
 */
export function HomeSheet({ h, m, members, householdId, meId, onEdit, onClose, onReject, startGroup }: {
  h: Home; m: Mudanza; members: Member[]; householdId: string; meId: string; onEdit: (focus?: EditFocus) => void; onClose: () => void
  onReject: (r: RejectReason | null) => void; startGroup?: GroupKey | null
}) {
  const [visitSheet, setVisitSheet] = useState<{ open: boolean; visit?: HomeVisit }>({ open: false })
  const [offerSheet, setOfferSheet] = useState<{ open: boolean; offer?: HomeOffer }>({ open: false })
  const [discarding, setDiscarding] = useState(false)
  const [reason, setReason] = useState(h.discard_reason ?? '')
  const [cat, setCat] = useState<DiscardCategory | null>(h.discard_category)
  const [confirming, setConfirming] = useState(false)
  const adults = members.filter(x => x.kind === 'adult')
  const visits = m.homeVisits.filter(v => v.home_id === h.id)
  const myRatings = m.ratings.filter(r => r.home_id === h.id)
  const avg = myRatings.length ? myRatings.reduce((x, r) => x + r.score, 0) / myRatings.length : null
  const offers = m.homeOffers.filter(o => o.home_id === h.id)
  const maps = mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url })
  const setStatus = (status: HomeStatus, extra: Record<string, unknown> = {}) => m.write('homes', { status, ...extra }, h.id)
  // Título corto (el resto del nombre ya sale en la línea de lugar)
  const short = h.title.split(' · ')[0] || h.title
  const where = [h.address, h.zone, h.municipality].filter(Boolean).join(' · ')

  const nextV = visits.filter(v => v.status === 'scheduled' && v.visit_date >= today()).sort((x, y) => x.visit_date.localeCompare(y.visit_date))[0]
  const groups = useGroups(nextV ? ['resumen', 'visitas'] : ['resumen'])
  useEffect(() => { if (startGroup) groups.go(startGroup) }, [startGroup]) // eslint-disable-line react-hooks/exhaustive-deps
  const sum = useGroupLines(h, m, visits, offers, nextV)

  if (visitSheet.open) return <HomeVisitSheet home={h} visit={visitSheet.visit} adults={adults} m={m} onClose={() => setVisitSheet({ open: false })} />
  if (offerSheet.open) return <HomeOfferSheet home={h} offer={offerSheet.offer} m={m} onClose={() => setOfferSheet({ open: false })} />

  return (
    <Sheet title={short} onClose={onClose} variant="side">
      {/* 1. Cabecera visual */}
      <div className="-mt-3 flex flex-col gap-2">
        <Gallery h={h} m={m} onAdd={() => onEdit('fotos')} />
      </div>
      {/* 2. Lo que toca hacer ahora */}
      <PrimaryActions h={h} offers={offers}
        onVisit={() => setVisitSheet({ open: true })} onOffer={o => setOfferSheet({ open: true, offer: o })}
        onEdit={onEdit} onRecover={() => setStatus('interesa', { discard_reason: null, discard_category: null })} onReject={onReject} />
      {/* Estado y dónde está (la dirección abre Maps) */}
      <div className="flex flex-col gap-1.5">
        <select value={discarding ? 'descartado' : h.status} aria-label="Estado del piso"
          onChange={e => { const st = e.target.value as HomeStatus; if (st === 'descartado') setDiscarding(true); else { setDiscarding(false); void setStatus(st, { discard_reason: null, discard_category: null }) } }}
          className="w-full min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold">
          {(['propuesta', 'interesa', 'llamar', 'visita_pedida', 'visitado', 'favorito', 'oferta', 'descartado'] as HomeStatus[]).map(st => (
          <option key={st} value={st}>{st === 'favorito' ? '★ ' : st === 'llamar' ? '📞 ' : ''}{HOME_STATUS[st]}</option>
          ))}
        </select>
        {where && (maps
          ? <a href={maps} target="_blank" rel="noopener noreferrer" className="text-[14px] text-accent font-semibold min-h-9 flex items-start gap-1"><span>📍</span><span>{where} ↗</span></a>
          : <span className="text-[14px] flex items-start gap-1"><span>📍</span><span>{where}</span></span>)}
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


      {/* 3. El dinero y la nota, seguidos y siempre a la vista (fuera de los grupos plegables) */}
      <div className="flex flex-col gap-2">
        <TwoPrices h={h} m={m} budget={m.criteria?.max_price_cents ?? null} />
        <ScoreCard h={h} m={m} />
      </div>

      <Group k="resumen" g={groups} line={sum.resumen}>
        <Verdict h={h} m={m} onGo={groups.go} />
        <HomePrice h={h} m={m} />
      </Group>


      <Group k="analisis" g={groups} line={sum.analisis}>
        <DeepAnalysisPanel h={h} m={m} />
      </Group>

      <Group k="casa" g={groups} line={sum.casa}>
        <QuickFacts h={h} m={m} onEdit={onEdit} />
      </Group>

      <Group k="dinero" g={groups} line={sum.dinero}>
        <MonthlyCard h={h} onEdit={() => onEdit('gastos')} />
        <FeeCard h={h} onEdit={() => onEdit('honorarios')} />
        <HomeGastos h={h} onEdit={() => onEdit('compra')} />
      </Group>

      <Group k="reforma" g={groups} line={sum.reforma}>
        <HomeReforma h={h} onEdit={() => onEdit('reforma')} />
      </Group>

      <Group k="docs" g={groups} line={sum.docs} lineAlways>
        <HomeHealth h={h} m={m} householdId={householdId} embedded part="docs" />
      </Group>

      <Group k="estado" g={groups} line={sum.estado} lineAlways>
        <HomeHealth h={h} m={m} householdId={householdId} embedded part="estado" />
      </Group>

      <Group k="zona" g={groups} line={sum.zona} extra={<button onClick={() => onEdit('zona')} aria-label="Editar la zona" className="min-h-9 px-2 text-sm">✏️</button>}>
        {h.minutes_to_school != null && <span className="text-[14px]">🏫 {h.minutes_to_school} min al cole (vuestro cálculo)</span>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="self-start min-h-10 px-3 rounded-xl border border-line text-[13px] font-semibold text-accent flex items-center">📍 Cómo llegar ↗</a>}
        <HomeSchools h={h} m={m} />
      </Group>

      <Group k="visitas" g={groups} line={sum.visitas}
        extra={<button onClick={() => setVisitSheet({ open: true })} className="min-h-9 px-2 text-sm font-semibold text-accent">+ Visita</button>}>
        {visits.length === 0 ? <p className="text-sm text-muted">Aún no hay visitas. Las visitas salen en la Agenda.</p> : (
          visits.slice().sort((a, b) => b.visit_date.localeCompare(a.visit_date)).map(v => (
            <button key={v.id} onClick={() => setVisitSheet({ open: true, visit: v })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
              <span className="flex justify-between gap-2 text-[14px] font-semibold">
                <span>👀 Visita · {longDate(v.visit_date)} · {hhmm(v.start_time)}</span>
                <span className="text-[12px] text-muted shrink-0">{v.status === 'done' ? 'Hecha' : v.status === 'cancelled' ? 'Cancelada' : 'Prevista'}</span>
              </span>
              <VisitSummary v={v} members={members} />
            </button>
          ))
        )}
        {/* ⭐ Vuestra valoración: se puntúa aquí mismo (cuenta en la nota de la casa) */}
        <div className="bg-card rounded-xl p-3 flex flex-col gap-1">
          <span className="flex justify-between items-baseline gap-2">
            <span className="font-bold text-[15px]">⭐ Vuestra valoración</span>
            {avg != null && <span className="text-[13px] text-muted">media {avg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} de 10</span>}
          </span>
          <Stars h={h} m={m} adults={adults} rate={rateHome(m, householdId)} meId={meId} />
          {avg == null && <span className="text-[11px] text-muted">Del 1 al 10, tras verla: entra en la nota de la casa («Vuestra opinión»).</span>}
        </div>
        {/* Plegable: abierto si hay una visita prevista */}
        <details className="group mt-1" open={!!nextV}>
          <summary className="list-none cursor-pointer min-h-10 flex items-center justify-between gap-2">
            <span className="font-bold text-[15px]">📋 Cuestionario de la visita</span>
            <span className="text-[13px] text-muted flex items-center gap-1">
              {sum.brief}<span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div className="mt-1 flex flex-col gap-2">
            <VisitQA h={h} m={m} />
            <DealIdeas h={h} m={m} />
          </div>
        </details>
        <ContactCard h={h} onEdit={() => onEdit('contacto')} />
      </Group>

      <Group k="oferta" g={groups} line={sum.oferta}
        extra={<button onClick={() => setOfferSheet({ open: true })} className="min-h-9 px-2 text-sm font-semibold text-accent">+ Oferta</button>}>
        {offers.length === 0 ? <p className="text-sm text-muted">Aún no hay ofertas. La oferta recomendada está en el Resumen y las ideas para negociar, en Visitas.</p> : (
          offers.slice().sort((a, b) => b.offer_date.localeCompare(a.offer_date)).map(o => (
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
          ))
        )}
      </Group>

      <Group k="enlaces" g={groups} line={sum.enlaces} extra={<button onClick={() => onEdit('enlaces')} aria-label="Editar los enlaces" className="min-h-9 px-2 text-sm">✏️</button>}>
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

      {/* Notas generales del piso, abajo y a mano (se guardan solas) */}
      <Group k="notas" g={groups} line={sum.notas}>
        <NotesBox h={h} m={m} />
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
export function Gallery({ h, m, onAdd }: { h: Home; m: Mudanza; onAdd: () => void }) {
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
export function PrimaryActions({ h, offers, onVisit, onOffer, onEdit, onRecover, onReject }: {
  h: Home; offers: HomeOffer[]; onVisit: () => void; onOffer: (o?: HomeOffer) => void
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
        <button onClick={() => onEdit()} className={small}>✏️ Editar</button>
      </div>
    </div>
  )
}

/** Los dos precios que deciden: lo que piden (para ofertar) y lo que nos cuesta entrar a vivir (para comparar) */
export function TwoPrices({ h, m, budget }: { h: Home; m: Mudanza; budget: number | null }) {
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
          {perM2(h) != null && (
            <span className="text-[11px] text-muted">
              {price(perM2(h))}/m²{h.market?.paid_m2 ? ` · en la zona se firma a ~${Math.round(h.market.paid_m2).toLocaleString('es-ES')} €/m²` : ''}
            </span>
          )}
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
export function OfferLine({ h, m, compact }: { h: Home; m: Mudanza; compact?: boolean }) {
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
          <span className="text-[13px] text-muted min-w-0 truncate">{last ? <>Nuestra oferta <span className="text-[11px]">· {st}</span></> : 'Oferta → precio razonable'}</span>
          <span className="text-[15px] font-bold shrink-0">{last ? price(last.amount_cents) : <><span className="text-accent">~{priceShort(rec!.open)}</span> → {priceShort(rec!.max)}</>}</span>
        </span>
        <span className="text-[11px] text-muted text-right">si os la aceptan: entrar a vivir {priceShort(ready)}{fit ? <> · {fit}</> : null}</span>
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-2">
      {last ? (
        <div className="flex justify-between items-baseline gap-2">
          <span className="flex flex-col min-w-0">
            <span className="text-[13px] text-muted">Nuestra oferta</span>
            <span className="text-[11px] text-muted">{st}</span>
          </span>
          <span className="text-[20px] font-bold leading-tight shrink-0">{price(last.amount_cents)}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <span className="rounded-xl bg-accent-soft p-2.5 flex flex-col">
            <span className="text-[12px] text-muted">💡 Oferta inicial</span>
            <span className="text-[19px] font-bold text-accent leading-tight">~{price(rec!.open)}</span>
            <AiPrice app={rec!.open} ai={rec!.ai?.open ?? null} />
          </span>
          <span className="rounded-xl bg-bg p-2.5 flex flex-col">
            <span className="text-[12px] text-muted">🎯 Precio razonable (tope)</span>
            <span className="text-[19px] font-bold leading-tight">{price(rec!.max)}</span>
            <AiPrice app={rec!.max} ai={rec!.ai?.max ?? null} />
          </span>
        </div>
      )}
      {!last && rec && (
        <span className="text-[11px] text-muted">
          Calculado con vuestros datos · fiabilidad <b className={rec.confidence === 'alta' ? 'text-accent' : rec.confidence === 'media' ? 'text-[#C77A12]' : 'text-danger'}>{rec.confidence}</b>
          {rec.ai ? (rec.ai.gap != null && Math.abs(rec.ai.gap) > 0.1 ? <span className="text-[#C77A12]"> · la IA no coincide: mira el porqué en «Precio recomendado»</span> : ' · 🔬 = análisis a fondo con IA') : ' · haz el análisis a fondo para tener la opinión de la IA'}
        </span>
      )}
      <span className="text-[12px] text-muted text-right">si os la aceptan: entrar a vivir {price(ready)}{fit ? <> · {fit}</> : null}</span>
    </div>
  )
}


/** Lo que dice el análisis con IA debajo de lo calculado (en ámbar si se separa más de un 5 %) */
export function AiPrice({ app, ai }: { app: number; ai: number | null }) {
  if (ai == null) return null
  const off = Math.abs(ai / app - 1) > 0.05
  return <span className={`text-[12px] ${off ? 'text-[#C77A12] font-semibold' : 'text-muted'}`}>🔬 IA: {price(ai)}</span>
}



/** Los datos de un vistazo, con iconos; gastos al mes e imprescindibles */
export function QuickFacts({ h, m, onEdit }: { h: Home; m: Mudanza; onEdit: (focus?: EditFocus) => void }) {
  const [mustOpen, setMustOpen] = useState(false)
  const checks = mustHaveCheck(h, m.criteria)
  const met = checks.filter(c => c.ok).length
  const nice = niceCount(h, m.criteria)
  const [niceOpen, setNiceOpen] = useState(false)
  const acc = accessCount(h, m.criteria)
  const [accOpen, setAccOpen] = useState(false)
  const facts: [string, string][] = ([
    h.size_m2 && ['🏠', `${Number(h.size_m2)} m²${h.useful_m2 ? ` (${Number(h.useful_m2)} útiles)` : ''}`],
    h.plot_m2 && ['🌳', `parcela ${Number(h.plot_m2)} m²`],
    h.rooms != null && ['🛏', roomsLabel(h)!],
    h.baths != null && ['🛁', `${h.baths} baños`],
    h.floor && ['🏢', h.floor.length > 18 ? `${h.floor.slice(0, 18)}…` : h.floor],
    h.year_built && ['🏗', `de ${h.year_built}`],
    h.energy && ['⚡', `certif. ${h.energy}`],
    h.heating_type && ['🔥', HEATING[h.heating_type]],
    h.cooling && ['❄️', `aire: ${COOLING[h.cooling]}`]
  ].filter(Boolean) as [string, string][])
  // Extras que no estén ya dichos arriba (calefacción y aire van con su tipo)
  const extras = shownFeatures(h)
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
      {acc.want.length > 0 && (
        <>
          <button onClick={() => setAccOpen(!accOpen)} className="flex justify-between items-center text-left border-t border-line pt-2">
            <span className="text-[13px] text-muted">♿ Accesibilidad</span>
            <span className="text-[14px] font-semibold">{acc.got.length} de {acc.want.length} <span className="text-muted">{accOpen ? '▾' : '▸'}</span></span>
          </button>
          {accOpen && (
            <span className="flex gap-1 flex-wrap -mt-1">
              {acc.want.map(k => <Chip key={k} tone={acc.got.includes(k) ? 'ok' : 'unknown'}>{acc.got.includes(k) ? '✓' : '·'} {criteriaLabel(k)}</Chip>)}
            </span>
          )}
        </>
      )}
    </section>
  )
}

export function VisitSummary({ v, members }: { v: HomeVisit; members: Member[] }) {
  return (
    <span className="text-[12px] text-muted">
      {v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}
    </span>
  )
}

export function ContactCard({ h, onEdit }: { h: Home; onEdit: () => void }) {
  const has = h.contact || h.agency || h.contact_phone || h.contact_email || h.advertiser || h.listing_ref
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

/** «📆 Gastos al mes» en El dinero: comunidad, IBI y suministros (se editan en Editar → El dinero) */
export function MonthlyCard({ h, onEdit }: { h: Home; onEdit: () => void }) {
  const monthly = monthlyCost(h)
  const rows: [string, number][] = ([
    h.community_fee_cents != null && ['Comunidad', h.community_fee_cents],
    h.ibi_cents != null && ['IBI (anual / 12)', Math.round(h.ibi_cents / 12)],
    h.electricity_cents != null && ['Luz', h.electricity_cents],
    h.water_cents != null && ['Agua', h.water_cents],
    h.heating_cents != null && ['Calefacción', h.heating_cents]
  ].filter(Boolean) as [string, number][])
  return (
    <button onClick={onEdit} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1">
      <span className="flex justify-between items-center gap-2">
        <span className="font-bold text-[15px]">📆 Gastos al mes</span>
        <span className="text-[14px] font-semibold">{monthly != null ? `~${price(monthly)}` : <span className="text-sm" aria-hidden="true">✏️</span>}</span>
      </span>
      {rows.length ? (
        <span className="grid grid-cols-2 gap-x-3 text-[12px] text-muted">
          {rows.map(([l, v]) => <span key={l}>{l} {price(v)}</span>)}
        </span>
      ) : <span className="text-[13px] text-muted">+ Añadir comunidad, IBI y suministros</span>}
    </button>
  )
}

/** «💼 Honorarios» en El dinero: lo que cobra la agencia al comprador (se edita en Contacto) */
export function FeeCard({ h, onEdit }: { h: Home; onEdit: () => void }) {
  if (h.advertiser === 'particular') return null
  const amount = buyerFee(h) ?? 0
  return (
    <button onClick={onEdit} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1">
      <span className="flex justify-between items-center gap-2">
        <span className="font-bold text-[15px]">💼 Honorarios de la agencia</span>
        <span className="text-sm" aria-hidden="true">✏️</span>
      </span>
      {h.buyer_fee_kind ? (
        <span className="text-[14px]">
          <b>{feeLabel(h)}</b>{amount > 0 ? <span className="text-muted"> · ~{price(amount)} con IVA</span> : null}
          {amount > 0 && <span className="block text-[12px] text-muted">Incluidos en «Para entrar a vivir».</span>}
        </span>
      ) : <span className="text-[13px] text-[#C77A12]">Sin preguntar: pregunta si cobran algo al comprador (en Madrid suele pagar el vendedor).</span>}
      {h.buyer_fee_note && <span className="text-[12px] text-muted">{h.buyer_fee_note}</span>}
    </button>
  )
}

/** Notas y comentarios del piso: un único texto compartido, que se edita aquí mismo y se guarda solo */
export function NotesBox({ h, m }: { h: Home; m: Mudanza }) {
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

export function Photos({ h, m, householdId, kind }: { h: Home; m: Mudanza; householdId: string; kind: 'foto' | 'anuncio' }) {
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
