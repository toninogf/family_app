// «🗺️ Plan de la mudanza»: la venta y la compra en una sola línea de tiempo, con los cruces que hay que vigilar
// (no firmar arras de la compra sin tener vendida la nuestra, el dinero de la venta antes de escriturar la compra,
// los 10 días de la FEIN, cuántos días os quedáis sin casa…). Sin IA: reglas sobre lo apuntado.
import type { BuyerOffer, Home, HomeOffer, Listing, SaleStep } from './mudanza'
import type { Purchase, PurchaseStep } from './compra'
import { addDays } from './dates'

export type Side = 'venta' | 'compra'
export type PlanItem = { date: string; time: string | null; side: Side; icon: string; title: string; detail?: string; done?: boolean; kind: string }
export type PlanAlert = { tone: 'bad' | 'warn' | 'info'; text: string }
export type PlanInput = {
  today: string
  listing: Pick<Listing, 'price_cents' | 'published_on'> | null
  buyerOffers: Pick<BuyerOffer, 'status' | 'amount_cents' | 'buyer_name' | 'response_deadline' | 'proposed_signing'>[]
  saleSteps: Pick<SaleStep, 'kind' | 'title' | 'step_date' | 'step_time' | 'done' | 'amount_cents'>[]
  purchase: Pick<Purchase, 'home_id' | 'subject_to_sale' | 'subject_to_mortgage' | 'delivery_date' | 'fein_date' | 'mortgage_phase'> | null
  purchaseSteps: Pick<PurchaseStep, 'kind' | 'title' | 'step_date' | 'step_time' | 'done' | 'amount_cents'>[]
  homeOffers: Pick<HomeOffer, 'home_id' | 'status' | 'amount_cents' | 'response_deadline'>[]
  homes: Pick<Home, 'id' | 'title' | 'status'>[]
}

/** Días entre dos fechas AAAA-MM-DD (b − a) */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)
const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const STEP_ICON: Record<string, string> = { reserva: '✍️', arras: '🤝', hipoteca: '🏦', firma: '🖋️', registro: '📚', suministros: '💡', otro: '📌' }

/** El paso de un tipo (el primero con fecha; si no, el primero) */
const stepOf = <T extends { kind: string; step_date: string | null }>(xs: T[], k: string) => xs.find(s => s.kind === k && s.step_date) ?? xs.find(s => s.kind === k)

export type Stage = { key: string; label: string; done: boolean; current: boolean }
/** En qué punto va cada lado */
export function stages(p: PlanInput): { venta: Stage[]; compra: Stage[] } {
  const sold = p.buyerOffers.some(o => o.status === 'accepted')
  const sDone = (k: string) => p.saleSteps.some(s => s.kind === k && s.done)
  const v = [
    { key: 'anuncio', label: 'En venta', done: !!p.listing?.published_on || !!p.listing?.price_cents },
    { key: 'oferta', label: 'Oferta aceptada', done: sold },
    { key: 'reserva', label: 'Reserva', done: sDone('reserva') },
    { key: 'arras', label: 'Arras', done: sDone('arras') },
    { key: 'firma', label: 'Escritura', done: sDone('firma') }
  ]
  const pDone = (k: string) => p.purchaseSteps.some(s => s.kind === k && s.done)
  const chosen = !!p.purchase?.home_id || p.homeOffers.some(o => o.status === 'accepted')
  const c = [
    { key: 'buscar', label: 'Elegida', done: chosen },
    { key: 'oferta', label: 'Oferta aceptada', done: p.homeOffers.some(o => o.status === 'accepted') },
    { key: 'reserva', label: 'Reserva', done: pDone('reserva') },
    { key: 'arras', label: 'Arras', done: pDone('arras') },
    { key: 'hipoteca', label: 'Hipoteca', done: pDone('hipoteca') || p.purchase?.mortgage_phase === 'oferta_vinculante' || p.purchase?.mortgage_phase === 'firmada' },
    { key: 'firma', label: 'Escritura', done: pDone('firma') }
  ]
  const mark = (xs: { key: string; label: string; done: boolean }[]) => {
    const i = xs.findIndex(x => !x.done)
    return xs.map((x, j) => ({ ...x, current: j === i }))
  }
  return { venta: mark(v), compra: mark(c) }
}

