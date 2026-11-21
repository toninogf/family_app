import { describe, expect, it } from 'vitest'
import { compDays, compDrop, compMarket, exitRange } from '../compMarket'
import type { Competitor } from '../mudanza'

const C = (p: Partial<Competitor>): Competitor => ({
  id: 'c', title: 'Piso', url: null, zone: null, price_cents: 500_000_00, first_price_cents: 500_000_00, size_m2: 80, rooms: 2, baths: 1, floor: '2º',
  features: [], reform_year: null, condition: null, status: 'activo', first_seen: '2026-10-01', last_seen: '2026-11-20', price_history: [],
  notes: null, source: 'ia', community_fee_cents: null, heating_type: null, energy: null, building_state: null, derrama_cents: null, noise: null, light: null,
  year_built: null, building_reform_year: null, review: null, reject_reason: null,
  listed_on: null, off_market_on: null, off_market_after: null, relisted: 0, old_urls: [], ...p
} as Competitor)

describe('cómo se mueve el mercado', () => {
  it('días a la venta: hasta el punto medio de la salida', () => {
    const c = C({ status: 'vendido', listed_on: '2026-10-01', off_market_after: '2026-10-28', off_market_on: '2026-11-01' })
    expect(compDays(c, '2026-11-21')).toEqual({ days: 29, exact: true, ongoing: false })
    expect(exitRange(c)).toMatch(/^entre el 28 oct\.? y el 1 nov/)
    expect(compDays(C({}), '2026-11-21').days).toBe(51)
  })
  it('bajada desde el primer precio', () => {
    expect(compDrop(C({ price_history: [{ date: '2026-10-01', cents: 100 }, { date: '2026-10-20', cents: 95 }], price_cents: 95 }))).toBe(5)
    expect(compDrop(C({}))).toBe(0)
  })
  it('resumen', () => {
    const cs = [
      C({ id: 'a', status: 'vendido', listed_on: '2026-09-01', off_market_after: '2026-10-29', off_market_on: '2026-11-01', price_history: [{ date: '2026-09-01', cents: 100 }, { date: '2026-10-10', cents: 90 }], price_cents: 90, size_m2: null }),
      C({ id: 'b', status: 'retirado', first_seen: '2026-10-10', off_market_on: '2026-11-10' }),
      C({ id: 'd', first_seen: '2026-11-05' }),
      C({ id: 'e', review: 'propuesta' })
    ]
    const s = compMarket(cs, null, '2026-11-21')
    expect(s.active).toBe(1); expect(s.newIn).toBe(1)
    expect(s.soldOut).toBe(1); expect(s.withdrawnOut).toBe(1)
    expect(s.gone).toBe(2); expect(s.sold).toBe(1); expect(s.exact).toBe(1)
    expect(s.medianDaysSold).toBe(59)
    expect(s.droppedShare).toBe(50); expect(s.avgDrop).toBe(10)
  })
})

describe('plazos', () => {
  it('peso de los vendidos según cuándo se vendieron', async () => {
    const { soldWeight } = await import('../venta')
    const v = (d: string) => soldWeight({ status: 'vendido', off_market_on: d, last_seen: d }, '2026-11-21')
    expect(v('2026-10-01')).toBe(1)
    expect(v('2026-07-01')).toBe(0.5)
    expect(v('2026-03-01')).toBe(0)
    expect(soldWeight({ status: 'activo', off_market_on: null, last_seen: '2025-01-01' }, '2026-11-21')).toBe(1)
  })
  it('el panel ignora salidas de hace más de 6 meses', () => {
    const s = compMarket([C({ status: 'vendido', off_market_on: '2026-03-01' }), C({ status: 'retirado', off_market_on: '2026-11-01' })], null, '2026-11-21')
    expect(s.gone).toBe(1); expect(s.sold).toBe(0)
  })
})

describe('fecha de partida', () => {
  it('se queda con la más antigua', async () => {
    const { compSince } = await import('../compMarket')
    const { listedSince } = await import('../market')
    expect(compSince({ listed_on: '2026-11-15', first_seen: '2026-11-01' })).toEqual({ date: '2026-11-01', exact: false })
    expect(compSince({ listed_on: '2026-10-01', first_seen: '2026-11-01' })).toEqual({ date: '2026-10-01', exact: true })
    expect(listedSince({ listed_on: '2026-11-20', created_at: '2026-11-08T10:00:00Z' })).toEqual({ date: '2026-11-08', exact: false })
  })
})
