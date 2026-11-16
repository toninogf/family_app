import { describe, expect, it } from 'vitest'
import { beforeOffer, finalists, pickFinalists, verdict, type DecideCtx } from '../decide'
import { criteria, home } from './fixtures'

const ctx = (homes: ReturnType<typeof home>[], p: Partial<DecideCtx> = {}): DecideCtx => ({
  criteria: criteria(), ratings: [], homes, homeVisits: [], adults: [{ id: 'a', name: 'Toni' }, { id: 'b', name: 'Rebeca' }], ...p
})

describe('decidir', () => {
  it('finalistas: las favoritas; si no llegan a 2, las mejores visitadas', () => {
    const hs = [home({ id: 'f', status: 'favorito' }), home({ id: 'v', status: 'visitado' }), home({ id: 'd', status: 'descartado' }), home({ id: 'i', status: 'interesa' })]
    const f = pickFinalists(hs, ctx(hs)).map(h => h.id)
    expect(f).toContain('f'); expect(f).toContain('v'); expect(f).not.toContain('d')
    const two = [home({ id: 'f', status: 'favorito' }), home({ id: 'o', status: 'oferta' }), home({ id: 'v', status: 'visitado' })]
    expect(pickFinalists(two, ctx(two)).map(h => h.id).sort()).toEqual(['f', 'o'])
  })
  it('qué falta antes de ofertar', () => {
    const h = home()
    const t = beforeOffer(h, ctx([h]))
    expect(t).toContain('Visitarla'); expect(t).toContain('Pedir la nota simple')
    expect(t.some(x => x.startsWith('Rebeca'))).toBe(true)
  })
  it('marca cuando no estáis de acuerdo', () => {
    const a = home({ id: 'a1', status: 'favorito' }), b = home({ id: 'b1', status: 'favorito', price_cents: 800_000_00 })
    const ratings = [{ home_id: 'a1', member_id: 'a', score: 9, comment: null }, { home_id: 'a1', member_id: 'b', score: 5, comment: null }]
    const fs = finalists([a, b], ctx([a, b], { ratings }))
    expect(fs.find(f => f.h.id === 'a1')!.gap).toBe(4)
    const v = verdict(fs, h => h.id)
    expect(v.join(' ')).toMatch(/No estáis de acuerdo/)
    expect(fs[0].score.score).toBeGreaterThanOrEqual(fs[1].score.score)
  })
})
