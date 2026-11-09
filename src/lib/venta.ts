// ¿Estamos en precio? Valoración de nuestro piso con algo más que el €/m²: exterior, estado y año de reforma, aire,
// baños, planta y ascensor, terraza, garaje… Se ajusta cada piso de la competencia a cómo es el nuestro antes de comparar.
import { BUILDING_LABEL, LIGHT_LABEL, NOISE_LABEL, type BuyerOffer, type BuyerVisit, type Competitor, type Listing, type PricePoint } from './mudanza'

export type Condition = 'nuevo' | 'reformado' | 'buen_estado' | 'a_reformar'
export const CONDITION_LABEL: Record<Condition, string> = { nuevo: 'Obra nueva', reformado: 'Reformado (≤ 10 años)', buen_estado: 'Buen estado', a_reformar: 'A reformar' }
const COND_SCORE: Record<Condition, number> = { nuevo: 9, reformado: 5, buen_estado: 0, a_reformar: -14 }

type Traits = {
  m2: number | null; rooms: number | null; baths: number | null; exterior: boolean | null; aire: boolean
  floorN: number | null; bajo: boolean; atico: boolean; ascensor: boolean
  terraza: boolean; balcon: boolean; garaje: boolean; trastero: boolean; portero: boolean; piscina: boolean
  condition: Condition | null
}

/** «Bajo», «entreplanta», «1ª», «3º exterior», «ático»… */
export function floorInfo(floor: string | null) {
  const f = (floor ?? '').toLowerCase()
  const bajo = /\bbajo|entreplanta|semis[oó]tano|\bep\b/.test(f)
  const atico = /[aá]tico/.test(f)
  const n = f.match(/(\d{1,2})\s*[ªºoa°]?/)
  return { n: bajo ? 0 : n ? Number(n[1]) : null, bajo, atico }
}

export function conditionOf(x: { features: string[]; reform_year?: number | null; year_built?: number | null; condition?: Condition | null }, year = new Date().getFullYear()): Condition | null {
  if (x.condition) return x.condition
  if (x.year_built && year - x.year_built <= 5) return 'nuevo'
  if (x.reform_year) return year - x.reform_year <= 10 ? 'reformado' : year - x.reform_year <= 25 ? 'buen_estado' : 'a_reformar'
  if (x.features.includes('reformado')) return 'reformado'
  return null
}

function traits(x: { size_m2?: number | string | null; rooms?: number | null; baths?: number | null; floor?: string | null; features: string[]; cooling?: string | null; reform_year?: number | null; year_built?: number | null; condition?: Condition | null }, exteriorKnown: boolean): Traits {
  const f = x.features ?? []
  const fl = floorInfo(x.floor ?? null)
  return {
    m2: x.size_m2 != null ? Number(x.size_m2) : null, rooms: x.rooms ?? null, baths: x.baths ?? null,
    exterior: f.includes('exterior') ? true : exteriorKnown ? false : null,
    aire: f.includes('aire') || (!!x.cooling && x.cooling !== 'no'),
    floorN: fl.n, bajo: fl.bajo, atico: fl.atico, ascensor: f.includes('ascensor'),
    terraza: f.includes('terraza'), balcon: f.includes('balcon'), garaje: f.includes('garaje') || f.includes('garaje_cerrado'),
    trastero: f.includes('trastero'), portero: f.includes('portero'), piscina: f.includes('piscina') || f.includes('piscina_comunitaria'),
    condition: conditionOf({ features: f, reform_year: x.reform_year, year_built: x.year_built, condition: x.condition })
  }
}

