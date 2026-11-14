// Filtrar y ordenar los pisos de Buscamos con todo lo que calcula la app: criterios, reforma, gastos, colegios, riesgos…
import { HOME_STATUS_ORDER, equivRooms, mustHaveCheck, niceCount, type Criteria, type Home, type HomeStatus, type HomeVisit, type Rating } from './mudanza'
import { readyPrice, reformKnown, reformTotal } from './reforma'
import { healthCounts } from './health'
import { recommend } from './pricing'
import type { schoolSummary } from './colegios'
import { homeScore } from './score'

export type QuickKey = 'cumple' | 'falla1' | 'presupuesto' | 'piscina' | 'sinreforma' | 'nuevos' | 'bajadas' | 'visita'
export const QUICK: { k: QuickKey; label: string }[] = [
  { k: 'cumple', label: '✅ Cumple todo' }, { k: 'falla1', label: '🟡 Falla 1' }, { k: 'presupuesto', label: '💶 En presupuesto' },
  { k: 'piscina', label: '🏊 Con piscina' }, { k: 'sinreforma', label: '🔨 Sin reforma' }, { k: 'nuevos', label: '🆕 Nuevos (7 días)' },
  { k: 'bajadas', label: '📉 Han bajado' }, { k: 'visita', label: '📅 Con visita' }
]
export type ReformFilter = 'listo' | 'lavado' | 'parcial' | 'integral' | 'sin'
export type Filters = {
  /** Vacío = «En marcha» (todo menos descartados y propuestas) */
  statuses: HomeStatus[]
  quick: QuickKey[]
  towns: string[]; outside: boolean
  askMin: number | null; askMax: number | null; readyMin: number | null; readyMax: number | null
  minM2: number | null; minPlot: number | null; minRooms: number | null; minBaths: number | null
  musts: 'da_igual' | 'todos' | 'falla1'; reformCounts: boolean; minNice: number | null
  features: string[]
  reform: ReformFilter[]; reformMax: number | null
  risk: 'da_igual' | 'ok' | 'avisos' | 'sin_revisar'
  schoolKm: number | null; schoolBilingual: boolean
  heating: string[]; energyMin: string | null
  origin: 'da_igual' | 'ia' | 'nuestros'
}
export const EMPTY: Filters = {
  statuses: [], quick: [], towns: [], outside: false, askMin: null, askMax: null, readyMin: null, readyMax: null,
  minM2: null, minPlot: null, minRooms: null, minBaths: null, musts: 'da_igual', reformCounts: false, minNice: null,
  features: [], reform: [], reformMax: null, risk: 'da_igual', schoolKm: null, schoolBilingual: false, heating: [], energyMin: null, origin: 'da_igual'
}
export type SortKey = 'puntos' | 'encaje' | 'listo' | 'precio' | 'margen' | 'm2listo' | 'parcela' | 'nota' | 'cole' | 'visita' | 'bajada' | 'nuevos' | 'estado'
export const SORTS: { k: SortKey; label: string }[] = [
  { k: 'puntos', label: 'Nota 0–10, de mayor a menor' },
  { k: 'encaje', label: 'Mejor encaje (criterios, valoramos y presupuesto)' }, { k: 'listo', label: 'Para entrar a vivir, de menor a mayor' },
  { k: 'precio', label: 'Lo que piden, de menor a mayor' }, { k: 'margen', label: 'Más margen para negociar' },
  { k: 'm2listo', label: '€/m² para entrar a vivir' }, { k: 'parcela', label: 'Parcela más grande' }, { k: 'nota', label: 'Nota de la familia' },
  { k: 'cole', label: 'Colegio público más cerca' }, { k: 'visita', label: 'Próxima visita' }, { k: 'bajada', label: 'Han bajado de precio' },
  { k: 'nuevos', label: 'Más nuevos' }, { k: 'estado', label: 'Estado (favoritos primero)' }
]

export type Ctx = {
  criteria: Criteria | null; visits: HomeVisit[]; ratings: Rating[]; homes: Home[]; today: string
  schools: Record<string, ReturnType<typeof schoolSummary>>
}

