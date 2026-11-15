// «📋 Cuestionario de la visita»: preguntas para rellenar en la visita. Cada respuesta se guarda donde ya vive ese dato
// (Estado y documentos, extras de la casa, gastos de la ficha); lo que no tiene sitio propio va en homes.visit_qa.
import { AI_CHECKS, MANUAL_CHECKS, VISIT_CHECKS, type Health, type HealthStatus } from './health'
import { FEATURES, critItems, criteriaLabel, meets, type Criteria, type Home } from './mudanza'

export type QType = 'estado' | 'yesno' | 'number' | 'choice' | 'text'
export type QA = { v?: string | number | boolean | null; later?: boolean }
export type CustomQ = { id: string; q: string; type: 'text' | 'yesno' | 'estado' }
export type VisitQA = { answers?: Record<string, QA>; hidden?: string[]; custom?: CustomQ[] }
export type VisitTemplate = { custom?: CustomQ[]; hidden?: string[] }
export type Section = 'buscamos' | 'preguntar' | 'mirar' | 'acceso' | 'nuestras'
export const SECTIONS: { k: Section; title: string; help: string }[] = [
  { k: 'buscamos', title: '🎯 Imprescindibles por confirmar', help: 'Si no consta en la ficha, cuenta como que no' },
  { k: 'preguntar', title: '🗣️ Preguntar', help: 'A la agencia o al vendedor' },
  { k: 'mirar', title: '👀 Mirar en persona', help: 'Lo que solo se ve yendo' },
  { k: 'acceso', title: '♿ Accesibilidad', help: 'Cuenta en la nota de accesibilidad' },
  { k: 'nuestras', title: '✍️ Nuestras preguntas', help: 'Las que añadís vosotros' }
]

type Bind =
  | { kind: 'health'; key: string; text?: boolean }
  | { kind: 'feature'; key: string }
  | { kind: 'parcela' }
  | { kind: 'field'; key: 'community_fee_cents' | 'ibi_cents' | 'energy' }
  | { kind: 'answer' }
export type Q = {
  id: string; section: Section; label: string; hint?: string; type: QType
  /** s: en preguntas de documentos, a qué estado (✅ ⚠️ ⛔) equivale cada respuesta */
  options?: { v: string; label: string; s?: HealthStatus }[]; unit?: string; quick?: string[]; bind: Bind; custom?: 'casa' | 'todas'
}

/** Documentos con respuestas concretas (cuestionario y ficha): cada una equivale a ✅ ⚠️ ⛔ */
export const DOC_CHOICES: Record<string, { q: string; opts: [string, string, HealthStatus][] }> = {
  ocupacion: { q: '¿Se entrega libre?', opts: [['libre', 'Libre', 'ok'], ['alquilada', 'Alquilada', 'warn'], ['ocupada', 'Ocupada', 'bad']] },
  vpo: { q: '¿Es vivienda protegida (VPO)?', opts: [['no', 'No', 'ok'], ['si', 'Sí', 'bad']] },
  urbanizacion: { q: '¿La urbanización está recepcionada por el ayuntamiento?', opts: [['si', 'Sí', 'ok'], ['no', 'No', 'warn'], ['nose', 'No lo saben', 'warn']] },
  ite: { q: '¿Licencias y obras en regla?', opts: [['ok', 'Todo en regla', 'ok'], ['falta', 'Falta algo', 'warn'], ['sin', 'Obras sin licencia', 'bad']] },
  comunidad: { q: '¿Deudas o derramas de comunidad?', opts: [['no', 'Ninguna', 'ok'], ['prevista', 'Hay una prevista', 'warn'], ['deuda', 'Hay deudas', 'bad']] },
  nota_simple: { q: 'Nota simple: ¿cargas?', opts: [['libre', 'Sin cargas', 'ok'], ['hipoteca', 'Solo su hipoteca', 'ok'], ['otras', 'Otras cargas', 'bad']] }
}
/** Etiquetas de ✅ ⚠️ ⛔ para lo que se mira en persona */
export const LOOK_LABEL: Record<HealthStatus, string> = { ok: 'Bien', warn: 'Regular', bad: 'Mal', unknown: 'Sin mirar' }

const TITLE: Record<string, { title: string; hint: string }> = Object.fromEntries([...AI_CHECKS, ...MANUAL_CHECKS, ...VISIT_CHECKS].map(c => [c.key, { title: c.title, hint: c.hint }]))
const hq = (key: string, section: Section): Q => ({ id: `h:${key}`, section, label: TITLE[key]?.title ?? key, hint: TITLE[key]?.hint, type: 'estado', bind: { kind: 'health', key } })
/** Pregunta de documentos con respuestas concretas que equivalen a ✅ ⚠️ ⛔ en «Documentos» */
const dq = (key: string, label: string, opts: [string, string, HealthStatus][]): Q => ({
  id: `h:${key}`, section: 'preguntar', label, hint: TITLE[key]?.hint, type: 'choice', options: opts.map(([v, l, s]) => ({ v, label: l, s })), bind: { kind: 'health', key }
})
const fq = (key: string, label: string): Q => ({ id: `f:${key}`, section: 'acceso', label, type: 'yesno', bind: { kind: 'feature', key } })

