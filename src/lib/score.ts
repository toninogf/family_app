// Nota 0–10 de cada casa de Buscamos: 6 bloques con pesos ajustables («Qué buscamos»)
import { fold } from '../data/places'
import { affordBase, affordHome } from './afford'
import { criteriaLabel, mustHaveCheck, niceCount, type Criteria, type Home, type Mudanza, type Rating } from './mudanza'
import { readyPrice } from './reforma'
import { healthCounts } from './health'
import { recommend } from './pricing'
import { distLabel } from './colegios'

export type ScoreKey = 'musts' | 'price' | 'nice' | 'estado' | 'ubicacion' | 'espacio' | 'accesibilidad' | 'opinion'
/** penalty: % que se quita a la nota por cada imprescindible que no se cumple (la mitad si falla por poco) */
/** niceFull: % de lo que valoráis con el que ya se saca un 10 en ese bloque */
export type ScoreWeights = Record<ScoreKey | 'penalty' | 'niceFull', number>
export const DEFAULT_WEIGHTS: ScoreWeights = { musts: 5, price: 4, nice: 3, estado: 3, ubicacion: 3, espacio: 3, accesibilidad: 3, opinion: 20, penalty: 30, niceFull: 60 }
export const SCORE_BLOCKS: { k: ScoreKey; icon: string; label: string; help: string }[] = [
  { k: 'musts', icon: '🎯', label: 'Imprescindibles', help: 'Cumple = 10, con reforma = 6, sin dato = 5, no cumple = 0' },
  { k: 'price', icon: '💶', label: 'Precio y presupuesto', help: 'Para entrar a vivir frente a vuestro tope, y si lo que piden es razonable' },
  { k: 'nice', icon: '⭐', label: 'Lo que valoráis', help: 'Cuántos de los «Valoramos» tiene (con reforma cuenta la mitad)' },
  { k: 'estado', icon: '🔍', label: 'Estado, riesgos y reforma', help: 'Resta por cada ⛔ y ⚠️ de Documentos y Estado, y por la reforma que necesita' },
  { k: 'ubicacion', icon: '📍', label: 'Ubicación', help: 'Si está donde buscáis y lo cerca que queda el colegio' },
  { k: 'accesibilidad', icon: '♿', label: 'Accesibilidad', help: 'Lo que marcáis en «♿ Accesibilidad»: cada cosa que la casa tiene suma por igual' },
  { k: 'espacio', icon: '📐', label: 'Espacio', help: 'Metros de casa y de parcela: el mínimo es un 5 y lo ideal un 10 (más no suma)' },
  { k: 'opinion', icon: '👨‍👩‍👧‍👦', label: 'Vuestra opinión', help: 'Vuestra nota del 1 al 10 tras la visita. Solo cuenta cuando la habéis puntuado' }
]

/** Bloques que se reparten la nota por importancia (0–5); «Vuestra opinión» va aparte, como % fijo */
export const BASE_KEYS: ScoreKey[] = ['musts', 'price', 'nice', 'estado', 'ubicacion', 'espacio', 'accesibilidad']

export function weightsOf(c: Criteria | null): ScoreWeights {
  const w = (c?.score_weights ?? {}) as Partial<ScoreWeights>
  const out = { ...DEFAULT_WEIGHTS }
  for (const k of Object.keys(out) as (keyof ScoreWeights)[]) if (typeof w[k] === 'number' && w[k]! >= 0) out[k] = Math.min(100, w[k]!)
  // Los bloques van por importancia 0–5; si vienen pesos antiguos (hasta 50), se pasan a esa escala
  // (solo los que venían guardados: los que faltan ya están en la escala nueva)
  if (BASE_KEYS.some(k => out[k] > 5)) for (const k of BASE_KEYS) if (typeof w[k] === 'number') out[k] = Math.max(0, Math.min(5, Math.round(out[k] / 6)))
  return out
}

