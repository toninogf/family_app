import { describe, expect, it } from 'vitest'
import { laterPatch, patchFor, qaProgress, questions, valueOf, isLater, type Q } from '../visitQA'
import type { Home } from '../mudanza'
import { criteria, home } from './fixtures'

const q = (h: Home, id: string, c = criteria()): Q => questions(h, c).find(x => x.id === id)!
const apply = (h: Home, patch: Partial<Home>): Home => ({ ...h, ...patch })

describe('cuestionario de la visita · cada respuesta va a su sitio', () => {
  it('lo que se mira en persona se guarda en «Estado de la vivienda»', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'h:humedad'), h0, 'bad', 'mancha en el techo'))
    expect(h1.health.humedad.s).toBe('bad')
    expect(h1.health.humedad.n).toBe('mancha en el techo')
    expect(valueOf(q(h1, 'h:humedad'), h1)).toBe('bad')
  })
  it('las preguntas de documentos traducen la respuesta a ✅ ⚠️ ⛔', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'h:ocupacion'), h0, 'alquilada'))
    expect(h1.health.ocupacion.s).toBe('warn')
    expect(valueOf(q(h1, 'h:ocupacion'), h1)).toBe('alquilada')
    const h2 = apply(h1, patchFor(q(h1, 'h:ocupacion'), h1, 'ocupada'))
    expect(h2.health.ocupacion.s).toBe('bad')
  })
  it('dos respuestas con el mismo estado no se confunden (sin cargas / solo su hipoteca)', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'h:nota_simple'), h0, 'hipoteca'))
    expect(h1.health.nota_simple.s).toBe('ok')
    expect(valueOf(q(h1, 'h:nota_simple'), h1)).toBe('hipoteca')
  })
  it('lo marcado en la ficha (sin pasar por el cuestionario) sale como respondido', () => {
    const h = home({ health: { vpo: { s: 'bad' } } as never })
    expect(valueOf(q(h, 'h:vpo'), h)).toBe('si')
  })
  it('accesibilidad: «Sí» marca el extra, «No» lo quita y queda respondido', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'f:entrada_sin_escaleras'), h0, true))
    expect(h1.features).toContain('entrada_sin_escaleras')
    expect(valueOf(q(h1, 'f:entrada_sin_escaleras'), h1)).toBe(true)
    const h2 = apply(h1, patchFor(q(h1, 'f:entrada_sin_escaleras'), h1, false))
    expect(h2.features).not.toContain('entrada_sin_escaleras')
    expect(valueOf(q(h2, 'f:entrada_sin_escaleras'), h2)).toBe(false)
  })
  it('parcela: llana o en pendiente, nunca las dos', () => {
    const h0 = home({ features: ['parcela_llana', 'jardin'] })
    const h1 = apply(h0, patchFor(q(h0, 'p:parcela'), h0, 'parcela_pendiente'))
    expect(h1.features).toEqual(['jardin', 'parcela_pendiente'])
  })
  it('IBI y comunidad se guardan en céntimos en la ficha', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'x:ibi'), h0, 1234.5))
    expect(h1.ibi_cents).toBe(123450)
    expect(valueOf(q(h1, 'x:ibi'), h1)).toBe(1234.5)
  })
  it('borrar una respuesta la deja sin responder', () => {
    const h0 = home()
    const h1 = apply(h0, patchFor(q(h0, 'a:ofertas'), h0, 'Ninguna'))
    expect(valueOf(q(h1, 'a:ofertas'), h1)).toBe('Ninguna')
    const h2 = apply(h1, patchFor(q(h1, 'a:ofertas'), h1, null))
    expect(valueOf(q(h2, 'a:ofertas'), h2)).toBeUndefined()
  })
  it('«preguntar luego» se marca y se quita sin perder nada', () => {
    const h0 = home()
    const h1 = apply(h0, laterPatch(q(h0, 'a:tiempo'), h0, true))
    expect(isLater(q(h1, 'a:tiempo'), h1)).toBe(true)
    const h2 = apply(h1, laterPatch(q(h1, 'a:tiempo'), h1, false))
    expect(isLater(q(h2, 'a:tiempo'), h2)).toBe(false)
  })
})

describe('cuestionario · qué preguntas salen', () => {
  it('pregunta por los imprescindibles que no constan y la mantiene al responder', () => {
    const c = criteria({ must_haves: ['aislamiento', 'jardin'] })
    const h0 = home({ features: ['jardin'] })
    expect(questions(h0, c).map(x => x.id)).toContain('m:aislamiento')
    expect(questions(h0, c).map(x => x.id)).not.toContain('m:jardin')
    const h1 = apply(h0, patchFor(q(h0, 'm:aislamiento', c), h0, true))
    expect(h1.features).toContain('aislamiento')
    expect(questions(h1, c).map(x => x.id)).toContain('m:aislamiento')
  })
  it('quitar una pregunta en una casa o en todas', () => {
    const h = home({ visit_qa: { hidden: ['h:ruido'] } })
    expect(questions(h, criteria()).map(x => x.id)).not.toContain('h:ruido')
    const c = criteria({ visit_questions: { hidden: ['h:luz'], custom: [{ id: 'c:1', q: '¿Cabe el coche?', type: 'yesno' }] } })
    const ids = questions(home(), c).map(x => x.id)
    expect(ids).not.toContain('h:luz')
    expect(ids).toContain('c:1')
  })
  it('el progreso cuenta respondidas y pendientes', () => {
    const h0 = home()
    const p0 = qaProgress(h0, criteria())
    const h1 = apply(h0, patchFor(q(h0, 'h:luz'), h0, 'ok'))
    const p1 = qaProgress(h1, criteria())
    expect(p1.total).toBe(p0.total)
    expect(p1.done).toBe(p0.done + 1)
    expect(p1.pending).toBe(p0.pending - 1)
  })
})