/** Todo lo que tiene fecha, de los dos lados, en orden */
export function timeline(p: PlanInput): PlanItem[] {
  const out: PlanItem[] = []
  for (const s of p.saleSteps) if (s.step_date) out.push({ date: s.step_date, time: s.step_time, side: 'venta', icon: STEP_ICON[s.kind] ?? '📌', title: s.title, done: s.done, kind: s.kind })
  for (const s of p.purchaseSteps) if (s.step_date) out.push({ date: s.step_date, time: s.step_time, side: 'compra', icon: STEP_ICON[s.kind] ?? '📌', title: s.title, done: s.done, kind: s.kind })
  for (const o of p.buyerOffers) {
    if (o.response_deadline && (o.status === 'pending' || o.status === 'countered'))
      out.push({ date: o.response_deadline, time: null, side: 'venta', icon: '⏳', title: `Responder a ${o.buyer_name || 'la oferta'}`, kind: 'plazo' })
    if (o.status === 'accepted' && o.proposed_signing && !p.saleSteps.some(s => s.kind === 'firma' && s.step_date))
      out.push({ date: o.proposed_signing, time: null, side: 'venta', icon: '🖋️', title: 'Firma que propone el comprador', detail: 'Aún no está en los pasos de la venta', kind: 'firma' })
  }
  for (const o of p.homeOffers) {
    if (o.response_deadline && (o.status === 'pending' || o.status === 'countered')) {
      const h = p.homes.find(x => x.id === o.home_id)
      out.push({ date: o.response_deadline, time: null, side: 'compra', icon: '⏳', title: `Respuesta a nuestra oferta${h ? ` · ${h.title}` : ''}`, kind: 'plazo' })
    }
  }
  if (p.purchase?.fein_date) out.push({ date: p.purchase.fein_date, time: null, side: 'compra', icon: '📄', title: 'FEIN del banco', kind: 'fein' })
  if (p.purchase?.delivery_date) out.push({ date: p.purchase.delivery_date, time: null, side: 'compra', icon: '🔑', title: 'Entrega de llaves de la nueva', kind: 'entrega' })
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || (a.side === 'venta' ? -1 : 1))
}

/** Firma de la venta: la del paso o, si no, la que propone el comprador aceptado */
function saleSigning(p: PlanInput) {
  return stepOf(p.saleSteps, 'firma')?.step_date ?? p.buyerOffers.find(o => o.status === 'accepted')?.proposed_signing ?? null
}