export type Adj = { label: string; pct: number }
/** Cuánto hay que corregir el €/m² de otro piso para compararlo con el nuestro (+ = el nuestro es mejor en eso) */
export function adjustments(ours: Listing, c: Competitor): Adj[] {
  const o = traits(ours, true)
  const t = traits(c, false)
  const out: Adj[] = []
  const add = (label: string, pct: number) => { if (Math.abs(pct) >= 0.5) out.push({ label, pct: Math.round(pct * 10) / 10 }) }
  if (o.exterior != null && t.exterior != null && o.exterior !== t.exterior) add(t.exterior ? 'es exterior y el nuestro no' : 'es interior', o.exterior ? 8 : -8)
  if (o.condition && t.condition && o.condition !== t.condition) add(`${CONDITION_LABEL[t.condition].toLowerCase()}`, COND_SCORE[o.condition] - COND_SCORE[t.condition])
  if (o.aire !== t.aire) add(t.aire ? 'tiene aire y el nuestro no' : 'sin aire acondicionado', o.aire ? 2 : -2)
  if (o.baths != null && t.baths != null && o.baths !== t.baths) add(`${t.baths} baño${t.baths === 1 ? '' : 's'}`, Math.max(-6, Math.min(6, (o.baths - t.baths) * 3)))
  if (o.m2 && t.m2 && Math.abs(t.m2 / o.m2 - 1) > 0.08) add(t.m2 > o.m2 ? `más grande (${t.m2} m²): €/m² más bajo` : `más pequeño (${t.m2} m²): €/m² más alto`, 15 * Math.log2(t.m2 / o.m2))
  // Planta y ascensor
  if (t.bajo && !o.bajo) add('es un bajo', 7)
  if (o.bajo && !t.bajo) add('no es bajo', -7)
  if (t.atico && !o.atico) add('es ático', -5)
  if (!t.ascensor && (t.floorN ?? 0) >= 2 && o.ascensor) add(`${t.floorN}º sin ascensor`, Math.min(15, 4 * ((t.floorN ?? 1) - 1)))
  if (!o.ascensor && (o.floorN ?? 0) >= 2 && t.ascensor) add('tiene ascensor y el nuestro no', -Math.min(15, 4 * ((o.floorN ?? 1) - 1)))
  const extra = (k: keyof Traits, label: string, pct: number) => { if (o[k] !== t[k]) add(t[k] ? `tiene ${label}` : `sin ${label}`, o[k] ? pct : -pct) }
  extra('terraza', 'terraza', 4); extra('balcon', 'balcón', 1.5); extra('garaje', 'garaje', 5); extra('trastero', 'trastero', 1.5)
  extra('portero', 'portero', 2); extra('piscina', 'piscina', 3)
  out.push(...extraAdjustments(ours, c))
  return out
}

const NOISE_SCORE = { tranquila: 3, normal: 0, ruidosa: -4 } as const
const LIGHT_SCORE = { mucha: 3, normal: 0, poca: -4 } as const
const BUILDING_SCORE = { bien: 0, ite_pendiente: -3, obras_previstas: -2 } as const
const ENERGY = 'ABCDEFG'
/** Comunidad (y calefacción central), edificio y derramas, ruido, luz y certificado energético */
function extraAdjustments(ours: Listing, c: Competitor): Adj[] {
  const out: Adj[] = []
  const add = (label: string, pct: number) => { if (Math.abs(pct) >= 0.5) out.push({ label, pct: Math.round(pct * 10) / 10 }) }
  // Comunidad: cada 100 €/mes de diferencia ≈ 1,5 % (la calefacción central suele ir incluida: se descuenta ~60 €/mes)
  const fee = (cents: number | null, heat: string | null | undefined) => (cents == null ? null : cents / 100 - (heat === 'central' ? 60 : 0))
  const fo = fee(ours.community_fee_cents, ours.heating_type), fc = fee(c.community_fee_cents, c.heating_type)
  if (fo != null && fc != null && Math.abs(fc - fo) >= 25) add(fc > fo ? `comunidad más cara (${Math.round(c.community_fee_cents! / 100)} €/mes)` : `comunidad más barata (${Math.round(c.community_fee_cents! / 100)} €/mes)`, Math.max(-5, Math.min(5, ((fc - fo) / 100) * 1.5)))
  if (ours.building_state && c.building_state && ours.building_state !== c.building_state) add(BUILDING_LABEL[c.building_state].toLowerCase(), BUILDING_SCORE[ours.building_state] - BUILDING_SCORE[c.building_state])
  // Derrama pendiente: lo que tendrá que pagar el comprador, en % del precio
  if (c.derrama_cents && c.price_cents) add(`derrama de ${Math.round(c.derrama_cents / 100).toLocaleString('es-ES')} €`, Math.min(10, (c.derrama_cents / c.price_cents) * 100))
  if (ours.derrama_cents && c.price_cents && !c.derrama_cents) add('el vuestro tiene derrama', -Math.min(10, (ours.derrama_cents / c.price_cents) * 100))
  if (ours.noise && c.noise && ours.noise !== c.noise) add(NOISE_LABEL[c.noise].toLowerCase(), NOISE_SCORE[ours.noise] - NOISE_SCORE[c.noise])
  if (ours.light && c.light && ours.light !== c.light) add(LIGHT_LABEL[c.light].toLowerCase(), LIGHT_SCORE[ours.light] - LIGHT_SCORE[c.light])
  if (ours.energy && c.energy && ours.energy !== c.energy) add(`certificado ${c.energy}`, Math.max(-4, Math.min(4, ENERGY.indexOf(c.energy) - ENERGY.indexOf(ours.energy))))
  return out
}
export const adjTotal = (a: Adj[]) => Math.max(-35, Math.min(35, a.reduce((s, x) => s + x.pct, 0)))