const BASE: Q[] = [
  { id: 'h:motivo', section: 'preguntar', label: '¿Por qué venden y desde cuándo?', hint: 'Ayuda a negociar', type: 'text', quick: ['Herencia', 'Cambio de casa', 'Prisa por vender', 'Separación', 'Inversión'], bind: { kind: 'health', key: 'motivo', text: true } },
  { id: 'a:tiempo', section: 'preguntar', label: '¿Cuánto tiempo lleva a la venta?', type: 'text', quick: ['Menos de 1 mes', '1–3 meses', '3–6 meses', 'Más de 6 meses'], bind: { kind: 'answer' } },
  { id: 'a:ofertas', section: 'preguntar', label: '¿Ha habido ofertas? ¿De cuánto?', type: 'text', quick: ['Ninguna', 'Sí, rechazadas', 'Sí, en negociación'], bind: { kind: 'answer' } },
  { id: 'a:queda', section: 'preguntar', label: '¿Qué se queda en la casa?', type: 'text', quick: ['Nada', 'Cocina equipada', 'Algunos muebles', 'Amueblada'], bind: { kind: 'answer' } },
  { id: 'a:entrega', section: 'preguntar', label: '¿Cuándo la entregarían?', type: 'text', quick: ['Inmediata', '1–3 meses', 'A convenir'], bind: { kind: 'answer' } },
  { id: 'x:comunidad', section: 'preguntar', label: 'Gastos de comunidad o urbanización', type: 'number', unit: '€/mes', bind: { kind: 'field', key: 'community_fee_cents' } },
  { id: 'x:ibi', section: 'preguntar', label: 'Último recibo del IBI', type: 'number', unit: '€/año', bind: { kind: 'field', key: 'ibi_cents' } },
  { id: 'x:energy', section: 'preguntar', label: 'Certificado energético', type: 'choice', options: 'ABCDEFG'.split('').map(x => ({ v: x, label: x })), bind: { kind: 'field', key: 'energy' } },
  ...Object.entries(DOC_CHOICES).map(([k, d]) => dq(k, d.q, d.opts)),
  ...['humedad', 'instalaciones', 'ventanas', 'luz', 'ruido', 'saneamiento', 'zona_visita'].map(k => hq(k, 'mirar')),
  fq('entrada_sin_escaleras', '¿Se entra sin escaleras?'),
  fq('acceso_llano', '¿La calle es llana (sin cuestas para llegar)?'),
  fq('una_planta', '¿Está todo en una planta?'),
  fq('dormitorio_pb', '¿Hay dormitorio en planta baja?'),
  { id: 'p:parcela', section: 'acceso', label: '¿La parcela es llana?', type: 'choice', options: [{ v: 'parcela_llana', label: 'Llana' }, { v: 'parcela_pendiente', label: 'En pendiente' }], bind: { kind: 'parcela' } }
]

/** Preguntas de una casa: las propuestas menos las quitadas, más las vuestras (de todas las casas y de esta) */
export function questions(h: Home, c: Criteria | null): Q[] {
  const tpl = (c?.visit_questions ?? {}) as VisitTemplate
  const qa = (h.visit_qa ?? {}) as VisitQA
  const hidden = new Set([...(tpl.hidden ?? []), ...(qa.hidden ?? [])])
  const custom = (cq: CustomQ, scope: 'casa' | 'todas'): Q => ({ id: cq.id, section: 'nuestras', label: cq.q, type: cq.type, bind: { kind: 'answer' }, custom: scope })
  // Imprescindibles que son extras de la casa y no constan: se confirman en la visita (respondido «No» se queda como no)
  const must = critItems(c?.must_haves ?? []).filter(k => !k.includes('|') && FEATURES[k] && (!meets(h, k) || qa.answers?.[`m:${k}`] !== undefined))
    .map((k): Q => ({ id: `m:${k}`, section: 'buscamos', label: `¿Tiene ${criteriaLabel(k).toLowerCase()}?`, type: 'yesno', bind: { kind: 'feature', key: k } }))
  return [...must, ...BASE, ...(tpl.custom ?? []).map(q => custom(q, 'todas')), ...(qa.custom ?? []).map(q => custom(q, 'casa'))].filter(q => !hidden.has(q.id))
}

