import { describe, expect, it } from 'vitest'
import { saleNet } from '../funds'
import { sale } from './fixtures'

describe('saleNet · lo que queda de la venta', () => {
  it('precio publicado − hipoteca − gastos', () => {
    const n = saleNet(sale())
    expect(n.sale).toBe(680_000_00)
    expect(n.net).toBe(566_950_00) // 680.000 − 100.000 − 13.050
    expect(n.fromOffer).toBe(false)
  })
  it('la oferta aceptada manda sobre el precio publicado', () => {
    const n = saleNet(sale({ accepted: 650_000_00 }))
    expect(n.sale).toBe(650_000_00)
    expect(n.net).toBe(536_950_00)
    expect(n.fromOffer).toBe(true)
  })
  it('el precio puesto a mano manda sobre todo', () => {
    const n = saleNet(sale({ accepted: 650_000_00 }), { price: 700_000_00 })
    expect(n.net).toBe(586_950_00)
    expect(n.manual).toBe(true)
    expect(n.fromOffer).toBe(false)
  })
  it('vender un 5 % por debajo', () => {
    expect(saleNet(sale(), { discount: 0.05 }).sale).toBe(646_000_00)
  })
  it('sin precio no hay cuenta', () => {
    const n = saleNet(sale({ price: null }))
    expect(n.sale).toBeNull()
    expect(n.net).toBeNull()
  })
  it('sin anuncio de venta', () => {
    expect(saleNet({ listing: null, offers: [] } as never).net).toBeNull()
  })
})