/** Lo que el nuestro tiene por encima de un piso «medio» de la zona (para corregir la media de notarías y portales) */
export function premium(ours: Listing): Adj[] {
  const o = traits(ours, true)
  const out: Adj[] = []
  if (o.exterior) out.push({ label: '100 % exterior', pct: 4 })
  if (o.condition) out.push({ label: CONDITION_LABEL[o.condition].toLowerCase(), pct: { nuevo: 8, reformado: 5, buen_estado: 0, a_reformar: -12 }[o.condition] })
  if (o.aire) out.push({ label: 'aire acondicionado', pct: 1.5 })
  if (o.baths != null && o.baths >= 2 && (o.rooms ?? 3) <= 2) out.push({ label: '2 baños con 2 habitaciones', pct: 2 })
  if (o.ascensor && (o.floorN ?? 0) >= 1) out.push({ label: 'con ascensor', pct: 1 })
  if (o.bajo) out.push({ label: 'bajo', pct: -6 })
  if (o.atico) out.push({ label: 'ático', pct: 5 })
  if (o.terraza) out.push({ label: 'terraza', pct: 3 })
  if (o.garaje) out.push({ label: 'garaje', pct: 4 })
  if (o.portero) out.push({ label: 'portero', pct: 1 })
  if (ours.orientation && /sur/.test(ours.orientation)) out.push({ label: `orientación ${ours.orientation}`, pct: 1.5 })
  if (ours.noise && ours.noise !== 'normal') out.push({ label: NOISE_LABEL[ours.noise].toLowerCase(), pct: NOISE_SCORE[ours.noise] })
  if (ours.light && ours.light !== 'normal') out.push({ label: LIGHT_LABEL[ours.light].toLowerCase(), pct: LIGHT_SCORE[ours.light] })
  if (ours.building_state && ours.building_state !== 'bien') out.push({ label: BUILDING_LABEL[ours.building_state].toLowerCase(), pct: BUILDING_SCORE[ours.building_state] })
  if (ours.derrama_cents && ours.price_cents) out.push({ label: `derrama de ${Math.round(ours.derrama_cents / 100).toLocaleString('es-ES')} €`, pct: -Math.round(Math.min(10, (ours.derrama_cents / ours.price_cents) * 100) * 10) / 10 })
  if (ours.energy && 'ABC'.includes(ours.energy)) out.push({ label: `certificado ${ours.energy}`, pct: 1.5 })
  if (ours.energy && 'FG'.includes(ours.energy)) out.push({ label: `certificado ${ours.energy}`, pct: -1.5 })
  return out.filter(x => x.pct !== 0)
}

const round1k = (c: number) => Math.round(c / 100000) * 100000
const median = (xs: { v: number; w: number }[]) => {
  const s = xs.slice().sort((a, b) => a.v - b.v)
  const total = s.reduce((t, x) => t + x.w, 0)
  let acc = 0
  for (const x of s) { acc += x.w; if (acc >= total / 2) return x.v }
  return s[s.length - 1]?.v ?? 0
}

