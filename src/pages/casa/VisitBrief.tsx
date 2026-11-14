// «🎯 Para la visita»: lo que hay que tener en cuenta en ESTA casa (dudas y argumentos para negociar).
// Sale de la ficha (estado, documentos, criterios, reforma, precio…): no guarda nada. Se usa en la ficha y en la pestaña Visitas.
import { allChecks } from '../../lib/health'
import { mustHaveCheck, price, type Home, type Mudanza } from '../../lib/mudanza'
import { recommend } from '../../lib/pricing'
import { buyerFee, kEur, rangeK, readyPrice, reformTotal } from '../../lib/reforma'

// Puntos de «Documentos» y «Estado de la vivienda» que no tiene sentido llevar (los automáticos)
const AUTO = ['catastro', 'inundable', 'radon', 'mercado', 'precio_zona']

export function briefLists(h: Home, m: Mudanza) {
  const checks = allChecks(h).filter(c => !AUTO.includes(c.key))
  const health = h.health ?? {}

  // ⚠️ Lo que ya sabéis que va mal o hay que confirmar
  const warn = checks.filter(c => c.item.s === 'bad' || c.item.s === 'warn').map(c => `${c.item.s === 'bad' ? '⛔' : '⚠️'} ${c.title}${c.item.n ? `: ${c.item.n}` : ''}`)

  // ❓ Imprescindibles que el anuncio no deja claros, y 🔨 los que faltan pero se pueden hacer
  const must = mustHaveCheck(h, m.criteria)
  const unsure = must.filter(c => c.ok === null).map(c => c.label)
  const viaReform = must.filter(c => c.ok === false && c.reform).map(c => `${c.label}: pedid que os orienten del coste (${c.reform!.label})`)

  // 🗣️ Preguntar (siempre lo básico + los datos que faltan)
  const ask: string[] = ['¿Cuánto tiempo lleva a la venta? ¿Ha habido ofertas?', '¿Qué se queda (muebles, electrodomésticos)? ¿Fechas de entrega?']
  if (h.community_fee_cents == null) ask.push('Gastos de comunidad al mes y qué incluyen')
  if (h.ibi_cents == null) ask.push('Último recibo del IBI')
  if (!h.energy) ask.push('Certificado energético')
  if (!h.year_built) ask.push('Año de construcción')
  if (h.advertiser !== 'particular' && !h.buyer_fee_kind) ask.push('¿Cobráis honorarios al comprador?')
  if (health.motivo?.s === 'unknown' || !health.motivo) ask.push('¿Por qué venden? (prisa, herencia, cambio de casa…)')

  // 👀 Mirar en persona (lo que sigue sin comprobar de «Estado de la vivienda»)
  const look = checks.filter(c => c.item.s === 'unknown' && c.key !== 'motivo').map(c => c.title)

  // 💬 Para negociar: argumentos que salen de los datos de esta casa
  const deal: string[] = []
  const rec = recommend(h, m.homes)
  if (rec) deal.push(`Oferta inicial ~${kEur(rec.open)} y tope razonable ~${kEur(rec.max)} (piden ${kEur(rec.asking)}).`)
  const rt = reformTotal(h.reform, h)
  if (rt && rt.hi > 0) deal.push(`Reforma estimada ${rangeK(rt.lo, rt.hi)}: llevad lo que veáis por escrito (fotos, presupuestos) para justificar la rebaja.`)
  for (const c of checks.filter(c => c.item.s === 'bad' || c.item.s === 'warn')) {
    deal.push(`${c.title}: si se confirma, pedid que lo resuelvan antes de firmar o que lo descuenten.`)
  }
  if (h.energy && ['E', 'F', 'G'].includes(h.energy.toUpperCase())) deal.push(`Certificado ${h.energy.toUpperCase()}: mejorar ventanas y aislamiento cuesta dinero y la factura será alta; es un argumento de precio.`)
  const fee = buyerFee(h) ?? 0
  if (fee > 0) deal.push(`Honorarios de ${price(fee)} a vuestro cargo: negociad que los asuma el vendedor o que se descuenten.`)
  const motive = health.motivo?.n
  if (motive) deal.push(`Motivo de venta: «${motive}». Si hay prisa, ofreced cierre rápido o flexibilidad de fechas a cambio de precio.`)
  const cheaper = (h.links ?? []).filter(l => l.price_cents != null && h.price_cents != null && l.price_cents < h.price_cents)
  if (cheaper.length) deal.push(`Está más barato en ${cheaper.map(l => l.label || 'otro portal').join(', ')}: partid de ese precio.`)
  const mk = h.market
  const perM2 = h.price_cents && h.size_m2 ? h.price_cents / 100 / Number(h.size_m2) : null
  if (mk?.paid_m2 && perM2 && perM2 > mk.paid_m2 * 1.1) deal.push(`Piden ${Math.round(perM2).toLocaleString('es-ES')} €/m² y en la zona se firma a ~${Math.round(mk.paid_m2).toLocaleString('es-ES')} €/m² (notarías).`)
  const ready = readyPrice(h)
  if (ready != null && m.criteria?.max_price_cents && ready > m.criteria.max_price_cents) deal.push(`Para entrar a vivir sale ~${kEur(ready)}, ${kEur(ready - m.criteria.max_price_cents)} por encima de vuestro presupuesto: no subáis del tope.`)
  const visits = m.homeVisits.filter(v => v.home_id === h.id && v.status === 'done').length
  deal.push(visits ? 'En la segunda visita, id con la oferta pensada y preguntad qué margen tienen.' : 'No mostréis entusiasmo delante del vendedor; las dudas, en voz alta.')

  return { warn, unsure, viaReform, ask, look, deal }
}

/** Cuántas cosas hay que mirar o preguntar (para los avisos de «¿Segunda visita?») */
export const briefCount = (h: Home, m: Mudanza) => { const l = briefLists(h, m); return l.warn.length + l.unsure.length + l.viaReform.length + l.look.length }

export function VisitBrief({ h, m, compact }: { h: Home; m: Mudanza; compact?: boolean }) {
  const { warn, unsure, viaReform, ask, look, deal } = briefLists(h, m)
  const block = (title: string, list: string[]) => list.length ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold">{title}</span>
      {list.map(x => <span key={x} className="text-[13px] text-muted">· {x}</span>)}
    </div>
  ) : null
  return (
    <div className={`flex flex-col gap-2.5 ${compact ? 'rounded-xl bg-bg p-3' : 'bg-card rounded-2xl p-4'}`}>
      {block('⚠️ Ojo con', warn)}
      {block('❓ Imprescindibles por confirmar', unsure)}
      {block('🔨 Faltan y se pueden hacer', viaReform)}
      {block('👀 Mirar en persona', look)}
      {block('🗣️ Preguntar', ask)}
      {block('💬 Para negociar', deal)}
      {!compact && <p className="text-[11px] text-muted">Sale de la ficha (estado, documentos, criterios, reforma y precio): se actualiza solo según vais apuntando.</p>}
    </div>
  )
}