const ENERGY = 'ABCDEFG'
export const fromIa = (h: Home) => h.status === 'propuesta' || (h.notes ?? '').trimStart().startsWith('🤖')
export const priceDropped = (h: Home) => /ha bajado|lo rechazasteis/i.test(h.notes ?? '')
const daysAgo = (iso: string, today: string) => (Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86400000
export function nextVisit(h: Home, ctx: Ctx) {
  return ctx.visits.filter(v => v.home_id === h.id && v.status === 'scheduled' && v.visit_date >= ctx.today).sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0] ?? null
}
export function avgRating(h: Home, ctx: Ctx) {
  const r = ctx.ratings.filter(x => x.home_id === h.id)
  return r.length ? r.reduce((s, x) => s + x.score, 0) / r.length : null
}
/** Cuántos imprescindibles fallan (los 🔨 con reforma cuentan como cumplidos si se pide) */
function fails(h: Home, ctx: Ctx, reformCounts: boolean) {
  const c = mustHaveCheck(h, ctx.criteria)
  return c.filter(x => x.ok === false && !(reformCounts && x.reform)).length
}
const inBudget = (h: Home, ctx: Ctx) => { const r = readyPrice(h); const b = ctx.criteria?.max_price_cents; return b == null || r == null ? null : r <= b }
const hasPool = (h: Home) => h.features.includes('piscina') || h.features.includes('piscina_comunitaria')
function reformOf(h: Home): ReformFilter {
  if (!reformKnown(h.reform)) return 'sin'
  if (h.reform.state) return h.reform.state
  return 'parcial'
}

/** Puntuación de encaje: imprescindibles, lo que valoramos y presupuesto */
export function fitScore(h: Home, ctx: Ctx) {
  const c = mustHaveCheck(h, ctx.criteria)
  const n = niceCount(h, ctx.criteria)
  const b = inBudget(h, ctx)
  return c.filter(x => x.ok).length * 3 - c.filter(x => x.ok === false && !x.reform).length * 5 - c.filter(x => x.reform).length * 2
    + n.got.length + n.viaReform.length * 0.5 + (b === true ? 3 : b === false ? -3 : 0)
}

export function applyFilters(homes: Home[], f: Filters, ctx: Ctx) {
  return homes.filter(h => {
    if (f.statuses.length ? !f.statuses.includes(h.status) : h.status === 'descartado' || h.status === 'propuesta') return false
    for (const q of f.quick) {
      if (q === 'cumple' && fails(h, ctx, false) > 0) return false
      if (q === 'falla1' && fails(h, ctx, false) !== 1) return false
      if (q === 'presupuesto' && inBudget(h, ctx) === false) return false
      if (q === 'piscina' && !hasPool(h)) return false
      if (q === 'sinreforma' && h.reform?.state !== 'listo') return false
      if (q === 'nuevos' && daysAgo(h.created_at, ctx.today) > 7) return false
      if (q === 'bajadas' && !priceDropped(h)) return false
      if (q === 'visita' && !nextVisit(h, ctx)) return false
    }
    const ours = ctx.criteria?.municipalities ?? []
    if (f.towns.length || f.outside) {
      const inTowns = !!h.municipality && f.towns.includes(h.municipality)
      const isOutside = f.outside && ours.length > 0 && !!h.municipality && !ours.includes(h.municipality)
      if (!inTowns && !isOutside) return false
    }
    const ready = readyPrice(h)
    if (f.askMin != null && (h.price_cents == null || h.price_cents < f.askMin * 100)) return false
    if (f.askMax != null && (h.price_cents == null || h.price_cents > f.askMax * 100)) return false
    if (f.readyMin != null && (ready == null || ready < f.readyMin * 100)) return false
    if (f.readyMax != null && (ready == null || ready > f.readyMax * 100)) return false
    if (f.minM2 != null && (h.size_m2 == null || Number(h.size_m2) < f.minM2)) return false
    if (f.minPlot != null && (h.plot_m2 == null || Number(h.plot_m2) < f.minPlot)) return false
    if (f.minRooms != null) { const e = equivRooms(h); if (!e || e.total < f.minRooms) return false }
    if (f.minBaths != null && (h.baths == null || h.baths < f.minBaths)) return false
    if (f.musts === 'todos' && fails(h, ctx, f.reformCounts) > 0) return false
    if (f.musts === 'falla1' && fails(h, ctx, f.reformCounts) > 1) return false
    if (f.minNice != null) { const n = niceCount(h, ctx.criteria); if (n.got.length + (f.reformCounts ? n.viaReform.length : 0) < f.minNice) return false }
    if (f.features.length && !f.features.every(k => h.features.includes(k) || (k === 'piscina_cualquiera' && hasPool(h)))) return false
    if (f.reform.length && !f.reform.includes(reformOf(h))) return false
    if (f.reformMax != null) { const t = reformTotal(h.reform, h); if ((t?.mid ?? 0) > f.reformMax * 100) return false }
    if (f.risk !== 'da_igual') {
      const c = healthCounts(h)
      if (f.risk === 'ok' && (c.bad > 0 || c.warn > 0)) return false
      if (f.risk === 'avisos' && c.bad + c.warn === 0) return false
      if (f.risk === 'sin_revisar' && c.unknown === 0) return false
    }
    if (f.schoolKm != null) {
      const s = ctx.schools[h.id]?.pubPri
      if (!s || s.dist > f.schoolKm * 1000) return false
      if (f.schoolBilingual && !s.bilingual) return false
    }
    if (f.heating.length && !(h.heating_type && f.heating.includes(h.heating_type))) return false
    if (f.energyMin && !(h.energy && ENERGY.indexOf(h.energy) <= ENERGY.indexOf(f.energyMin))) return false
    if (f.origin === 'ia' && !fromIa(h)) return false
    if (f.origin === 'nuestros' && fromIa(h)) return false
    return true
  })
}