/** Respuesta actual (undefined = sin responder) */
export function valueOf(q: Q, h: Home): string | number | boolean | undefined {
  const qa = (h.visit_qa ?? {}) as VisitQA
  const b = q.bind
  if (b.kind === 'health') {
    const it = (h.health ?? {})[b.key]
    if (b.text) return it?.n ? it.n : undefined
    if (!it || it.s === 'unknown') return undefined
    if (q.type === 'choice') {
      const a = qa.answers?.[q.id]?.v
      return q.options!.some(o => o.v === a && o.s === it.s) ? String(a) : q.options!.find(o => o.s === it.s)?.v
    }
    return it.s
  }
  if (b.kind === 'feature') return h.features.includes(b.key) || (b.key === 'dormitorio_pb' && h.features.includes('una_planta')) ? true : qa.answers?.[q.id]?.v === false ? false : undefined
  if (b.kind === 'parcela') return h.features.includes('parcela_llana') ? 'parcela_llana' : h.features.includes('parcela_pendiente') ? 'parcela_pendiente' : undefined
  if (b.kind === 'field') { const v = h[b.key]; return v == null || v === '' ? undefined : b.key === 'energy' ? String(v) : Number(v) / 100 }
  const v = qa.answers?.[q.id]?.v
  return v == null || v === '' ? undefined : v
}
export const isLater = (q: Q, h: Home) => !!((h.visit_qa ?? {}) as VisitQA).answers?.[q.id]?.later
export const noteOf = (q: Q, h: Home) => (q.bind.kind === 'health' && !q.bind.text ? (h.health ?? {})[q.bind.key]?.n ?? '' : '')

/** Cambios en la casa para guardar una respuesta (v = null: borrarla) */
export function patchFor(q: Q, h: Home, v: string | number | boolean | null, note?: string): Partial<Home> {
  const b = q.bind
  const qa = (h.visit_qa ?? {}) as VisitQA
  const withAnswer = (val: QA | null): VisitQA => {
    const answers = { ...(qa.answers ?? {}) }
    if (val) answers[q.id] = val; else delete answers[q.id]
    return { ...qa, answers }
  }
  if (b.kind === 'health') {
    const health: Health = { ...(h.health ?? {}) }
    const cur = health[b.key]
    if (b.text) health[b.key] = { ...(cur ?? {}), s: v ? 'ok' : 'unknown', n: v ? String(v).slice(0, 500) : undefined, src: 'manual' }
    else if (q.type === 'choice') {
      const o = q.options!.find(x => x.v === v)
      health[b.key] = { ...(cur ?? {}), s: o?.s ?? 'unknown', n: note !== undefined ? note.slice(0, 500) || undefined : o ? `${o.label} (en la visita)` : undefined, src: 'manual' }
      return { health, visit_qa: withAnswer(o ? { v: o.v } : null) }
    }
    else health[b.key] = { ...(cur ?? {}), s: (v ?? 'unknown') as HealthStatus, n: note !== undefined ? note.slice(0, 500) || undefined : cur?.n, src: 'manual' }
    return { health, visit_qa: withAnswer(null) }
  }
  if (b.kind === 'feature') {
    const f = h.features.filter(x => x !== b.key)
    return { features: v === true ? [...f, b.key] : f, visit_qa: withAnswer(v === false ? { v: false } : null) }
  }
  if (b.kind === 'parcela') {
    const f = h.features.filter(x => x !== 'parcela_llana' && x !== 'parcela_pendiente')
    return { features: v ? [...f, String(v)] : f, visit_qa: withAnswer(null) }
  }
  if (b.kind === 'field') {
    const val = b.key === 'energy' ? (v ? String(v) : null) : v == null || v === '' ? null : Math.round(Number(v) * 100)
    return { [b.key]: val, visit_qa: withAnswer(null) } as Partial<Home>
  }
  return { visit_qa: withAnswer(v == null || v === '' ? null : { v }) }
}
export function laterPatch(q: Q, h: Home, later: boolean): Partial<Home> {
  const qa = (h.visit_qa ?? {}) as VisitQA
  const answers = { ...(qa.answers ?? {}) }
  if (later) answers[q.id] = { ...(answers[q.id] ?? {}), later: true }
  else { const a = { ...(answers[q.id] ?? {}) }; delete a.later; if (a.v === undefined) delete answers[q.id]; else answers[q.id] = a }
  return { visit_qa: { ...qa, answers } }
}

/** Progreso: respondidas, para luego y las que faltan */
export function qaProgress(h: Home, c: Criteria | null) {
  const qs = questions(h, c)
  const done = qs.filter(q => valueOf(q, h) !== undefined)
  const later = qs.filter(q => valueOf(q, h) === undefined && isLater(q, h))
  return { total: qs.length, done: done.length, later: later.length, pending: qs.length - done.length }
}

/** Texto de una respuesta (para listas y resúmenes) */
export function answerText(q: Q, v: string | number | boolean | undefined) {
  if (v === undefined) return ''
  if (q.type === 'estado') return ({ ok: '✅ Bien', warn: '⚠️ Regular', bad: '⛔ Mal' } as Record<string, string>)[String(v)] ?? String(v)
  if (q.type === 'yesno') return v ? 'Sí' : 'No'
  if (q.type === 'choice') return q.options?.find(o => o.v === v)?.label ?? String(v)
  if (q.type === 'number') return `${Number(v).toLocaleString('es-ES')} ${q.unit ?? ''}`.trim()
  return String(v)
}