export type ScoreBlock = { k: ScoreKey; icon: string; label: string; score: number; weight: number; why: string[]; missing?: boolean }
/** penalty: lo que se ha quitado por imprescindibles que no se cumplen (pct total y cada uno) */
export type HomeScore = { score: number; provisional: boolean; blocks: ScoreBlock[]; before: number; penalty: { pct: number; items: { label: string; pct: number; near: boolean }[] } | null }
type ScoreCtx = { criteria: Criteria | null; ratings: Rating[]; homes: Home[]; offers?: Mudanza['offers']; listing?: Mudanza['listing'] }

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
    const v: number[] = checks.map(x => (x.ok ? 10 : x.ok === false ? (x.reform ? 6 : x.near ? 3 : 0) : 5))
    const why: string[] = []
    const ok = checks.filter(x => x.ok).length
    why.push(`Cumple ${ok} de ${checks.length}`)
    const via = checks.filter(x => x.ok === false && x.reform)
    if (via.length) why.push(`🔨 Con reforma: ${via.map(x => x.label.toLowerCase()).join(', ')}`)
    if (hardFail.length) why.push(`❌ No cumple: ${hardFail.map(x => `${x.label.toLowerCase()}${x.near ? ' (por poco)' : ''}`).join(', ')}`)
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
      // ¿Nos la podemos permitir? (con la oferta inicial, si está calculada)
      if (c.offers && cr?.finance?.income_cents && h.price_cents) {
        const a = affordHome(affordBase({ offers: c.offers, listing: c.listing ?? null }, cr.finance), h, rec?.open ?? h.price_cents)
        if (a?.status === 'no') { s -= 2; why.push(`⛔ No llega: ${a.why || 'falta dinero'} (−2)`) }
        else if (a?.status === 'justo') { s -= 0.5; why.push('🟡 Muy justo con vuestro dinero y la cuota (−0,5)') }
        else if (a) why.push(`✅ Os lo podéis permitir: cuota ~${Math.round((a.cuota ?? 0) / 100).toLocaleString('es-ES')} €/mes`)
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
    // No hace falta tenerlo todo: con el «niceFull» % (60 % de serie) ya es un 10
    const full = Math.max(10, Math.min(100, W.niceFull)) / 100
    const have = n.got.length + n.viaReform.length * 0.5
    const s = 10 * have / (n.want.length * full)
    const why = [`Tiene ${n.got.length} de ${n.want.length}${n.viaReform.length ? ` (+${n.viaReform.length} con reforma)` : ''}`,
      `Con ${Math.ceil(n.want.length * full)} de ${n.want.length} (${Math.round(full * 100)} %) ya sería un 10`]
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

  // 📐 Espacio: casa y parcela entre el mínimo (5) y lo ideal (10); por debajo del mínimo baja hacia 0 (y además lo penaliza el imprescindible)
  {
    const part = (v: number | null, min: number | null | undefined, ideal: number | null | undefined) => {
      if (v == null || !ideal) return null
      const lo = min && min < ideal ? min : null
      if (v >= ideal) return 10
      if (lo != null) return v >= lo ? 5 + 5 * (v - lo) / (ideal - lo) : 5 * v / lo
      return 10 * v / ideal
    }
    const parts: number[] = []
    const why: string[] = []
    const m2 = h.size_m2 != null ? Number(h.size_m2) : null
    const plot = h.plot_m2 != null ? Number(h.plot_m2) : null
    const sc = part(m2, cr?.min_m2, cr?.ideal_m2)
    if (sc != null) { parts.push(sc); why.push(`🏠 ${m2} m² de casa (ideal ${cr!.ideal_m2})`) }
    else if (cr?.ideal_m2 && m2 == null) { why.push('Faltan los m² de la casa'); provisional = true }
    const sp = part(plot, cr?.min_plot_m2, cr?.ideal_plot_m2)
    if (sp != null) { parts.push(sp); why.push(`🌳 Parcela ${plot!.toLocaleString('es-ES')} m² (ideal ${cr!.ideal_plot_m2!.toLocaleString('es-ES')})`) }
    else if (cr?.ideal_plot_m2 && plot == null) { why.push('Falta la parcela'); provisional = true }
    if (parts.length) blocks.push({ ...meta('espacio'), score: parts.reduce((a, b) => a + b, 0) / parts.length, weight: W.espacio, why })
    else if (cr?.ideal_m2 || cr?.ideal_plot_m2) blocks.push({ ...meta('espacio'), score: 5, weight: W.espacio, why: why.length ? why : ['Sin metros: nota neutra'], missing: true })
  }

  // ♿ Accesibilidad: cada cosa marcada vale lo mismo; si la casa la tiene, 10; si no, 0
  // («Todo en una planta» cumple también «dormitorio en planta baja»)
  {
    const items = cr?.access_items ?? []
    if (items.length) {
      const f = h.features ?? []
      const has = (k: string) => f.includes(k) || (k === 'dormitorio_pb' && f.includes('una_planta'))
      const got = items.filter(has), miss = items.filter(k => !has(k))
      const why: string[] = []
      if (got.length) why.push(`✅ ${got.map(criteriaLabel).join(', ')}`)
      if (miss.length) why.push(`❌ ${miss.map(criteriaLabel).join(', ')}`)
      blocks.push({ ...meta('accesibilidad'), score: 10 * got.length / items.length, weight: W.accesibilidad, why })
    }
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

  // 👨‍👩‍👧‍👦 Vuestra opinión (1–10). Si hay, pesa lo suyo y el resto se reparte lo demás
  const rs = c.ratings.filter(x => x.home_id === h.id)
  const opW = rs.length ? Math.min(W.opinion, 90) : 0
  const rest = blocks.reduce((a, b) => a + b.weight, 0)
  for (const b of blocks) b.weight = rest ? b.weight * (100 - opW) / rest : 0
  if (rs.length) {
    const avg = rs.reduce((a, x) => a + x.score, 0) / rs.length
    blocks.push({ ...meta('opinion'), score: clamp(avg), weight: opW, why: [`${avg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} de 10 de media (${rs.length} voto${rs.length > 1 ? 's' : ''})`] })
  }

  const total = blocks.reduce((a, b) => a + b.weight, 0)
  const before = total ? blocks.reduce((a, b) => a + b.score * b.weight, 0) / total : 5
  // Cada imprescindible que no se cumple (ni con reforma) quita un % de la nota; si falla por poco, la mitad
  const p = Math.min(90, W.penalty) / 100
  const items = hardFail.map(x => ({ label: x.label, near: !!x.near, pct: Math.round((x.near ? p / 2 : p) * 100) }))
  const factor = items.reduce((a, x) => a * (1 - x.pct / 100), 1)
  const score = before * factor
  for (const b of blocks) { b.score = r1(b.score); b.weight = Math.round(b.weight) }
  return { score: r1(score), provisional, blocks, before: r1(before), penalty: items.length && p > 0 ? { pct: Math.round((1 - factor) * 100), items } : null }
}

/** Color de la nota */
export const scoreTone = (s: number) => (s >= 7.5 ? 'bg-[#1F8A4C] text-white' : s >= 6 ? 'bg-[#7BAE3F] text-white' : s >= 4.5 ? 'bg-[#E0A21B] text-white' : 'bg-[#C8452F] text-white')
export const fmtScore = (s: number) => s.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