/** Nota 0–10 con el colegio que ya se ha buscado para la lista */
export const scoreOf = (h: Home, ctx: Ctx) => { const s = ctx.schools[h.id]; return homeScore(h, ctx, s ? (s.pubPri ?? s.closest)?.dist ?? null : null) }

export function sortHomes(list: Home[], sort: SortKey, ctx: Ctx) {
  const last = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? Number.MAX_SAFE_INTEGER : x)
  const status = (a: Home, b: Home) => HOME_STATUS_ORDER.indexOf(a.status) - HOME_STATUS_ORDER.indexOf(b.status)
  const key = (h: Home): number | null => {
    switch (sort) {
      case 'puntos': return -scoreOf(h, ctx).score
      case 'encaje': return -fitScore(h, ctx)
      case 'listo': return readyPrice(h)
      case 'precio': return h.price_cents
      case 'margen': { const r = recommend(h, ctx.homes); return r && r.asking ? -(r.asking - r.open) / r.asking : null }
      case 'm2listo': { const r = readyPrice(h); return r != null && h.size_m2 ? r / Number(h.size_m2) : null }
      case 'parcela': return h.plot_m2 != null ? -Number(h.plot_m2) : null
      case 'nota': { const a = avgRating(h, ctx); return a != null ? -a : null }
      case 'cole': return ctx.schools[h.id]?.pubPri?.dist ?? null
      case 'visita': { const v = nextVisit(h, ctx); return v ? Date.parse(v.visit_date) : null }
      case 'bajada': return priceDropped(h) ? -Date.parse(h.created_at) : null
      case 'nuevos': return -Date.parse(h.created_at)
      default: return null
    }
  }
  return list.slice().sort((a, b) => (sort === 'estado' ? status(a, b) : last(key(a)) - last(key(b)) || status(a, b)))
}

