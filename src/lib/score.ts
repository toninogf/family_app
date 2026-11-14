// Nota 0–10 de cada casa de Buscamos: 6 bloques con pesos ajustables («Qué buscamos»)
import { fold } from '../data/places'
import { mustHaveCheck, niceCount, type Criteria, type Home, type Rating } from './mudanza'
import { readyPrice } from './reforma'
import { healthCounts } from './health'
import { recommend } from './pricing'
import { distLabel } from './colegios'

export type ScoreKey = 'musts' | 'price' | 'nice' | 'estado' | 'ubicacion' | 'opinion'
export type ScoreWeights = Record<ScoreKey, number>
export const DEFAULT_WEIGHTS: ScoreWeights = { musts: 30, price: 25, nice: 15, estado: 15, ubicacion: 15, opinion: 20 }
export const SCORE_BLOCKS: { k: ScoreKey; icon: string; label: string; help: string }[] = [
  { k: 'musts', icon: '🎯', label: 'Imprescindibles', help: 'Cumple = 10, con reforma = 6, sin dato = 5, no cumple = 0' },
  { k: 'price', icon: '💶', label: 'Precio y presupuesto', help: 'Para entrar a vivir frente a vuestro tope, y si lo que piden es razonable' },
  { k: 'nice', icon: '⭐', label: 'Lo que valoráis', help: 'Cuántos de los «Valoramos» tiene (con reforma cuenta la mitad)' },
  { k: 'estado', icon: '🔍', label: 'Estado, riesgos y reforma', help: 'Resta por cada ⛔ y ⚠️ de Documentos y Estado, y por la reforma que necesita' },
  { k: 'ubicacion', icon: '📍', label: 'Ubicación', help: 'Si está donde buscáis y lo cerca que queda el colegio' },
  { k: 'opinion', icon: '👨‍👩‍👧‍👦', label: 'Vuestra opinión', help: 'Las estrellas tras la visita. Solo cuenta cuando la habéis puntuado' }
]

export function weightsOf(c: Criteria | null): ScoreWeights {
  const w = (c?.score_weights ?? {}) as Partial<ScoreWeights>
  const out = { ...DEFAULT_WEIGHTS }
  for (const k of Object.keys(out) as ScoreKey[]) if (typeof w[k] === 'number' && w[k]! >= 0) out[k] = Math.min(100, w[k]!)
  return out
}

export type ScoreBlock = { k: ScoreKey; icon: string; label: string; score: number; weight: number; why: string[]; missing?: boolean }
export type HomeScore = { score: number; provisional: boolean; capped: boolean; blocks: ScoreBlock[] }
type ScoreCtx = { criteria: Criteria | null; ratings: Rating[]; homes: Home[] }

const clamp = (x: number) => Math.max(0, Math.min(10, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const k = (c: number) => `${Math.round(c / 100000)} k€`
/** Interpolación por tramos: [x, nota] ordenados por x */
function steps(x: number, pts: [number, number][]) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
  }
  return pts[pts.length - 1][1]
}

