// Casas que ya no están a la venta (🏁): cuánto duraron y cuánto bajaron antes de irse.
// Las fechas son aproximadas: el alta es la del anuncio (o, si no se sabe, el día que la añadisteis) y la baja,
// el día en que os disteis cuenta. Por eso todo se muestra como «unos N días».
import type { Home, HomePrice } from './mudanza'

/** Precios de una casa en orden, sin repetir el mismo seguido */
export function priceTrail(homeId: string, prices: HomePrice[]): HomePrice[] {
  const xs = prices.filter(p => p.home_id === homeId).sort((a, b) => a.changed_on.localeCompare(b.changed_on))
  return xs.filter((p, i) => i === 0 || p.price_cents !== xs[i - 1].price_cents)
}

const day = (s: string) => Date.parse(s.slice(0, 10) + 'T12:00:00Z')
const diff = (a: string, b: string) => Math.round((day(b) - day(a)) / 864e5)

/** Desde cuándo estaba a la venta: la fecha del anuncio o, si no, cuando la añadisteis (y si es así, lo dice) */
export function listedSince(h: Pick<Home, 'listed_on' | 'created_at'>) {
  return h.listed_on ? { date: h.listed_on, exact: true } : { date: h.created_at.slice(0, 10), exact: false }
}

/** Días a la venta (hasta la baja o, si sigue, hasta hoy) */
export function daysOnMarket(h: Pick<Home, 'listed_on' | 'created_at' | 'off_market_on'>, today: string) {
  const since = listedSince(h)
  const until = h.off_market_on ?? today
  return { days: Math.max(0, diff(since.date, until)), from: since.date, exact: since.exact, ongoing: !h.off_market_on }
}

/** Cuánto bajó desde el primer precio conocido hasta el último (en %; positivo = bajó) */
export function dropPct(trail: HomePrice[]) {
  if (trail.length < 2) return 0
  const first = trail[0].price_cents, last = trail[trail.length - 1].price_cents
  return first ? Math.round(((first - last) / first) * 1000) / 10 : 0
}

export type MarketStats = {
  n: number; sold: number; withdrawn: number
  /** media de días a la venta (solo las que tienen fecha de baja) */
  avgDays: number | null
  /** cuántas de esas tienen la fecha de alta del anuncio (el resto se cuentan desde que las añadisteis: duraron más) */
  exactDates: number
  /** bajada media antes de irse (%) y cuántas bajaron */
  avgDrop: number; dropped: number
}

/** Resumen de las que ya no están a la venta */
export function offMarketStats(homes: Home[], prices: HomePrice[]): MarketStats {
  const gone = homes.filter(h => h.status === 'fuera')
  const dated = gone.filter(h => h.off_market_on)
  const days = dated.map(h => daysOnMarket(h, h.off_market_on!).days)
  const drops = gone.map(h => dropPct(priceTrail(h.id, prices)))
  return {
    n: gone.length,
    sold: gone.filter(h => h.off_market_kind === 'vendida').length,
    withdrawn: gone.filter(h => h.off_market_kind !== 'vendida').length,
    avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    exactDates: dated.filter(h => h.listed_on).length,
    avgDrop: drops.length ? Math.round((drops.reduce((a, b) => a + b, 0) / drops.length) * 10) / 10 : 0,
    dropped: drops.filter(d => d > 0).length
  }
}

/** A partir de cuántas se muestra la lectura del mercado */
export const MARKET_MIN = 4
