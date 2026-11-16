import { describe, expect, it } from 'vitest'
import { alerts, daysBetween, nextSteps, stages, timeline, type PlanInput } from '../plan'

const base = (p: Partial<PlanInput> = {}): PlanInput => ({
  today: '2026-11-16', listing: { price_cents: 680_000_00, published_on: '2026-10-01' }, buyerOffers: [], saleSteps: [],
  purchase: null, purchaseSteps: [], homeOffers: [], homes: [], ...p
})
const step = (kind: string, step_date: string | null, done = false) => ({ kind, title: kind, step_date, step_time: null, done, amount_cents: null }) as never

describe('plan de la mudanza', () => {
  it('cuenta días', () => { expect(daysBetween('2026-11-16', '2026-11-26')).toBe(10) })
  it('sin nada apuntado: en venta y buscando', () => {
    const s = stages(base())
    expect(s.venta.find(x => x.current)?.key).toBe('oferta')
    expect(s.compra.find(x => x.current)?.key).toBe('buscar')
    expect(nextSteps(base()).map(n => n.side)).toEqual(['venta', 'compra'])
    expect(alerts(base())).toEqual([])
  })
  it('avisa de arras de la compra antes que las de la venta', () => {
    const a = alerts(base({ saleSteps: [step('arras', '2026-12-10')], purchaseSteps: [step('arras', '2026-12-01')] }))
    expect(a[0].tone).toBe('bad')
    expect(a[0].text).toMatch(/antes que las de la venta/)
  })
  it('no avisa si la compra va sujeta a la venta', () => {
    const a = alerts(base({ purchase: { home_id: 'h', subject_to_sale: true, subject_to_mortgage: true, delivery_date: null, fein_date: null, mortgage_phase: null }, purchaseSteps: [step('arras', '2026-12-01')] }))
    expect(a.some(x => /arras/.test(x.text))).toBe(false)
  })
  it('escritura de la compra antes que la de la venta', () => {
    const a = alerts(base({ saleSteps: [step('firma', '2027-02-10')], purchaseSteps: [step('firma', '2027-02-01')] }))
    expect(a.some(x => x.tone === 'bad' && /préstamo puente/.test(x.text))).toBe(true)
  })
  it('días sin casa entre entregar y entrar', () => {
    const a = alerts(base({ saleSteps: [step('firma', '2027-02-01')], purchaseSteps: [step('firma', '2027-02-15')] }))
    expect(a.some(x => /14 días sin casa/.test(x.text))).toBe(true)
  })
  it('FEIN con menos de 10 días', () => {
    const a = alerts(base({ purchase: { home_id: 'h', subject_to_sale: false, subject_to_mortgage: true, delivery_date: null, fein_date: '2027-02-01', mortgage_phase: 'fein' }, purchaseSteps: [step('firma', '2027-02-06')] }))
    expect(a.some(x => /exige al menos 10/.test(x.text))).toBe(true)
  })
  it('línea de tiempo ordenada con los dos lados', () => {
    const t = timeline(base({ saleSteps: [step('firma', '2027-02-10')], purchaseSteps: [step('arras', '2026-12-01')],
      buyerOffers: [{ status: 'pending', amount_cents: 1, buyer_name: 'Ana', response_deadline: '2026-11-18', proposed_signing: null }] }))
    expect(t.map(x => x.side)).toEqual(['venta', 'compra', 'venta'])
    expect(t[0].title).toMatch(/Ana/)
  })
})
