import { describe, expect, it } from 'vitest'
import { canQueue, enqueue, isNetworkError, overlay, rowKey, type Pending } from '../offlineQueue'

const P = (o: Partial<Pending>): Pending => ({ table: 'homes', data: {}, at: 1, ...o })

describe('cola sin conexión', () => {
  it('junta cambios de la misma ficha (gana lo último)', () => {
    let q: Pending[] = []
    q = enqueue(q, P({ id: 'a', data: { notes: 'x', price_cents: 1 } }))
    q = enqueue(q, P({ id: 'a', data: { notes: 'y' }, at: 2 }))
    q = enqueue(q, P({ id: 'b', data: { notes: 'z' } }))
    expect(q).toHaveLength(2)
    expect(q[0].data).toEqual({ notes: 'y', price_cents: 1 })
    expect(q[0].at).toBe(2)
  })
  it('identifica los upsert por sus columnas clave', () => {
    const a = P({ table: 'home_ratings', onConflict: 'home_id,member_id', data: { home_id: 'h', member_id: 'm', score: 7 } })
    const b = P({ table: 'home_ratings', onConflict: 'home_id,member_id', data: { home_id: 'h', member_id: 'm2', score: 5 } })
    expect(rowKey(a)).not.toBe(rowKey(b))
    expect(enqueue([a], { ...a, data: { ...a.data, score: 9 } })[0].data.score).toBe(9)
  })
  it('no guarda altas nuevas (darían duplicados)', () => {
    expect(canQueue(undefined, undefined)).toBe(false)
    expect(canQueue('id')).toBe(true)
    expect(canQueue(undefined, 'household_id')).toBe(true)
  })
  it('distingue fallo de red de error de datos', () => {
    expect(isNetworkError('TypeError: Failed to fetch', true)).toBe(true)
    expect(isNetworkError('Load failed', true)).toBe(true)
    expect(isNetworkError('violates check constraint', true)).toBe(false)
    expect(isNetworkError('lo que sea', false)).toBe(true)
  })
  it('muestra sobre los datos del servidor lo pendiente', () => {
    const rows = [{ id: 'a', notes: 'viejo', title: 'A' }, { id: 'b', notes: 'b', title: 'B' }]
    const out = overlay(rows, [P({ id: 'a', data: { notes: 'nuevo' } }), P({ table: 'home_visits', id: 'b', data: { notes: 'no' } })], 'homes')
    expect(out[0]).toEqual({ id: 'a', notes: 'nuevo', title: 'A' })
    expect(out[1].notes).toBe('b')
  })
})
