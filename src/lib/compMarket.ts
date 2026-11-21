// «📊 Cómo se mueve el mercado» (Vendemos): los pisos parecidos al vuestro que entran y salen, cuánto tardan en irse
// y cuánto bajan antes. Las fechas son aproximadas: la búsqueda pasa dos veces por semana y, si el anuncio no dice
// cuándo se publicó, se cuenta desde que lo encontramos (sale algo menos de lo real).
import type { Competitor, Listing } from './mudanza'
import { adjTotal, adjustments } from './venta'

const day = (s: string) => Date.parse(s.slice(0, 10) + 'T12:00:00Z')
const diff = (a: string, b: string) => Math.round((day(b) - day(a)) / 864e5)
const addDays = (s: string, n: number) => new Date(day(s) + n * 864e5).toISOString().slice(0, 10)
export const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Desde cuándo estaba a la venta (el anuncio o, si no, cuando lo encontramos) */
export const compSince = (c: Pick<Competitor, 'listed_on' | 'first_seen'>) => ({ date: c.listed_on ?? c.first_seen, exact: !!c.listed_on })

/** Días a la venta: hasta la salida (punto medio entre la última vez visto y el día que ya no estaba) o hasta hoy */
export function compDays(c: Pick<Competitor, 'listed_on' | 'first_seen' | 'off_market_on' | 'off_market_after' | 'status'>, today: string) {
  const since = compSince(c)
  let until = today
  if (c.status !== 'activo' && c.off_market_on) {
    const after = c.off_market_after && c.off_market_after < c.off_market_on ? c.off_market_after : c.off_market_on
    until = addDays(after, Math.floor(diff(after, c.off_market_on) / 2))
  }
  return { days: Math.max(0, diff(since.date, until)), exact: since.exact, ongoing: c.status === 'activo' }
}

/** «entre el 17 y el 20 nov» */
export function exitRange(c: Pick<Competitor, 'off_market_on' | 'off_market_after'>) {
  if (!c.off_market_on) return null
  const f = (d: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00Z'))
  return c.off_market_after && c.off_market_after < c.off_market_on ? `entre el ${f(c.off_market_after)} y el ${f(c.off_market_on)}` : `el ${f(c.off_market_on)}`
}

/** Bajada desde el primer precio (en %; positivo = bajó) */
export function compDrop(c: Pick<Competitor, 'first_price_cents' | 'price_cents' | 'price_history'>) {
  const first = c.price_history[0]?.cents ?? c.first_price_cents
  const last = c.price_cents ?? c.price_history[c.price_history.length - 1]?.cents
  return first && last ? Math.round(((first - last) / first) * 1000) / 10 : 0
}

export type CompMarket = {
  active: number
  /** últimas 4 semanas */
  newIn: number; soldOut: number; withdrawnOut: number
  /** se han ido (vendidos o retirados) con fecha de salida */
  gone: number; sold: number
  medianDays: number | null; medianDaysSold: number | null
  /** cuántos de los que se fueron tenían la fecha de publicación (el resto, aproximado a la baja) */
  exact: number
  droppedShare: number | null; avgDrop: number | null
  /** €/m² corregido al vuestro: mediana de los vendidos y de los que siguen a la venta */
  soldM2: number | null; activeM2: number | null; ourM2: number | null
  /** días que lleváis vosotros (desde la publicación) */
  ourDays: number | null
  relisted: number
}

/** Hacen falta unos cuantos para dar medias */
export const MARKET_MIN_GONE = 3

export function compMarket(comps: Competitor[], ours: Listing | null, today: string): CompMarket {
  const cs = comps.filter(c => c.review == null)
  const since28 = addDays(today, -28)
  const gone = cs.filter(c => c.status !== 'activo' && c.off_market_on)
  const sold = gone.filter(c => c.status === 'vendido')
  const m2 = (c: Competitor) => {
    if (!c.price_cents || !c.size_m2) return null
    const raw = c.price_cents / Number(c.size_m2)
    return ours ? raw * (1 + adjTotal(adjustments(ours, c)) / 100) : raw
  }
  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x != null)
  const drops = gone.map(compDrop)
  return {
    active: cs.filter(c => c.status === 'activo').length,
    newIn: cs.filter(c => compSince(c).date >= since28).length,
    soldOut: sold.filter(c => c.off_market_on! >= since28).length,
    withdrawnOut: gone.filter(c => c.status === 'retirado' && c.off_market_on! >= since28).length,
    gone: gone.length, sold: sold.length,
    medianDays: median(gone.map(c => compDays(c, today).days)),
    medianDaysSold: median(sold.map(c => compDays(c, today).days)),
    exact: gone.filter(c => c.listed_on).length,
    droppedShare: gone.length ? Math.round((drops.filter(d => d > 0).length / gone.length) * 100) : null,
    avgDrop: drops.filter(d => d > 0).length ? Math.round((drops.filter(d => d > 0).reduce((a, b) => a + b, 0) / drops.filter(d => d > 0).length) * 10) / 10 : null,
    soldM2: median(nums(sold.map(m2))),
    activeM2: median(nums(cs.filter(c => c.status === 'activo').map(m2))),
    ourM2: ours?.price_cents && ours.size_m2 ? ours.price_cents / Number(ours.size_m2) : null,
    ourDays: ours?.published_on ? Math.max(0, diff(ours.published_on, today)) : null,
    relisted: cs.filter(c => c.relisted > 0).length
  }
}