/** Chips de los filtros activos (para ver qué se está mirando y quitar cada uno) */
export function activeChips(f: Filters, labels: { status: (s: HomeStatus) => string; feature: (k: string) => string; heating: (k: string) => string }) {
  const out: { label: string; clear: (f: Filters) => Filters }[] = []
  const k = (n: number | null, u = '') => `${(n ?? 0).toLocaleString('es-ES')}${u}`
  for (const s of f.statuses) out.push({ label: labels.status(s), clear: x => ({ ...x, statuses: x.statuses.filter(y => y !== s) }) })
  for (const q of f.quick) out.push({ label: QUICK.find(z => z.k === q)!.label, clear: x => ({ ...x, quick: x.quick.filter(y => y !== q) }) })
  for (const t of f.towns) out.push({ label: `📍 ${t}`, clear: x => ({ ...x, towns: x.towns.filter(y => y !== t) }) })
  if (f.outside) out.push({ label: '📍 Fuera de vuestras localidades', clear: x => ({ ...x, outside: false }) })
  if (f.askMin != null || f.askMax != null) out.push({ label: `Piden ${f.askMin != null ? `desde ${k(f.askMin, ' €')}` : ''} ${f.askMax != null ? `hasta ${k(f.askMax, ' €')}` : ''}`.trim(), clear: x => ({ ...x, askMin: null, askMax: null }) })
  if (f.readyMin != null || f.readyMax != null) out.push({ label: `Para entrar ${f.readyMin != null ? `desde ${k(f.readyMin, ' €')}` : ''} ${f.readyMax != null ? `hasta ${k(f.readyMax, ' €')}` : ''}`.trim(), clear: x => ({ ...x, readyMin: null, readyMax: null }) })
  if (f.minM2 != null) out.push({ label: `≥ ${k(f.minM2)} m²`, clear: x => ({ ...x, minM2: null }) })
  if (f.minPlot != null) out.push({ label: `Parcela ≥ ${k(f.minPlot)} m²`, clear: x => ({ ...x, minPlot: null }) })
  if (f.minRooms != null) out.push({ label: `${f.minRooms}+ hab. (equiv.)`, clear: x => ({ ...x, minRooms: null }) })
  if (f.minBaths != null) out.push({ label: `${f.minBaths}+ baños`, clear: x => ({ ...x, minBaths: null }) })
  if (f.musts !== 'da_igual') out.push({ label: f.musts === 'todos' ? '🎯 Todos los imprescindibles' : '🎯 Falla 1 como mucho', clear: x => ({ ...x, musts: 'da_igual' }) })
  if (f.minNice != null) out.push({ label: `⭐ ${f.minNice}+ que valoramos`, clear: x => ({ ...x, minNice: null }) })
  for (const ft of f.features) out.push({ label: labels.feature(ft), clear: x => ({ ...x, features: x.features.filter(y => y !== ft) }) })
  if (f.reform.length) out.push({ label: `🔨 ${f.reform.map(r => ({ listo: 'para entrar', lavado: 'lavado', parcial: 'parcial', integral: 'integral', sin: 'sin valorar' })[r]).join(', ')}`, clear: x => ({ ...x, reform: [] }) })
  if (f.reformMax != null) out.push({ label: `Reforma ≤ ${k(f.reformMax, ' €')}`, clear: x => ({ ...x, reformMax: null }) })
  if (f.risk !== 'da_igual') out.push({ label: { ok: '🩺 Sin problemas', avisos: '🩺 Con avisos', sin_revisar: '🩺 Sin revisar' }[f.risk], clear: x => ({ ...x, risk: 'da_igual' }) })
  if (f.schoolKm != null) out.push({ label: `🏫 Público a ≤ ${f.schoolKm} km${f.schoolBilingual ? ' bilingüe' : ''}`, clear: x => ({ ...x, schoolKm: null, schoolBilingual: false }) })
  if (f.heating.length) out.push({ label: `🔥 ${f.heating.map(labels.heating).join(', ')}`, clear: x => ({ ...x, heating: [] }) })
  if (f.energyMin) out.push({ label: `⚡ Certificado ${f.energyMin} o mejor`, clear: x => ({ ...x, energyMin: null }) })
  if (f.origin !== 'da_igual') out.push({ label: f.origin === 'ia' ? '🤖 Propuestos por la búsqueda' : '🙋 Metidos por nosotros', clear: x => ({ ...x, origin: 'da_igual' }) })
  return out
}
