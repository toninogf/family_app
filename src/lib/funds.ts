// Una sola fuente para el dinero de la mudanza:
// · lo que deja la venta → saleNet (aquí), a partir de Vendemos
// · los ahorros → «🧮 ¿Hasta dónde podemos llegar?» (search_criteria.finance.savings_cents); Compramos lee y escribe ahí
// · la hipoteca elegida → Compramos (purchase.loan_cents)
import type { Mudanza } from './mudanza'

export type SaleSide = Pick<Mudanza, 'offers' | 'listing'>

/**
 * «¿Cuánto nos queda?»: precio − hipoteca pendiente − gastos de la venta.
 * El precio es, por orden: el puesto a mano (price), la oferta aceptada o el publicado; discount lo rebaja (0,05 = 5 %).
 */
export function saleNet(m: SaleSide, opt: { price?: number | null; discount?: number } = {}) {
  const accepted = m.offers.find(o => o.status === 'accepted')
  const manual = opt.price != null
  const base = opt.price ?? accepted?.amount_cents ?? m.listing?.price_cents ?? null
  const costs = (m.listing?.costs ?? []).reduce((s, c) => s + (c.cents || 0), 0)
  const mortgage = m.listing?.mortgage_cents ?? 0
  const sale = base == null ? null : Math.round(base * (1 - (opt.discount ?? 0)))
  return { sale, fromOffer: !!accepted && !manual, manual, costs, mortgage, net: sale != null ? sale - mortgage - costs : null }
}
