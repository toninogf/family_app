// Reforma de cada piso: qué hay que hacer para entrar a vivir y cuánto cuesta (orientativo).
// Precios de gama media en Madrid, 2026, con IVA del 10 % aparte. Fuentes: habitissimo (sept. 2026),
// cuantomecuesta.com (abril 2026) y Selectra (aerotermia, julio 2026). Son horquillas para comparar, no presupuestos.
import type { DocFile } from './mudanza'
import { purchaseMid } from './gastos'

export type ReformState = 'listo' | 'lavado' | 'parcial' | 'integral'
export type Tier = 'basica' | 'media' | 'alta'
export type ReformSrc = 'manual' | 'ia' | 'auto' | 'visita'
export type ReformItem = {
  k: string
  /** Solo para «otros»: qué es */
  label?: string
  /** Cantidad (si no hay, se calcula con los datos del piso) */
  q?: number
  tier?: Tier
  /** Precio que pones tú (total de la partida) */
  own_cents?: number
  /** Presupuesto real de un reformista (manda sobre todo lo demás) */
  quote_cents?: number
  files?: DocFile[]
  n?: string
  src?: ReformSrc
}
export type Reform = { state?: ReformState; items?: ReformItem[]; contingency?: number; note?: string; no_vat?: boolean }

export const REFORM_STATE: Record<ReformState, { label: string; icon: string; hint: string }> = {
  listo: { label: 'Para entrar a vivir', icon: '✅', hint: 'No hace falta tocar nada' },
  lavado: { label: 'Lavado de cara', icon: '🖌️', hint: 'Pintura y detalles' },
  parcial: { label: 'Reforma parcial', icon: '🔨', hint: 'Cocina, baños o alguna instalación' },
  integral: { label: 'Reforma integral', icon: '🏗️', hint: 'Toda la casa' }
}
export const TIER: Record<Tier, { label: string; f: number }> = {
  basica: { label: 'Básica', f: 0.75 }, media: { label: 'Media', f: 1 }, alta: { label: 'Alta', f: 1.45 }
}

type HomeLike = { size_m2?: number | string | null; plot_m2?: number | string | null; rooms?: number | null; baths?: number | null }
type Unit = 'ud' | 'm2' | 'm2_tejado' | 'm2_jardin' | 'ml' | 'global'
export type Partida = {
  k: string; label: string; icon: string; unit: Unit; lo: number; hi: number
  /** Cantidad propuesta a partir de los datos del piso */
  auto: (h: HomeLike) => number | null
  /** Necesita licencia de obra (no basta con declaración responsable) */
  licence?: boolean
  group: 'interior' | 'instalaciones' | 'exterior' | 'otros'
}
const m2 = (h: HomeLike) => (h.size_m2 ? Number(h.size_m2) : null)
const plot = (h: HomeLike) => (h.plot_m2 ? Number(h.plot_m2) : null)

