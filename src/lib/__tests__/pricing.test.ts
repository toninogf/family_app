import { describe, expect, it } from 'vitest'
import { recommend } from '../pricing'
import type { Home } from '../mudanza'
import { home } from './fixtures'

const market = { paid_m2: 2881, asking_m2: 3015 } as never
const cadastre = { built_m2: 256 } as never
/** Tres casas parecidas guardadas en la misma localidad (~2.500 €/m², en línea con la zona) */
const similar = (): Home[] => [1, 2, 3].map(i => home({ id: `s${i}`, price_cents: (630_000 + i * 10_000) * 100, size_m2: 250 + i * 5, plot_m2: 420 + i * 20 }))

describe('recommend · oferta y tope', () => {
  it('sin precio no hay recomendación', () => {
    expect(recommend(home({ price_cents: null }), [])).toBeNull()
  })
  it('oferta inicial ≤ tope ≤ lo que piden', () => {
    for (const h of [home({ market }), home({ market, price_cents: 900_000_00 }), home({ market, price_cents: 400_000_00 }), home()]) {
      const r = recommend(h, [h, ...similar()])!
      expect(r.open).toBeLessThanOrEqual(r.max)
      expect(r.max).toBeLessThanOrEqual(r.asking)
      expect(r.open).toBeGreaterThan(0)
    }
  })
  it('parte del precio más bajo al que está anunciada', () => {
    const h = home({ market, links: [{ label: 'fotocasa', url: 'https://x', price_cents: 590_000_00 }] as never })
    expect(recommend(h, [h])!.asking).toBe(590_000_00)
  })
  it('si el Catastro tiene muchos menos metros, vale menos', () => {
    const a = recommend(home({ market }), [])!
    const b = recommend(home({ market, cadastre: { built_m2: 180 } as never }), [])!
    expect(b.fair!).toBeLessThan(a.fair!)
  })
})

describe('recommend · fiabilidad', () => {
  it('alta: fuentes que coinciden, 3 parecidas y metros comprobados', () => {
    const h = home({ market, cadastre })
    const r = recommend(h, [h, ...similar()])!
    expect(r.confidence).toBe('alta')
  })
  it('sin Catastro no pasa de media', () => {
    const h = home({ market })
    expect(recommend(h, [h, ...similar()])!.confidence).toBe('media')
  })
  it('con menos de 3 parecidas no pasa de media', () => {
    const h = home({ market, cadastre })
    expect(recommend(h, [h, ...similar().slice(0, 1)])!.confidence).toBe('media')
  })
  it('si las referencias no coinciden entre sí, no es alta', () => {
    const h = home({ market: { paid_m2: 2000, asking_m2: 3500 } as never, cadastre })
    expect(recommend(h, [h, ...similar()])!.confidence).not.toBe('alta')
  })
  it('baja si el análisis con IA se separa más de un 10 %', () => {
    const h0 = home({ market, cadastre })
    const fair = recommend(h0, [h0, ...similar()])!.fair!
    const h = home({ market, cadastre, deep_analysis: { at: '2026-11-15', report: '', data: { precio: { justo: Math.round(fair / 100 * 0.85), oferta: 500_000, tope: 540_000 } } } })
    const r = recommend(h, [h, ...similar()])!
    expect(r.confidence).toBe('baja')
    expect(r.ai!.open).toBe(500_000_00)
    expect(r.ai!.gap!).toBeLessThan(-0.1)
  })
  it('si la IA coincide, no baja la fiabilidad', () => {
    const h0 = home({ market, cadastre })
    const fair = recommend(h0, [h0, ...similar()])!.fair!
    const h = home({ market, cadastre, deep_analysis: { at: '2026-11-15', report: '', data: { precio: { justo: Math.round(fair / 100 * 1.03) } } } })
    expect(recommend(h, [h, ...similar()])!.confidence).toBe('alta')
  })
  it('siempre explica por qué', () => {
    expect(recommend(home(), [])!.confidenceWhy.length).toBeGreaterThanOrEqual(3)
  })
})