/** schoolDist: metros al colegio público de primaria (o al más cercano), si se sabe */
export function homeScore(h: Home, c: ScoreCtx, schoolDist?: number | null): HomeScore {
  const cr = c.criteria
  const W = weightsOf(cr)
  const blocks: ScoreBlock[] = []
  let provisional = false
  const meta = (key: ScoreKey) => SCORE_BLOCKS.find(b => b.k === key)!

  // 🎯 Imprescindibles
  const checks = mustHaveCheck(h, cr)
  const hardFail = checks.filter(x => x.ok === false && !x.reform)
  if (checks.length) {
    const v = checks.map(x => (x.ok ? 10 : x.ok === false ? (x.reform ? 6 : 0) : 5))
    const why: string[] = []
    const ok = checks.filter(x => x.ok).length
    why.push(`Cumple ${ok} de ${checks.length}`)
    const via = checks.filter(x => x.ok === false && x.reform)
    if (via.length) why.push(`🔨 Con reforma: ${via.map(x => x.label.toLowerCase()).join(', ')}`)
    if (hardFail.length) why.push(`❌ No cumple: ${hardFail.map(x => x.label.toLowerCase()).join(', ')}`)
    const unk = checks.filter(x => x.ok === null)
    if (unk.length) { why.push(`❓ Sin dato: ${unk.map(x => x.label.toLowerCase()).join(', ')}`); provisional = true }
    blocks.push({ ...meta('musts'), score: v.reduce((a, b) => a + b, 0) / v.length, weight: W.musts, why })
  }

  // 💶 Precio y presupuesto
  {
    const ready = readyPrice(h)
    const max = cr?.max_price_cents ?? null
    const why: string[] = []
    let s: number | null = null
    if (ready != null && max) {
      const ratio = ready / max
      s = steps(ratio, [[0.85, 10], [1, 6], [1.1, 2], [1.15, 0]])
      why.push(ratio <= 1 ? `Para entrar a vivir ~${k(ready)}: ${k(max - ready)} por debajo del tope` : `Para entrar a vivir ~${k(ready)}: se pasa ${k(ready - max)} del tope`)
    } else if (ready != null) {
      s = 6; why.push('Sin presupuesto en «Qué buscamos»: nota neutra')
    }
    if (s != null) {
      // Ajuste: lo que piden frente a lo que vale (recomendación) y €/m² frente a lo que se firma en la zona
      const rec = recommend(h, c.homes)
      if (rec?.fair && rec.asking) {
        const over = rec.asking / rec.fair
        if (over > 1.1) { s -= 1; why.push(`Piden un ${Math.round((over - 1) * 100)} % más de lo que parece que vale`) }
        else if (over <= 1) { s += 1; why.push('Lo que piden está en su valor o por debajo') }
      }
      const perM2 = h.price_cents && h.size_m2 ? h.price_cents / 100 / Number(h.size_m2) : null
      const paid = h.market?.paid_m2
      if (perM2 && paid) {
        if (perM2 > paid * 1.15) { s -= 0.5; why.push(`${Math.round(perM2).toLocaleString('es-ES')} €/m², por encima de lo que se firma en la zona`) }
        else if (perM2 < paid * 0.95) { s += 0.5; why.push(`${Math.round(perM2).toLocaleString('es-ES')} €/m², por debajo de lo que se firma en la zona`) }
      }
      blocks.push({ ...meta('price'), score: clamp(s), weight: W.price, why })
    } else {
      provisional = true
      blocks.push({ ...meta('price'), score: 5, weight: W.price, why: ['Falta el precio: nota neutra'], missing: true })
    }
  }

  // ⭐ Lo que valoráis
  const n = niceCount(h, cr)
  if (n.want.length) {
    const s = 10 * (n.got.length + n.viaReform.length * 0.5) / n.want.length
    const why = [`Tiene ${n.got.length} de ${n.want.length}${n.viaReform.length ? ` (+${n.viaReform.length} con reforma)` : ''}`]
    blocks.push({ ...meta('nice'), score: clamp(s), weight: W.nice, why })
  }

  // 🔍 Estado, riesgos y reforma
  {
    const hc = healthCounts(h)
    let s = 10 - hc.bad * 3 - hc.warn
    const why: string[] = []
    if (hc.bad) why.push(`⛔ ${hc.bad} problema${hc.bad > 1 ? 's' : ''} (−${hc.bad * 3})`)
    if (hc.warn) why.push(`⚠️ ${hc.warn} por revisar (−${hc.warn})`)
    const st = h.reform?.state
    if (st === 'integral') { s -= 3; why.push('🔨 Reforma integral (−3)') }
    else if (st === 'parcial') { s -= 1; why.push('🔨 Reforma parcial (−1)') }
    else if (st === 'lavado') { s -= 0.5; why.push('🖌️ Lavado de cara (−0,5)') }
    else if (!st && !h.reform?.items?.length) { why.push('Sin saber qué reforma necesita'); provisional = true }
    if (!hc.bad && !hc.warn) why.unshift(hc.ok ? `✅ ${hc.ok} puntos bien, sin avisos` : 'Sin avisos (aún sin revisar)')
    blocks.push({ ...meta('estado'), score: clamp(s), weight: W.estado, why })
  }

  // 📍 Ubicación
  {
    const parts: number[] = []
    const why: string[] = []
    const towns = (cr?.municipalities ?? []).map(fold)
    const zones = (cr?.zones ?? []).map(fold)
    if (towns.length || zones.length) {
      const inTown = !!h.municipality && towns.includes(fold(h.municipality))
      const inZone = zones.length > 0 && [h.zone, h.municipality, h.address].some(x => x && zones.some(z => fold(x).includes(z)))
      if (!h.municipality && !h.zone) { provisional = true }
      else {
        const s = inZone ? 10 : inTown ? (zones.length ? 8 : 10) : 4
        parts.push(s)
        why.push(inZone ? 'En una de vuestras zonas' : inTown ? 'En una de vuestras localidades' : 'Fuera de donde buscáis')
      }
    }
    if (schoolDist != null) {
      parts.push(steps(schoolDist, [[500, 10], [1000, 8], [1500, 6], [3000, 4], [6000, 2]]))
      why.push(`🏫 Colegio público a ${distLabel(schoolDist)}`)
    }
    if (h.minutes_to_school != null) {
      parts.push(steps(h.minutes_to_school, [[10, 10], [20, 7], [30, 4], [45, 2]]))
      why.push(`🚗 ${h.minutes_to_school} min al cole de los niños`)
    }
    if (parts.length) blocks.push({ ...meta('ubicacion'), score: parts.reduce((a, b) => a + b, 0) / parts.length, weight: W.ubicacion, why })
    else blocks.push({ ...meta('ubicacion'), score: 5, weight: W.ubicacion, why: ['Sin ubicación ni colegios: nota neutra'], missing: true })
  }

  // 👨‍👩‍👧‍👦 Vuestra opinión (estrellas 1–5 → 0–10). Si hay, pesa lo suyo y el resto se reparte lo demás
  const rs = c.ratings.filter(x => x.home_id === h.id)
  const opW = rs.length ? Math.min(W.opinion, 90) : 0
  const rest = blocks.reduce((a, b) => a + b.weight, 0)
  for (const b of blocks) b.weight = rest ? b.weight * (100 - opW) / rest : 0
  if (rs.length) {
    const avg = rs.reduce((a, x) => a + x.score, 0) / rs.length
    blocks.push({ ...meta('opinion'), score: clamp((avg - 1) * 2.5), weight: opW, why: [`${avg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ⭐ de media (${rs.length} voto${rs.length > 1 ? 's' : ''})`] })
  }

  const total = blocks.reduce((a, b) => a + b.weight, 0)
  let score = total ? blocks.reduce((a, b) => a + b.score * b.weight, 0) / total : 5
  const capped = hardFail.length > 0 && score > 4
  if (capped) score = 4
  for (const b of blocks) { b.score = r1(b.score); b.weight = Math.round(b.weight) }
  return { score: r1(score), provisional, capped, blocks }
}

/** Color de la nota */
export const scoreTone = (s: number) => (s >= 7.5 ? 'bg-[#1F8A4C] text-white' : s >= 6 ? 'bg-[#7BAE3F] text-white' : s >= 4.5 ? 'bg-[#E0A21B] text-white' : 'bg-[#C8452F] text-white')
export const fmtScore = (s: number) => s.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