/** Partidas con precio de gama media (por unidad de medida), en euros */
export const PARTIDAS: Partida[] = [
  { k: 'integral', label: 'Reforma integral del interior', icon: '🏗️', unit: 'm2', lo: 450, hi: 700, auto: m2, licence: true, group: 'interior' },
  { k: 'cocina', label: 'Cocina completa', icon: '🍳', unit: 'ud', lo: 12000, hi: 16000, auto: () => 1, group: 'interior' },
  { k: 'banos', label: 'Baños completos', icon: '🛁', unit: 'ud', lo: 5500, hi: 7000, auto: h => h.baths ?? 1, group: 'interior' },
  { k: 'pintura', label: 'Pintura interior', icon: '🖌️', unit: 'm2', lo: 28, hi: 42, auto: m2, group: 'interior' },
  { k: 'suelos', label: 'Suelos', icon: '🟫', unit: 'm2', lo: 70, hi: 100, auto: m2, group: 'interior' },
  { k: 'puertas', label: 'Puertas interiores', icon: '🚪', unit: 'ud', lo: 400, hi: 600, auto: h => (h.rooms ?? 3) + (h.baths ?? 1) + 2, group: 'interior' },
  { k: 'armarios', label: 'Armarios empotrados', icon: '🗄️', unit: 'ud', lo: 900, hi: 1500, auto: h => h.rooms ?? 3, group: 'interior' },
  { k: 'distribucion', label: 'Tirar o mover tabiques', icon: '🧱', unit: 'global', lo: 3000, hi: 8000, auto: () => 1, licence: true, group: 'interior' },
  { k: 'humedades', label: 'Humedades o grietas', icon: '💧', unit: 'global', lo: 2500, hi: 8000, auto: () => 1, group: 'interior' },
  { k: 'electricidad', label: 'Instalación eléctrica', icon: '⚡', unit: 'm2', lo: 38, hi: 55, auto: m2, group: 'instalaciones' },
  { k: 'fontaneria', label: 'Fontanería', icon: '🚰', unit: 'm2', lo: 30, hi: 45, auto: m2, group: 'instalaciones' },
  { k: 'ventanas', label: 'Ventanas (PVC o aluminio RPT)', icon: '🪟', unit: 'ud', lo: 400, hi: 700, auto: h => (m2(h) ? Math.max(4, Math.round(m2(h)! / 15)) : 8), group: 'instalaciones' },
  { k: 'caldera', label: 'Cambiar caldera', icon: '🔥', unit: 'global', lo: 2500, hi: 4500, auto: () => 1, group: 'instalaciones' },
  { k: 'aerotermia', label: 'Aerotermia (calefacción y agua)', icon: '🌬️', unit: 'm2', lo: 80, hi: 110, auto: m2, group: 'instalaciones' },
  { k: 'radiadores', label: 'Radiadores o suelo radiante nuevos', icon: '♨️', unit: 'm2', lo: 35, hi: 60, auto: m2, group: 'instalaciones' },
  { k: 'aire', label: 'Aire por conductos', icon: '❄️', unit: 'global', lo: 5500, hi: 9000, auto: () => 1, group: 'instalaciones' },
  { k: 'placas', label: 'Placas solares (~5 kWp)', icon: '🔆', unit: 'global', lo: 5500, hi: 8000, auto: () => 1, group: 'instalaciones' },
  { k: 'cubierta', label: 'Tejado', icon: '🏠', unit: 'm2_tejado', lo: 90, hi: 150, auto: h => (m2(h) ? Math.round(m2(h)! * 0.6) : null), licence: true, group: 'exterior' },
  { k: 'aislamiento', label: 'Aislar fachada (SATE)', icon: '🧥', unit: 'm2', lo: 55, hi: 90, auto: m2, licence: true, group: 'exterior' },
  { k: 'fachada', label: 'Pintar fachada', icon: '🎨', unit: 'global', lo: 2500, hi: 6000, auto: () => 1, group: 'exterior' },
  { k: 'jardin', label: 'Arreglar jardín', icon: '🌿', unit: 'm2_jardin', lo: 12, hi: 30, auto: h => (plot(h) ? Math.min(800, Math.max(0, Math.round(plot(h)! - (m2(h) ?? 0) * 0.6))) : null), group: 'exterior' },
  { k: 'riego', label: 'Riego automático', icon: '💦', unit: 'global', lo: 1500, hi: 3500, auto: () => 1, group: 'exterior' },
  { k: 'cerramiento', label: 'Valla o muro de parcela', icon: '🚧', unit: 'ml', lo: 70, hi: 140, auto: h => (plot(h) ? Math.round(4 * Math.sqrt(plot(h)!)) : null), group: 'exterior' },
  { k: 'piscina', label: 'Arreglar piscina', icon: '🏊', unit: 'global', lo: 4000, hi: 10000, auto: () => 1, group: 'exterior' },
  { k: 'otros', label: 'Otra cosa', icon: '➕', unit: 'global', lo: 0, hi: 0, auto: () => 1, group: 'otros' }
]
export const PARTIDA = Object.fromEntries(PARTIDAS.map(p => [p.k, p])) as Record<string, Partida>
export const UNIT_LABEL: Record<Unit, string> = { ud: 'ud.', m2: 'm² de casa', m2_tejado: 'm² de tejado', m2_jardin: 'm² de jardín', ml: 'm de valla', global: '' }
export const GROUP_LABEL: Record<Partida['group'], string> = { interior: '🏠 Interior', instalaciones: '⚙️ Instalaciones', exterior: '🌳 Exterior', otros: '➕ Otros' }
/** Lo que ya incluye la reforma integral (no se suma dos veces) */
export const IN_INTEGRAL = ['cocina', 'banos', 'pintura', 'suelos', 'puertas', 'electricidad', 'fontaneria', 'distribucion']

