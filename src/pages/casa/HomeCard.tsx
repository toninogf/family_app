// Tarjeta de una casa en la lista de Buscamos
import { useState } from 'react'

import { hhmm, relativeDay, today } from '../../lib/dates'
import { mapsHref } from '../../lib/kids'
import { accessCount, mustHaveCheck, niceCount, perM2, portalName, price, roomsLabel, type RejectReason, discardLabel, type Home, type Mudanza } from '../../lib/mudanza'
import { buyingCosts, rangeK, readyPrice, reformTotal } from '../../lib/reforma'
import { OWN_LABEL, distLabel } from '../../lib/colegios'
import { homeScore } from '../../lib/score'
import { StatusBadge, CheckChip, shortTitle, useNearestSchool, ScoreBadge, LinkChips, kShort } from './BuscamosComun'
import { ReasonPicker } from './Rechazadas'

export function HomeCard({ h, m, cover, onOpen, picked, onPick, onReject }: {
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
  const sc = homeScore(h, m, school?.dist ?? null)

  const fails = checks.filter(c => c.ok === false)
  const viaReform = fails.filter(c => c.reform).length
  const unknown = checks.filter(c => c.ok == null).length
  const nice = niceCount(h, m.criteria)
  const acc = accessCount(h, m.criteria)
  const facts = [h.size_m2 && `${Number(h.size_m2)} m²`, h.plot_m2 && `parcela ${Number(h.plot_m2)} m²`, roomsLabel(h), h.baths != null && `${h.baths} baños`, pm2 && `${price(pm2)}/m²`,
    school && `🏫 ${school.type_abbr === 'CP INF-PRI' ? 'CEIP' : school.ownership === 'publico' ? 'Público' : OWN_LABEL[school.ownership]} a ${distLabel(school.dist)}`].filter(Boolean)
  const extra = [next && `📅 Visita ${relativeDay(next.visit_date).toLowerCase()} ${hhmm(next.start_time)}`].filter(Boolean)
  // Otros portales: solo se enseñan si alguno la tiene más barata; si no, «+N portales»
  const others = (h.links ?? []).filter(l => l.url !== h.url)
  const cheaper = others.filter(l => l.price_cents != null && h.price_cents != null && l.price_cents < h.price_cents)

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
        <span className="flex flex-col items-end gap-1 shrink-0">
          <ScoreBadge s={sc} />
          <StatusBadge s={h.status} />
        </span>
      </span>
      {(checks.length > 0 || nice.want.length > 0 || acc.want.length > 0) && (
        <span className="text-[13px]">
          {checks.length > 0 && <span className={fails.length ? '' : 'text-accent font-semibold'}>🎯 Cumple {checks.length - fails.length - unknown} de {checks.length}{unknown ? ` (${unknown} sin dato)` : ''}{viaReform ? <span className="text-[#C77A12]"> · 🔨 {viaReform} con reforma</span> : null}</span>}
          {checks.length > 0 && nice.want.length > 0 && <span className="text-muted"> · </span>}
          {nice.want.length > 0 && <span>⭐ {nice.got.length} de {nice.want.length} que valoramos{nice.viaReform.length ? <span className="text-[#C77A12]"> (+🔨{nice.viaReform.length})</span> : null}</span>}
          {acc.want.length > 0 && <><span className="text-muted"> · </span><span>♿ {acc.got.length} de {acc.want.length}</span></>}
        </span>
      )}
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
        {over && budget != null && ready != null && <span className="text-[12px] text-danger text-right">se pasa {kShort(ready - budget)} del presupuesto</span>}
      </span>
      {facts.length > 0 && <span className="text-[13px] text-muted">{facts.join(' · ')}</span>}
      {fails.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {fails.map(c => <CheckChip key={c.label} c={c} />)}
        </span>
      )}
      {extra.length > 0 && <span className="text-[13px] text-muted">{extra.join(' · ')}</span>}
      {h.status === 'descartado' && discardLabel(h) && <span className="text-[13px] text-muted">Descartado: {discardLabel(h)}</span>}
    </button>
    {cheaper.length > 0 ? <div className="px-4 pb-3 -mt-1"><LinkChips links={cheaper} ourPrice={h.price_cents} /></div>
      : others.length > 0 ? <span className="px-4 pb-3 -mt-1 text-[12px] text-muted">+{others.length} portal{others.length > 1 ? 'es' : ''} con el mismo precio</span> : null}
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
      <span className="flex-1" />
      {h.url && (
        <a href={h.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver el anuncio en ${portalName(h.url) ?? 'el portal'}`} title={portalName(h.url) ?? 'Anuncio'}
          className="min-h-11 w-14 flex items-center justify-center text-[17px] border-l border-line">🔗</a>
      )}
      {maps && (
        <a href={maps} target="_blank" rel="noopener noreferrer" aria-label="Cómo llegar (Maps)" title="Cómo llegar"
          className="min-h-11 w-14 flex items-center justify-center text-[17px] border-l border-line">📍</a>
      )}
      <button type="button" onClick={() => setAskDelete(true)} aria-label="Borrar la ficha" className="min-h-11 w-14 text-[16px] text-muted border-l border-line shrink-0">🗑️</button>
    </div>
    </div>
  )
}
