// Precio recomendado de oferta para un piso de Buscamos, con todo lo que la app sabe de él.
// Es orientativo: combina referencias de la zona, los pisos parecidos que habéis guardado y los riesgos detectados.
import type { Home } from './mudanza'
import type { Health } from './health'
import { buyerFee, reformKnown, reformMid, valuePrice } from './reforma'
import { purchaseMid } from './gastos'

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const eur = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`
const round1k = (cents: number) => Math.round(cents / 100000) * 100000

/** Pisos parecidos guardados en la misma localidad: mismos metros ±40 % (sin descartados).
 *  Se comparan «para entrar a vivir»: precio + reforma estimada */
export function comparables(h: Home, homes: Home[]) {
  if (!h.municipality || !h.size_m2) return []
  const size = Number(h.size_m2)
  return homes
    .filter(x => x.id !== h.id && x.municipality === h.municipality && x.status !== 'descartado' && x.price_cents && x.size_m2)
    .filter(x => { const r = Number(x.size_m2) / size; return r >= 0.6 && r <= 1.4 })
    .map(x => ({ home: x, m2Price: valuePrice(x)! / 100 / Number(x.size_m2), reform: reformMid(x) }))
    .sort((a, b) => a.m2Price - b.m2Price)
}

/** Línea de la zona: lo que se pide en portales y lo que se paga en notaría, frente al €/m² de este piso */
export function zoneLine(h: Home) {
  const mk = h.market
  if (!mk || (!mk.paid_m2 && !mk.asking_m2)) return null
  const ours = h.price_cents && h.size_m2 ? h.price_cents / 100 / Number(h.size_m2) : null
  return [
    mk.asking_m2 && `se pide ~${eur(mk.asking_m2)}/m² en portales`,
    mk.paid_m2 && `se paga ~${eur(mk.paid_m2)}/m² en notaría`,
    ours && `este piso: ${eur(ours)}/m²`
  ].filter(Boolean).join(' · ')
}

export type Recommendation = {
  asking: number; open: number; max: number; fair: number | null
  /** Reforma estimada (céntimos) y lo que valdría ya reformado */
  reform: number; fee: number; costs: number; fairReady: number | null; reformKnown: boolean
  confidence: 'alta' | 'media' | 'baja'; reasons: string[]; warnings: string[]
}

/** Oferta inicial y tope razonable (en céntimos), con el porqué */
export function recommend(h: Home, homes: Home[]): Recommendation | null {
  if (!h.price_cents) return null
  const reasons: string[] = []
  const warnings: string[] = []
  const health = (h.health ?? {}) as Health

  // Precio de partida: el más bajo al que está anunciado
  const cheaper = (h.links ?? []).filter(l => l.price_cents && l.price_cents < h.price_cents!)
  const asking = Math.min(h.price_cents, ...cheaper.map(l => l.price_cents!))
  if (asking < h.price_cents) reasons.push(`Se parte de ${eur(asking / 100)}, el precio más bajo al que está anunciado (${cheaper.map(l => l.label).join(', ')})`)

  // Metros que cuentan: si el Catastro tiene bastantes menos, se valora con los del Catastro
  let m2 = h.size_m2 ? Number(h.size_m2) : null
  const cad = h.cadastre
  if (m2 && cad?.built_m2 && cad.built_m2 < m2 * 0.85) {
    reasons.push(`Se valoran los ${cad.built_m2} m² del Catastro, no los ${m2} del anuncio (lo no registrado no se paga igual)`)
    m2 = cad.built_m2
  }

  // Referencias de €/m² (lo que se paga de verdad pesa más)
  const refs: { v: number; w: number; label: string }[] = []
  const big = m2 != null && m2 > 180
  if (h.market?.paid_m2) refs.push({ v: h.market.paid_m2 * (big ? 0.9 : 1), w: 0.45, label: `notaría de la zona ${eur(h.market.paid_m2)}/m²${big ? ' (−10 % por ser grande)' : ''}` })
  const comps = comparables(h, homes)
  if (comps.length) {
    const med = median(comps.map(c => c.m2Price))
    refs.push({ v: med * 0.92, w: comps.length >= 2 ? 0.4 : 0.2, label: `${comps.length} parecido${comps.length > 1 ? 's' : ''} que habéis guardado, mediana ${eur(med)}/m² para entrar a vivir (−8 % de negociación habitual)` })
  }
  if (h.market?.asking_m2) refs.push({ v: h.market.asking_m2 * 0.9 * (big ? 0.9 : 1), w: 0.15, label: `portales de la zona ${eur(h.market.asking_m2)}/m² (−10 % de lo pedido a lo pagado)` })

  const reform = reformMid(h)
  const known = reformKnown(h.reform)
  let fair: number | null = null
  let fairReady: number | null = null
  if (refs.length && m2) {
    const wsum = refs.reduce((s, r) => s + r.w, 0)
    let perM2 = refs.reduce((s, r) => s + r.v * r.w, 0) / wsum
    reasons.push(`Valor de referencia con: ${refs.map(r => r.label).join('; ')}`)

    // Ajustes por lo que se sabe del piso
    const adj: [number, string][] = []
    if (h.flood?.t100 != null) adj.push([-0.10, 'zona inundable cada 100 años'])
    else if (h.flood?.t500 != null) adj.push([-0.03, 'zona inundable cada 500 años'])
    if (h.energy && 'FG'.includes(h.energy)) adj.push([-0.02, `certificado energético ${h.energy}`])
    if (h.energy && 'AB'.includes(h.energy)) adj.push([0.01, `certificado energético ${h.energy}`])
    if (health.ite?.s === 'bad' || health.ite?.s === 'warn') adj.push([-0.03, 'ITE o licencias por revisar'])
    if (health.urbanizacion?.s === 'bad' || health.urbanizacion?.s === 'warn') adj.push([-0.02, 'urbanización no recepcionada o con cuota'])
    if (health.saneamiento?.s === 'warn') adj.push([-0.01, 'fosa séptica o pozo'])
    if (h.features?.includes('placas_solares')) adj.push([0.01, 'placas solares'])
    // El estado se cuenta con la reforma (si está valorada); si no, con un ajuste aproximado
    if (!known) {
      if (h.features?.includes('reformado')) adj.push([0.02, 'reformado'])
      else if (h.year_built && h.year_built < 1985) adj.push([-0.02, `construido en ${h.year_built} sin reformar`])
    }
    const plots = comps.map(c => Number(c.home.plot_m2)).filter(Boolean)
    if (h.plot_m2 && plots.length) {
      const mp = median(plots)
      if (Number(h.plot_m2) > mp * 1.5) adj.push([0.03, `parcela grande (${Number(h.plot_m2)} m² frente a ${Math.round(mp)})`])
      else if (Number(h.plot_m2) < mp * 0.6) adj.push([-0.03, `parcela pequeña (${Number(h.plot_m2)} m² frente a ${Math.round(mp)})`])
    }
    const total = adj.reduce((s, [a]) => s + a, 0)
    if (adj.length) reasons.push(`Ajustes: ${adj.map(([a, l]) => `${l} ${a > 0 ? '+' : ''}${Math.round(a * 100)} %`).join(', ')}`)
    perM2 *= 1 + total
    fairReady = Math.round(perM2 * m2 * 100)
    const fee = buyerFee(h) ?? 0
    fair = fairReady - reform - fee
    if (reform || fee) reasons.push(`Para entrar a vivir valdría ~${eur(fairReady / 100)}; menos ${[reform && `la reforma estimada (~${eur(reform / 100)})`, fee && `los honorarios de la inmobiliaria (~${eur(fee / 100)})`].filter(Boolean).join(' y ')} queda en ~${eur(fair / 100)} tal cual está`)
  } else {
    warnings.push('Faltan referencias de la zona o pisos parecidos: pídeselo a la IA (precio de la zona) y guarda más pisos de esa localidad.')
  }

  // Oferta inicial y tope
  let open: number, max: number
  if (fair != null && asking > fair * 1.05) {
    open = fair * 0.95
    max = Math.min(asking, fair * 1.02)
    reasons.push(`Está pedido un ${Math.round((asking / fair - 1) * 100)} % por encima del valor de referencia: hay margen para negociar`)
  } else if (fair != null) {
    open = asking * 0.93
    max = Math.min(asking, Math.max(fair * 1.02, asking * 0.97))
    reasons.push(asking < fair * 0.95 ? `Está por debajo del valor de referencia (${eur(fair / 100)}): buen precio, no conviene apretar mucho` : 'Está en precio de mercado')
  } else {
    open = asking * 0.92
    max = asking * 0.97
  }
  const days = Math.floor((Date.now() - new Date(h.created_at).getTime()) / 86400000)
  if (days > 60) { open *= 0.98; reasons.push(`Lleváis ${days} días viéndolo anunciado: suele dar más margen`) }
  // Una oferta por debajo de ~80 % de lo que piden casi nunca abre negociación: si la referencia sale tan baja,
  // lo normal es que falle un dato (metros) o que esté muy caro; se limita y se avisa
  let clamped = false
  if (open < asking * 0.82) { open = asking * 0.82; clamped = true }
  if (max < asking * 0.88) { max = asking * 0.88; clamped = true }
  open = round1k(Math.min(open, max))
  max = round1k(max)

  if (health.ocupacion?.s === 'bad') warnings.push('Puede estar alquilada u ocupada: no ofertéis hasta aclararlo.')
  if (health.vpo?.s === 'bad') warnings.push('Puede ser vivienda protegida: tiene precio máximo y requisitos para comprarla.')
  if (health.nota_simple?.s === 'bad') warnings.push('La nota simple tiene cargas: la oferta debe incluir que se cancelen antes o en la firma.')
  if (clamped && fair != null) warnings.push(`El valor de referencia (${eur(fair / 100)}) sale un ${Math.round((1 - fair / asking) * 100)} % por debajo de lo que piden. Revisa los metros (¿son construidos? ¿cuenta toda la casa?): si están bien, está muy caro. La oferta se limita a no bajar más de un 18 %.`)
  if (!h.cadastre) warnings.push('Consulta el Catastro para comprobar los metros antes de ofertar.')
  if (h.advertiser !== 'particular' && !h.buyer_fee_kind) warnings.push('Pregunta a la inmobiliaria si cobra honorarios al comprador: se suman al coste.')
  if (!known) warnings.push('Valora la reforma (aunque sea «para entrar a vivir»): así todos los pisos se comparan con el mismo baremo.')

  const sources = refs.length + (h.cadastre ? 1 : 0)
  const confidence = clamped ? 'baja' : refs.length >= 2 && comps.length >= 2 ? 'alta' : sources >= 2 ? 'media' : 'baja'
  return { asking, open, max, fair, fairReady, reform, fee: buyerFee(h) ?? 0, costs: purchaseMid(h), reformKnown: known, confidence, reasons, warnings }
}