export const VAT = 0.10
export const DEFAULT_CONTINGENCY = 10
/** Licencia, tasas (ICIO) y proyecto cuando la obra lo necesita */
export const LICENCE_PCT = 0.04
export const PROJECT_PCT = 0.07

export type ItemCost = { lo: number; hi: number; mid: number; fixed: boolean; q: number | null }
/** Coste de una partida en céntimos: presupuesto > precio propio > horquilla por cantidad */
export function itemCost(it: ReformItem, h: HomeLike): ItemCost {
  if (it.quote_cents != null) return { lo: it.quote_cents, hi: it.quote_cents, mid: it.quote_cents, fixed: true, q: it.q ?? null }
  if (it.own_cents != null) return { lo: it.own_cents, hi: it.own_cents, mid: it.own_cents, fixed: true, q: it.q ?? null }
  const p = PARTIDA[it.k]
  if (!p || it.k === 'otros') return { lo: 0, hi: 0, mid: 0, fixed: false, q: null }
  const q = it.q ?? p.auto(h)
  if (q == null) return { lo: 0, hi: 0, mid: 0, fixed: false, q: null }
  const f = TIER[it.tier ?? 'media'].f
  const lo = Math.round(p.lo * f * q * 100), hi = Math.round(p.hi * f * q * 100)
  return { lo, hi, mid: Math.round((lo + hi) / 2), fixed: false, q }
}

export type ReformTotal = {
  lo: number; hi: number; mid: number
  works: { lo: number; hi: number }
  extras: { label: string; lo: number; hi: number }[]
  /** Partidas sin cantidad (falta un dato del piso) */
  pending: string[]
  quoted: number; count: number
}
/** Total de la reforma (céntimos) con IVA, licencia y proyecto si hacen falta e imprevistos */
export function reformTotal(r: Reform | null | undefined, h: HomeLike): ReformTotal | null {
  const items = activeItems(r)
  if (!items.length) return null
  let lo = 0, hi = 0, quotedLo = 0, quotedHi = 0
  const pending: string[] = []
  for (const it of items) {
    const c = itemCost(it, h)
    if (!c.fixed && c.q == null && it.k !== 'otros') pending.push(PARTIDA[it.k]?.label ?? it.k)
    if (it.quote_cents != null) { quotedLo += c.lo; quotedHi += c.hi } else { lo += c.lo; hi += c.hi }
  }
  const extras: ReformTotal['extras'] = []
  const needsLicence = items.some(it => PARTIDA[it.k]?.licence)
  const base = { lo: lo + quotedLo, hi: hi + quotedHi }
  if (needsLicence) extras.push({ label: 'Licencia y tasas (~4 %)', lo: Math.round(base.lo * LICENCE_PCT), hi: Math.round(base.hi * LICENCE_PCT) })
  if (items.some(it => it.k === 'integral' || it.k === 'distribucion' || it.k === 'cubierta')) extras.push({ label: 'Proyecto y dirección de obra (~7 %)', lo: Math.round(base.lo * PROJECT_PCT), hi: Math.round(base.hi * PROJECT_PCT) })
  // El IVA solo a lo estimado: los presupuestos se ponen ya con IVA
  if (!r?.no_vat) extras.push({ label: 'IVA de la obra (10 %)', lo: Math.round(lo * VAT), hi: Math.round(hi * VAT) })
  const cont = (r?.contingency ?? DEFAULT_CONTINGENCY) / 100
  if (cont > 0) extras.push({ label: `Imprevistos (${Math.round(cont * 100)} %)`, lo: Math.round(base.lo * cont), hi: Math.round(base.hi * cont) })
  const tLo = base.lo + extras.reduce((s, x) => s + x.lo, 0)
  const tHi = base.hi + extras.reduce((s, x) => s + x.hi, 0)
  return { lo: tLo, hi: tHi, mid: Math.round((tLo + tHi) / 2), works: base, extras, pending, quoted: items.filter(i => i.quote_cents != null).length, count: items.length }
}

/** Las partidas que cuentan (si hay integral, lo que ya incluye no se suma) */
export function activeItems(r: Reform | null | undefined) {
  const items = r?.items ?? []
  if (r?.state === 'listo') return []
  const integral = items.some(i => i.k === 'integral')
  return integral ? items.filter(i => !IN_INTEGRAL.includes(i.k)) : items
}