/** Los cruces entre la venta y la compra que pueden salir caros */
export function alerts(p: PlanInput): PlanAlert[] {
  const out: PlanAlert[] = []
  const sArras = stepOf(p.saleSteps, 'arras'), cArras = stepOf(p.purchaseSteps, 'arras')
  const sFirma = saleSigning(p), cFirma = stepOf(p.purchaseSteps, 'firma')?.step_date ?? null
  const sold = p.buyerOffers.some(o => o.status === 'accepted')
  const subjectToSale = !!p.purchase?.subject_to_sale

  // 1. Arras de la compra antes de tener la venta atada
  if (cArras?.step_date && !cArras.done) {
    const sAr = sArras?.step_date ?? null
    if ((!sAr || cArras.step_date < sAr) && !subjectToSale)
      out.push({ tone: 'bad', text: sAr
        ? `Las arras de la compra (${fmt(cArras.step_date)}) van antes que las de la venta (${fmt(sAr)}). Si la venta se cae, podéis perder las arras: firmad primero la venta o pedid la condición «sujeto a la venta de nuestra casa».`
        : `Vais a firmar arras de la compra (${fmt(cArras.step_date)}) sin arras de la venta. Si no vendéis a tiempo, podéis perderlas: pedid la condición «sujeto a la venta» o un plazo de escritura largo.` })
  }
  // 2. El dinero de la venta tiene que llegar antes de escriturar la compra
  if (cFirma && sFirma && cFirma < sFirma)
    out.push({ tone: 'bad', text: `La escritura de la compra (${fmt(cFirma)}) va antes que la de la venta (${fmt(sFirma)}): el dinero de la venta aún no estaría. Juntad las firmas el mismo día (primero la venta) o buscad un préstamo puente.` })
  else if (cFirma && !sFirma && !sold)
    out.push({ tone: 'warn', text: `Hay fecha de escritura de la compra (${fmt(cFirma)}) pero la nuestra aún no está vendida.` })
  // 3. Días sin casa entre entregar la nuestra y entrar en la nueva
  const enter = p.purchase?.delivery_date ?? cFirma
  if (sFirma && enter) {
    const gap = daysBetween(sFirma, enter)
    if (gap > 0) out.push({ tone: gap > 7 ? 'warn' : 'info', text: `Entre la entrega de la nuestra (${fmt(sFirma)}) y la entrada en la nueva (${fmt(enter)}) hay ${gap} día${gap === 1 ? '' : 's'} sin casa: pactad con el comprador quedaros un tiempo (entrega aplazada) o buscad dónde estar.` })
    else if (gap === 0) out.push({ tone: 'info', text: `Venta y compra el mismo día (${fmt(sFirma)}): pedid al notario firmar primero la venta y que la mudanza no dependa de las horas.` })
  }
  // 4. FEIN: la ley pide 10 días naturales entre la FEIN y la firma
  if (cFirma) {
    const fein = p.purchase?.fein_date
    if (fein && daysBetween(fein, cFirma) < 10)
      out.push({ tone: 'bad', text: `Entre la FEIN (${fmt(fein)}) y la firma (${fmt(cFirma)}) hay ${daysBetween(fein, cFirma)} días: la ley exige al menos 10 (más la visita al notario para el acta). Hay que mover la firma.` })
    else if (!fein && p.purchase?.subject_to_mortgage !== false && daysBetween(p.today, cFirma) <= 30)
      out.push({ tone: 'warn', text: `Para firmar el ${fmt(cFirma)} el banco tiene que daros la FEIN como tarde el ${fmt(addDays(cFirma, -10))} (mejor una semana antes).` })
  }
  // 5. Plazos de respuesta a punto de vencer
  for (const o of p.buyerOffers) if (o.response_deadline && (o.status === 'pending' || o.status === 'countered')) {
    const d = daysBetween(p.today, o.response_deadline)
    if (d >= 0 && d <= 2) out.push({ tone: 'warn', text: `Hay que responder a ${o.buyer_name || 'una oferta de compra'} ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'pasado mañana'}.` })
  }
  // 6. Comprador aceptado sin pasos apuntados
  if (sold && !p.saleSteps.some(s => s.step_date))
    out.push({ tone: 'info', text: 'Tenéis oferta aceptada: apuntad en Vendemos la fecha de reserva, arras y firma para cuadrarla con la compra.' })
  return out
}

/** Lo siguiente que toca, por lado (cuando aún no hay fechas que vigilar) */
export function nextSteps(p: PlanInput): { side: Side; text: string }[] {
  const st = stages(p)
  const out: { side: Side; text: string }[] = []
  const curV = st.venta.find(s => s.current)?.key
  const curC = st.compra.find(s => s.current)?.key
  const NEXT_V: Record<string, string> = {
    anuncio: 'Publicar la casa con precio',
    oferta: 'Conseguir una oferta (visitas, ajustar el precio si no llegan)',
    reserva: 'Firmar la reserva con el comprador y cobrarla por transferencia',
    arras: 'Firmar arras: pedid un plazo de escritura que os dé tiempo a comprar',
    firma: 'Escriturar la venta (cancelar la hipoteca pendiente ese día)'
  }
  const NEXT_C: Record<string, string> = {
    buscar: 'Elegir casa (🏁 Decidir en Buscamos)',
    oferta: 'Hacer la oferta y negociar',
    reserva: 'Reserva con condición de hipoteca (y de venta, si aún no habéis vendido)',
    arras: 'Arras: mejor después de las de la venta, o con condición de venta',
    hipoteca: 'Tasación, FEIN y oferta vinculante del banco (10 días antes de firmar)',
    firma: 'Escriturar el mismo día que la venta o después'
  }
  if (curV) out.push({ side: 'venta', text: NEXT_V[curV] })
  if (curC) out.push({ side: 'compra', text: NEXT_C[curC] })
  return out
}