export type Valuation = {
  target: number; start: number; low: number; m2: number | null; perM2: number
  sources: string[]; confidence: 'alta' | 'media' | 'baja'; prem: Adj[]
  comps: { c: Competitor; adj: Adj[]; total: number; raw: number; adjusted: number }[]
}
/** Precio objetivo (lo que esperar cerrar), de salida y suelo razonable */
export function valuation(ours: Listing | null, competitors: Competitor[]): Valuation | null {
  if (!ours?.size_m2) return null
  const m2 = Number(ours.size_m2)
  const prem = premium(ours)
  const premPct = prem.reduce((s, x) => s + x.pct, 0)
  const comps = competitors
    .filter(c => c.status !== 'retirado' && c.price_cents && c.size_m2)
    .map(c => {
      const adj = adjustments(ours, c)
      const total = adjTotal(adj)
      const raw = c.price_cents! / Number(c.size_m2)
      return { c, adj, total, raw, adjusted: raw * (1 + total / 100) }
    })
  const refs: { v: number; w: number; label: string }[] = []
  if (comps.length) {
    // Los anuncios están pedidos ~6 % por encima de lo que se acaba firmando (los vendidos, menos)
    const v = median(comps.map(x => ({ v: x.adjusted * (x.c.status === 'vendido' ? 0.98 : 0.94), w: 1 / (1 + Math.abs(x.total) / 10) })))
    refs.push({ v, w: comps.length >= 3 ? 0.6 : 0.35, label: `${comps.length} piso${comps.length > 1 ? 's' : ''} parecido${comps.length > 1 ? 's' : ''} ajustado${comps.length > 1 ? 's' : ''} al vuestro` })
  }
  const mk = ours.market ?? {}
  if (mk.paid_m2) refs.push({ v: mk.paid_m2 * 100 * (1 + premPct / 100), w: 0.4, label: 'compraventas firmadas en la zona (notarías)' })
  if (mk.asking_m2) refs.push({ v: mk.asking_m2 * 100 * 0.93 * (1 + premPct / 100), w: mk.paid_m2 ? 0.15 : 0.4, label: 'precios pedidos en portales (−7 %)' })
  if (!refs.length) return null
  const w = refs.reduce((s, r) => s + r.w, 0)
  const perM2 = refs.reduce((s, r) => s + r.v * r.w, 0) / w
  const target = round1k(perM2 * m2)
  return {
    target, start: round1k(target * 1.04), low: round1k(target * 0.95), m2, perM2: Math.round(perM2),
    sources: refs.map(r => r.label), confidence: refs.length >= 2 && comps.length >= 3 ? 'alta' : refs.length >= 2 || comps.length >= 3 ? 'media' : 'baja', prem, comps
  }
}

/** Umbrales de los filtros de precio de los portales (quien busca «hasta 700.000» no ve 705.000) */
export function threshold(asking: number | null) {
  if (!asking) return null
  const e = asking / 100
  const step = e < 500000 ? 25000 : e < 1000000 ? 50000 : 100000
  const t = Math.floor(e / step) * step
  if (e > t && e <= t * 1.03) return { at: t * 100, over: asking - t * 100 }
  return null
}

