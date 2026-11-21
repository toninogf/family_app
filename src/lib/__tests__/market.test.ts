import { describe, expect, it } from 'vitest'
import { daysOnMarket, dropPct, offMarketStats, priceTrail } from '../market'
import { home } from './fixtures'

const P = (home_id: string, price_cents: number, changed_on: string) => ({ home_id, price_cents, changed_on })

describe('casas que ya no están a la venta', () => {
  it('historial sin repetidos y bajada', () => {
    const t = priceTrail('a', [P('a', 690, '2026-10-01'), P('b', 1, '2026-10-01'), P('a', 690, '2026-10-05'), P('a', 650, '2026-10-20')])
    expect(t.map(x => x.price_cents)).toEqual([690, 650])
    expect(dropPct(t)).toBe(5.8)
    expect(dropPct([P('a', 1, '2026-10-01')])).toBe(0)
  })
  it('días a la venta: desde el anuncio o desde que la añadisteis', () => {
    expect(daysOnMarket({ listed_on: '2026-10-01', created_at: '2026-10-10T10:00:00Z', off_market_on: '2026-11-15' }, '2026-11-21')).toEqual({ days: 45, from: '2026-10-01', exact: true, ongoing: false })
    const d = daysOnMarket({ listed_on: null, created_at: '2026-11-01T10:00:00Z', off_market_on: null }, '2026-11-21')
    expect(d.days).toBe(20); expect(d.exact).toBe(false); expect(d.ongoing).toBe(true)
  })
  it('resumen', () => {
    const hs = [
      home({ id: 'a', status: 'fuera', off_market_kind: 'vendida', listed_on: '2026-10-01', off_market_on: '2026-10-31' }),
      home({ id: 'b', status: 'fuera', off_market_kind: 'retirada', listed_on: null, created_at: '2026-10-01T09:00:00Z', off_market_on: '2026-11-20' }),
      home({ id: 'c', status: 'visitado' })
    ]
    const s = offMarketStats(hs, [P('a', 700, '2026-10-01'), P('a', 630, '2026-10-20'), P('b', 500, '2026-10-01')])
    expect(s.n).toBe(2); expect(s.sold).toBe(1); expect(s.withdrawn).toBe(1)
    expect(s.avgDays).toBe(40); expect(s.exactDates).toBe(1)
    expect(s.avgDrop).toBe(5); expect(s.dropped).toBe(1)
  })
})
