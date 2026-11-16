import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, homeScore, weightsOf } from '../score'
import { healthCounts } from '../health'
import type { Home, Rating } from '../mudanza'
import { criteria, home } from './fixtures'

const ctx = (c = criteria(), homes: Home[] = [], ratings: Rating[] = []) => ({ criteria: c, ratings, homes })
const block = (s: ReturnType<typeof homeScore>, k: string) => s.blocks.find(b => b.k === k)

describe('pesos', () => {
  it('sin nada guardado, los de serie', () => {
    expect(weightsOf(criteria())).toEqual(DEFAULT_WEIGHTS)
  })
  it('los pesos antiguos (30/25/15…) pasan a importancia 0–5 sin tocar los bloques nuevos', () => {
    const w = weightsOf(criteria({ score_weights: { musts: 30, price: 25, nice: 15, estado: 15, ubicacion: 15, opinion: 30 } }))
    expect([w.musts, w.price, w.nice, w.estado, w.ubicacion]).toEqual([5, 4, 3, 3, 3])
    expect(w.espacio).toBe(DEFAULT_WEIGHTS.espacio)
    expect(w.accesibilidad).toBe(DEFAULT_WEIGHTS.accesibilidad)
    expect(w.opinion).toBe(30)
  })
  it('el reparto real suma 100 (salvo redondeo)', () => {
    const s = homeScore(home(), ctx(criteria({ access_items: ['una_planta'], nice_to_haves: ['aire'] })))
    const sum = s.blocks.reduce((a, b) => a + b.weight, 0)
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(4)
  })
  it('un bloque con importancia 0 no cuenta', () => {
    const c = criteria({ score_weights: { ...DEFAULT_WEIGHTS, espacio: 0 } })
    expect(block(homeScore(home(), ctx(c)), 'espacio')!.weight).toBe(0)
  })
})

describe('bloques', () => {
  it('espacio: 256 m² y 440 m² de parcela con mínimos 200/300 e ideales 300/600 → 7,6', () => {
    // casa 5 + 5·56/100 = 7,8 · parcela 5 + 5·140/300 = 7,33 · media 7,57
    expect(block(homeScore(home(), ctx()), 'espacio')!.score).toBe(7.6)
  })
  it('espacio: por encima de lo ideal no suma más', () => {
    expect(block(homeScore(home({ size_m2: 500, plot_m2: 2000 }), ctx()), 'espacio')!.score).toBe(10)
  })
  it('espacio: por debajo del mínimo baja de 5', () => {
    expect(block(homeScore(home({ size_m2: 150, plot_m2: 150 }), ctx()), 'espacio')!.score).toBeLessThan(5)
  })
  it('accesibilidad: 3 de 5 (una planta cuenta también como dormitorio abajo) → 6', () => {
    const c = criteria({ access_items: ['parcela_llana', 'una_planta', 'dormitorio_pb', 'entrada_sin_escaleras', 'acceso_llano'] })
    expect(block(homeScore(home({ features: ['parcela_llana', 'una_planta'] }), ctx(c)), 'accesibilidad')!.score).toBe(6)
    expect(block(homeScore(home(), ctx(c)), 'accesibilidad')!.score).toBe(0)
  })
  it('lo que valoráis: con el 60 % ya es un 10', () => {
    const c = criteria({ nice_to_haves: ['aire', 'chimenea', 'trastero', 'porche', 'barbacoa'] })
    expect(block(homeScore(home({ features: ['chimenea', 'trastero', 'porche'] }), ctx(c)), 'nice')!.score).toBe(10)
    expect(block(homeScore(home({ features: ['chimenea'] }), ctx(c)), 'nice')!.score).toBe(3.3) // 10·1/(5·0,6)
  })
  it('estado: parte de 10 y resta 3 por ⛔, 1 por ⚠️ y la reforma', () => {
    const h = home({ health: { humedad: { s: 'bad' }, ruido: { s: 'warn' } } as never, reform: { state: 'parcial' } as never })
    const base = healthCounts(home()) // avisos automáticos (radón, etc.) de la casa sin datos
    const expected = 10 - (base.bad + 1) * 3 - (base.warn + 1) - 1
    expect(block(homeScore(h, ctx()), 'estado')!.score).toBe(Math.max(0, expected))
  })
  it('vuestra opinión: solo cuenta si hay notas, y es su media', () => {
    expect(block(homeScore(home(), ctx()), 'opinion')).toBeUndefined()
    const r = [{ home_id: 'h1', member_id: 'a', score: 8 }, { home_id: 'h1', member_id: 'b', score: 6 }, { home_id: 'otra', member_id: 'a', score: 1 }] as Rating[]
    const b = block(homeScore(home(), ctx(criteria(), [], r)), 'opinion')!
    expect(b.score).toBe(7)
    expect(b.weight).toBe(DEFAULT_WEIGHTS.opinion)
  })
  it('precio: pasarse del presupuesto baja la nota del bloque', () => {
    const ok = block(homeScore(home({ price_cents: 500_000_00 }), ctx()), 'price')!.score
    const over = block(homeScore(home({ price_cents: 720_000_00 }), ctx()), 'price')!.score
    expect(over).toBeLessThan(ok)
    expect(over).toBeLessThanOrEqual(3) // ~10 % por encima del tope
  })
})

describe('penalización por imprescindibles', () => {
  it('cada uno que no cumple quita un 30 % (de serie)', () => {
    const s = homeScore(home({ municipality: 'Galapagar' }), ctx())
    expect(s.penalty!.pct).toBe(30)
    expect(s.score).toBeCloseTo(s.before * 0.7, 0)
  })
  it('por poco quita la mitad', () => {
    const s = homeScore(home({ size_m2: 190 }), ctx())
    expect(s.penalty!.items[0].near).toBe(true)
    expect(s.penalty!.pct).toBe(15)
  })
  it('dos fallos se multiplican (0,7 · 0,7)', () => {
    const s = homeScore(home({ municipality: 'Galapagar', rooms: 2 }), ctx())
    expect(s.penalty!.pct).toBe(51)
  })
  it('el % es ajustable y con 0 no penaliza', () => {
    const c = criteria({ score_weights: { ...DEFAULT_WEIGHTS, penalty: 0 } })
    expect(homeScore(home({ municipality: 'Galapagar' }), ctx(c)).penalty).toBeNull()
  })
  it('si cumple todo no hay penalización', () => {
    const s = homeScore(home(), ctx())
    expect(s.penalty).toBeNull()
    expect(s.score).toBe(s.before)
  })
})

describe('nota', () => {
  it('siempre entre 0 y 10', () => {
    for (const h of [home(), home({ price_cents: 2_000_000_00, size_m2: 40, plot_m2: 0, rooms: 1, municipality: 'X' }), home({ price_cents: null, size_m2: null, plot_m2: null, rooms: null })]) {
      const s = homeScore(h, ctx())
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(10)
    }
  })
  it('sin precio es provisional', () => {
    expect(homeScore(home({ price_cents: null }), ctx()).provisional).toBe(true)
  })
  it('una casa mejor en todo saca más nota', () => {
    const c = criteria({ nice_to_haves: ['aire', 'chimenea'], access_items: ['una_planta'] })
    const good = homeScore(home({ price_cents: 520_000_00, size_m2: 300, plot_m2: 600, features: ['chimenea', 'una_planta'], cooling: 'splits' }), ctx(c))
    const bad = homeScore(home({ price_cents: 690_000_00, size_m2: 205, plot_m2: 310 }), ctx(c))
    expect(good.score).toBeGreaterThan(bad.score)
  })
})