export type Signal = { tone: 'ok' | 'warn' | 'bad' | 'none'; text: string }
/** El termómetro: lo que dicen vuestras visitas y ofertas */
export function thermometer(o: { visits: BuyerVisit[]; offers: BuyerOffer[]; asking: number | null; publishedOn: string | null; today: string; avgDays?: number; prices: PricePoint[]; competitors: Competitor[] }): { verdict: Signal; signals: Signal[] } {
  const days = o.publishedOn ? Math.round((Date.parse(o.today) - Date.parse(o.publishedOn)) / 86400000) : null
  const done = o.visits.filter(v => v.status === 'done')
  const weeks = days ? Math.max(1, days / 7) : null
  const perWeek = weeks ? done.length / weeks : null
  const real = o.offers.filter(x => x.status !== 'withdrawn')
  const avgOffer = real.length && o.asking ? real.reduce((s, x) => s + x.amount_cents / o.asking!, 0) / real.length : null
  const avg = o.avgDays ?? 90
  const signals: Signal[] = []
  if (days != null) signals.push({ tone: days > avg * 1.3 ? 'bad' : days > avg * 0.8 ? 'warn' : 'ok', text: `${days} días a la venta (en la zona se venden en ~${avg})` })
  if (perWeek != null) signals.push({ tone: perWeek >= 1.5 ? 'ok' : perWeek >= 0.7 ? 'warn' : 'bad', text: `${done.length} visita${done.length === 1 ? '' : 's'} hechas (${perWeek.toLocaleString('es-ES', { maximumFractionDigits: 1 })} por semana)` })
  if (real.length) signals.push({ tone: avgOffer! >= 0.95 ? 'ok' : avgOffer! >= 0.9 ? 'warn' : 'bad', text: `${real.length} oferta${real.length > 1 ? 's' : ''}, de media un ${Math.round((1 - avgOffer!) * 100)} % por debajo` })
  else if (done.length) signals.push({ tone: done.length >= 8 ? 'bad' : done.length >= 4 ? 'warn' : 'none', text: 'Ninguna oferta todavía' })
  const objections = new Map<string, number>()
  for (const v of done) for (const x of v.objections) objections.set(x, (objections.get(x) ?? 0) + 1)
  const top = [...objections.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && done.length >= 3 && top[1] / done.length >= 0.4) signals.push({ tone: 'warn', text: `«${top[0]}» sale en ${top[1]} de ${done.length} visitas` })
  const since = (d: string) => (Date.parse(o.today) - Date.parse(d)) / 86400000
  const drops = o.competitors.filter(c => c.status === 'activo' && c.price_history.length > 1 && since(c.price_history[c.price_history.length - 1].date) <= 21 && c.price_history[c.price_history.length - 1].cents < c.price_history[c.price_history.length - 2].cents)
  if (drops.length) signals.push({ tone: 'warn', text: `${drops.length} piso${drops.length > 1 ? 's' : ''} parecido${drops.length > 1 ? 's' : ''} ha${drops.length > 1 ? 'n' : ''} bajado de precio en las últimas 3 semanas` })

  let verdict: Signal
  if (days != null && days < 21) verdict = { tone: 'none', text: 'Aún es pronto: en las 3 primeras semanas se ve si el precio funciona.' }
  else if (avgOffer != null && avgOffer >= 0.95) verdict = { tone: 'ok', text: 'Las ofertas llegan cerca de lo que pedís: estáis en precio.' }
  else if (done.length >= 8 && !real.length) verdict = { tone: 'bad', text: 'Muchas visitas y ninguna oferta: el precio está alto para lo que ven.' }
  else if (perWeek != null && perWeek < 0.7 && (days ?? 0) >= 21) verdict = { tone: 'bad', text: 'Pocas visitas: el problema está antes de la visita (precio en los filtros, fotos o anuncio).' }
  else if (avgOffer != null && avgOffer < 0.92) verdict = { tone: 'warn', text: `Las ofertas apuntan a que el mercado lo ve en ~${Math.round(avgOffer * 100)} % de lo que pedís.` }
  else verdict = { tone: 'ok', text: 'De momento, buen ritmo.' }
  return { verdict, signals }
}

/** Respuestas preparadas y arreglos baratos para las pegas que más salen */
export const OBJECTION_HELP: Record<string, { reply: string; fix?: string }> = {
  'Precio alto': { reply: 'Comparad con los pisos parecidos: exterior, reformado y con aire valen más que la media del barrio.', fix: 'Si se repite, mirad el termómetro antes de bajar.' },
  'Necesita reforma': { reply: 'Reformado hace pocos años: decid qué se hizo (instalaciones, ventanas, baños) y tened las facturas a mano.', fix: 'Pintar y arreglar detalles visibles (juntas, enchufes, puertas).' },
  'Cocina pequeña': { reply: 'Llevad un plano con una distribución alternativa y su presupuesto aproximado.', fix: 'Despejar encimeras y buena luz en la cocina.' },
  'Poca luz': { reply: 'Al ser exterior, enseñadlo a la hora de más luz y con todo abierto.', fix: 'Bombillas de luz fría-neutra, cortinas claras, espejos.' },
  'Ruido': { reply: 'Decid qué ventanas tiene (doble acristalamiento) y en qué habitaciones se duerme.', fix: 'Visitas fuera de horas punta y ventanas cerradas al enseñar.' },
  'Sin ascensor': { reply: 'Si la comunidad ha hablado de instalarlo, decidlo con lo que costaría.' },
  'Distribución': { reply: 'Llevad planos con posibles cambios sencillos y lo que costarían.', fix: 'Quitar muebles que estrechen pasillos.' },
  'Tamaño': { reply: 'Insistid en lo aprovechado: 2 baños, armarios, trastero.', fix: 'Menos muebles y orden: parece más grande.' },
  'Zona': { reply: 'Tened a mano colegios, transporte, comercio y parques cercanos.' },
  'Sin garaje': { reply: 'Mirad precio y disponibilidad de plazas en alquiler o venta cerca y decidlo.' },
  'Gastos de comunidad': { reply: 'Explicad qué incluyen (calefacción central, portero, ascensor…) y su coste real al mes.' },
  'Orientación': { reply: 'Enseñadlo a la hora en que más luz entra y decid las horas de sol.' }
}