/** Coste estimado de la reforma (céntimos, punto medio) o 0 si no hay que reformar o no se sabe */
export const reformMid = (h: HomeLike & { reform?: Reform | null }) => reformTotal(h.reform, h)?.mid ?? 0
type FeeLike = { buyer_fee_kind?: 'no' | 'pct' | 'fijo' | null; buyer_fee_pct?: number | string | null; buyer_fee_cents?: number | null; buyer_fee_vat?: boolean }
export const FEE_VAT = 0.21
/** Honorarios de la inmobiliaria que paga el comprador, con IVA si va aparte (céntimos). null si no se sabe */
export function buyerFee(h: FeeLike & { price_cents?: number | null }, onPrice?: number | null): number | null {
  if (!h.buyer_fee_kind) return null
  if (h.buyer_fee_kind === 'no') return 0
  const vat = h.buyer_fee_vat === false ? 1 : 1 + FEE_VAT
  if (h.buyer_fee_kind === 'fijo') return h.buyer_fee_cents != null ? Math.round(h.buyer_fee_cents * vat) : null
  const base = onPrice ?? h.price_cents
  return h.buyer_fee_pct != null && base != null ? Math.round(base * Number(h.buyer_fee_pct) / 100 * vat) : null
}
/** «3 % + IVA» / «6.000 € + IVA» / «sin honorarios» */
export function feeLabel(h: FeeLike) {
  if (!h.buyer_fee_kind) return null
  if (h.buyer_fee_kind === 'no') return 'sin honorarios para el comprador'
  const vat = h.buyer_fee_vat === false ? ' (IVA incluido)' : ' + IVA'
  if (h.buyer_fee_kind === 'pct') return h.buyer_fee_pct != null ? `${Number(h.buyer_fee_pct).toLocaleString('es-ES')} %${vat}` : '¿%?'
  return h.buyer_fee_cents != null ? `${Math.round(h.buyer_fee_cents / 100).toLocaleString('es-ES')} €${vat}` : '¿importe?'
}
type ReadyLike = HomeLike & FeeLike & { price_cents: number | null; reform?: Reform | null; ref_value_cents?: number | null; new_build?: boolean }
/** Gastos de la compra = impuestos y gastos (notaría, registro…) + honorarios de la inmobiliaria (céntimos) */
export const buyingCosts = (h: ReadyLike) => (h.price_cents == null ? 0 : purchaseMid(h) + (buyerFee(h) ?? 0))
/** Precio para entrar a vivir = precio + reforma + gastos de la compra (céntimos) */
export function readyPrice(h: ReadyLike) {
  return h.price_cents == null ? null : h.price_cents + reformMid(h) + buyingCosts(h)
}
/** Para valorar la casa (sin impuestos ni gastos, que no cambian lo que vale): precio + reforma + honorarios */
export function valuePrice(h: ReadyLike) {
  return h.price_cents == null ? null : h.price_cents + reformMid(h) + (buyerFee(h) ?? 0)
}
/** ¿Se ha valorado la reforma? (estado puesto o alguna partida) */
export const reformKnown = (r: Reform | null | undefined) => !!r && (!!r.state || !!r.items?.length)

/** Partidas típicas de cada estado (para empezar rápido) */
export const STATE_ITEMS: Record<ReformState, string[]> = {
  listo: [],
  lavado: ['pintura'],
  parcial: ['pintura', 'cocina', 'banos'],
  integral: ['integral', 'ventanas']
}

type HomeFull = HomeLike & { year_built?: number | null; energy?: string | null; features?: string[]; heating_type?: string | null; cooling?: string | null; reform?: Reform | null }
/** Sugerencias según el año, el certificado y lo que tiene el piso (no se añaden solas) */
export function suggestions(h: HomeFull): { k: string; why: string }[] {
  const have = new Set((h.reform?.items ?? []).map(i => i.k))
  const integral = have.has('integral')
  const out: { k: string; why: string }[] = []
  const add = (k: string, why: string) => { if (!have.has(k) && !(integral && IN_INTEGRAL.includes(k)) && !out.some(x => x.k === k)) out.push({ k, why }) }
  const reformed = h.features?.includes('reformado')
  if (h.year_built && h.year_built < 1990 && !reformed) {
    add('electricidad', `construida en ${h.year_built}: la instalación eléctrica suele estar anticuada`)
    add('fontaneria', `construida en ${h.year_built}: tuberías de origen`)
  }
  if (h.energy && 'EFG'.includes(h.energy)) {
    add('ventanas', `certificado ${h.energy}: ventanas y aislamiento flojos`)
    if ('FG'.includes(h.energy)) add('aislamiento', `certificado ${h.energy}`)
  }
  if (h.year_built && h.year_built < 1985 && !h.features?.includes('aislamiento')) add('ventanas', `construida en ${h.year_built}`)
  if (h.heating_type === 'gasoil' || h.heating_type === 'propano') add('aerotermia', `calefacción de ${h.heating_type === 'gasoil' ? 'gasóleo' : 'propano'}: cara de mantener`)
  if (h.year_built && h.year_built < 1980 && h.plot_m2) add('cubierta', `casa de ${h.year_built}: revisar el tejado`)
  return out
}

/** Lee la línea REFORMA de la IA: «estado | partidas | nota» */
export function parseReformLine(v: string): { state?: ReformState; keys: string[]; note?: string } | null {
  const [a = '', b = '', ...rest] = v.split('|').map(x => x.trim())
  const t = (a + ' ' + b).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const state: ReformState | undefined =
    /integral|reformar entera|para reformar/.test(a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'integral'
      : /parcial/.test(t) ? 'parcial'
        : /lavado|actualizar|pintar/.test(a.toLowerCase()) ? 'lavado'
          : /entrar a vivir|buen estado|reformad|nueva|perfecto/.test(a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'listo' : undefined
  const pats: [string, RegExp][] = [
    ['cocina', /cocina/], ['banos', /bano/], ['pintura', /pintura|pintar(?! fachada)/], ['suelos', /suelo(?! radiante)|parquet|tarima/],
    ['puertas', /puertas?/], ['ventanas', /ventana|carpinteria exterior|cristal/], ['electricidad', /electric/], ['fontaneria', /fontaner|tuberia/],
    ['caldera', /caldera/], ['aerotermia', /aerotermia/], ['aire', /aire|climatiz/], ['cubierta', /tejado|cubierta/],
    ['aislamiento', /aislamiento|sate/], ['fachada', /fachada/], ['humedades', /humedad|grieta|filtraci/], ['jardin', /jardin/],
    ['piscina', /piscina/], ['cerramiento', /valla|cerramiento|muro/], ['distribucion', /tabique|distribuci/], ['armarios', /armario/]
  ]
  const keys = pats.filter(([, re]) => re.test(b.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))).map(([k]) => k)
  if (state === 'integral' && !keys.includes('integral')) keys.unshift('integral')
  const note = rest.join(' | ').slice(0, 300) || undefined
  if (!state && !keys.length) return null
  return { state, keys: state === 'listo' ? [] : keys, note }
}

/** Añade a la reforma lo que propone la IA, sin tocar lo que ya hayáis puesto */
export function mergeAiReform(r: Reform | null | undefined, ai: { state?: ReformState; keys: string[]; note?: string }): Reform {
  const cur: Reform = { ...(r ?? {}) }
  if (!cur.state && ai.state) cur.state = ai.state
  const items = [...(cur.items ?? [])]
  for (const k of ai.keys) if (PARTIDA[k] && !items.some(i => i.k === k)) items.push({ k, src: 'ia' })
  cur.items = items.slice(0, 40)
  if (ai.note && !cur.note) cur.note = `IA: ${ai.note}`.slice(0, 600)
  return cur
}

export const kEur = (cents: number) =>
  cents >= 100000000 ? `${(cents / 100000000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M€`
    : cents < 100000 ? `${Math.round(cents / 100).toLocaleString('es-ES')} €`
      : `${(cents / 100000).toLocaleString('es-ES', { maximumFractionDigits: cents < 1000000 ? 1 : 0 })} k€`
/** «35–48 k€» (la unidad una sola vez si coincide) */
export function rangeK(lo: number, hi: number) {
  const a = kEur(lo), b = kEur(hi)
  if (a === b) return a
  const ua = a.split(' ').pop(), ub = b.split(' ').pop()
  return ua === ub ? `${a.slice(0, -(ua!.length + 1))}–${b}` : `${a}–${b}`
}
