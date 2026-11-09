// Resumen en texto de las diferencias importantes entre los pisos que se comparan (sin IA: reglas a partir de los datos)
import { readyPrice, reformKnown } from './reforma'
import { FEATURES, VISIT_CHECKLIST, mustHaveCheck, niceCount, perM2, price, type Criteria, type Home, type HomeVisit } from './mudanza'

/** Nombre corto para el texto: barrio o calle y localidad */
export const shortName = (h: Home) => [h.zone ?? h.address, h.municipality].filter(Boolean).join(' · ') || h.title
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const pct = (a: number, b: number) => Math.round(((b - a) / b) * 100)
const ENERGY = 'ABCDEFG'

/** Valores numéricos de cada fila para marcar el mejor de cada una en la tabla */
/** Gastos fijos al mes: comunidad + IBI/12 + luz + agua + calefacción (lo que se sepa) */
export const monthlyCost = (h: Home) => {
  const parts = [h.community_fee_cents, h.ibi_cents == null ? null : Math.round(h.ibi_cents / 12), h.electricity_cents, h.water_cents, h.heating_cents]
  return parts.every(x => x == null) ? null : parts.reduce<number>((s, x) => s + (x ?? 0), 0)
}
/** Suministros al mes: luz + agua + calefacción */
export const supplyCost = (h: Pick<Home, 'electricity_cents' | 'water_cents' | 'heating_cents'>) => {
  const parts = [h.electricity_cents, h.water_cents, h.heating_cents]
  return parts.every(x => x == null) ? null : parts.reduce<number>((s, x) => s + (x ?? 0), 0)
}

export function badPoints(h: Home, visits: HomeVisit[]) {
  const keys = new Set<string>()
  for (const v of visits.filter(v => v.home_id === h.id)) for (const [k, x] of Object.entries(v.checklist ?? {})) if (x.v === 'mal') keys.add(k)
  return [...keys].map(k => VISIT_CHECKLIST.find(c => c.key === k)?.label.toLowerCase() ?? k)
}

export function compareSummary(homes: Home[], criteria: Criteria | null, visits: HomeVisit[]): string[] {
  if (homes.length < 2) return []
  const out: string[] = []
  const n = shortName

  // Precio
  const priced = homes.filter(h => h.price_cents != null).sort((a, b) => a.price_cents! - b.price_cents!)
  if (priced.length >= 2) {
    const lo = priced[0], hi = priced[priced.length - 1]
    if (hi.price_cents! > lo.price_cents!) out.push(`💶 El más barato es **${n(lo)}** (${price(lo.price_cents)}): ${price(hi.price_cents! - lo.price_cents!)} menos que **${n(hi)}**.`)
  }
  // Para entrar a vivir (precio + reforma): el baremo común
  const ready = homes.filter(h => reformKnown(h.reform) && readyPrice(h) != null).sort((a, b) => readyPrice(a)! - readyPrice(b)!)
  if (ready.length >= 2) {
    const lo = ready[0], hi = ready[ready.length - 1]
    if (readyPrice(hi)! > readyPrice(lo)!) out.push(`🔨 Para entrar a vivir (precio + reforma), el más barato es **${n(lo)}** (${price(readyPrice(lo))}): ${price(readyPrice(hi)! - readyPrice(lo)!)} menos que **${n(hi)}**.`)
    if (priced.length >= 2 && lo.id !== priced[0].id) out.push(`⚠️ **${n(priced[0])}** es el más barato de precio, pero con la reforma deja de serlo.`)
  }
  const unknown = homes.filter(h => !reformKnown(h.reform))
  if (unknown.length && unknown.length < homes.length) out.push(`❔ Falta valorar la reforma de ${list(unknown.map(h => `**${n(h)}**`))} para compararlos con el mismo baremo.`)
  // Precio por metro
  const perm = homes.filter(h => perM2(h) != null).sort((a, b) => perM2(a)! - perM2(b)!)
  if (perm.length >= 2) {
    const lo = perm[0], hi = perm[perm.length - 1]
    const p = pct(perM2(lo)!, perM2(hi)!)
    if (p >= 5) out.push(`📐 Mejor precio por metro: **${n(lo)}** (${price(perM2(lo))}/m²), un ${p} % menos que **${n(hi)}**.`)
  }
  // Tamaño
  const sized = homes.filter(h => h.size_m2 != null).sort((a, b) => Number(b.size_m2) - Number(a.size_m2))
  if (sized.length >= 2) {
    const big = sized[0], small = sized[sized.length - 1]
    const d = Number(big.size_m2) - Number(small.size_m2)
    if (d >= 10) out.push(`📏 **${n(big)}** es el más grande: ${Number(big.size_m2)} m², ${d} m² más que **${n(small)}**.`)
  }
  // Parcela (chalets)
  const plots = homes.filter(h => h.plot_m2 != null).sort((a, b) => Number(b.plot_m2) - Number(a.plot_m2))
  if (plots.length >= 2) {
    const big = plots[0], small = plots[plots.length - 1]
    const d = Math.round(Number(big.plot_m2) - Number(small.plot_m2))
    if (d >= 50) out.push(`🌳 Más parcela: **${n(big)}** (${Number(big.plot_m2)} m²), ${d} m² más que **${n(small)}**.`)
  } else if (plots.length === 1 && homes.length > 1) out.push(`🌳 Solo **${n(plots[0])}** tiene parcela apuntada (${Number(plots[0].plot_m2)} m²).`)
  // Habitaciones y baños
  const rooms = homes.filter(h => h.rooms != null)
  if (rooms.length >= 2 && new Set(rooms.map(h => h.rooms)).size > 1) {
    out.push(`🛏️ Habitaciones: ${list(rooms.sort((a, b) => b.rooms! - a.rooms!).map(h => `${n(h)} (${h.rooms})`))}.`)
  }
  const baths = homes.filter(h => h.baths != null)
  if (baths.length >= 2 && new Set(baths.map(h => h.baths)).size > 1) {
    out.push(`🛁 Baños: ${list(baths.sort((a, b) => b.baths! - a.baths!).map(h => `${n(h)} (${h.baths})`))}.`)
  }
  // Extras que solo tienen algunos
  for (const h of homes) {
    const only = h.features.filter(f => homes.every(o => o === h || !o.features.includes(f)))
    if (only.length) out.push(`✨ Solo **${n(h)}** tiene ${list(only.map(f => (FEATURES[f] ?? f).toLowerCase()))}.`)
  }
  if (homes.length >= 3) {
    for (const h of homes) {
      const missing = Object.keys(FEATURES).filter(f => !h.features.includes(f) && homes.every(o => o === h || o.features.includes(f)))
      if (missing.length) out.push(`⚠️ **${n(h)}** es el único sin ${list(missing.map(f => (FEATURES[f] ?? f).toLowerCase()))}.`)
    }
  }
  // Gastos fijos
  const costs = homes.filter(h => monthlyCost(h) != null).sort((a, b) => monthlyCost(a)! - monthlyCost(b)!)
  if (costs.length >= 2) {
    const lo = costs[0], hi = costs[costs.length - 1]
    const d = monthlyCost(hi)! - monthlyCost(lo)!
    if (d >= 2000) out.push(`🧾 Gastos fijos (comunidad, IBI y suministros): **${n(hi)}** paga unos ${price(d)} al mes más que **${n(lo)}** (${price(d * 12)} al año).`)
  }
  // Imprescindibles
  if (criteria) {
    for (const h of homes) {
      const c = mustHaveCheck(h, criteria)
      const fails = c.filter(x => x.ok === false).map(x => x.label)
      if (fails.length) out.push(`❌ **${n(h)}** no cumple: ${list(fails)}.`)
    }
    const all = homes.filter(h => { const c = mustHaveCheck(h, criteria); return c.length > 0 && c.every(x => x.ok) })
    if (all.length && all.length < homes.length) out.push(`✅ Cumple${all.length > 1 ? 'n' : ''} todos los imprescindibles: ${list(all.map(h => `**${n(h)}**`))}.`)
    if (criteria.nice_to_haves?.length) {
      const sc = homes.map(h => ({ h, k: niceCount(h, criteria).got.length })).sort((a, b) => b.k - a.k)
      if (sc[0].k > sc[sc.length - 1].k) out.push(`⭐ Más de lo que valoramos: **${n(sc[0].h)}** (${sc[0].k} de ${criteria.nice_to_haves.length}).`)
    }
  }
  // Certificado energético
  const en = homes.filter(h => h.energy).sort((a, b) => ENERGY.indexOf(a.energy!) - ENERGY.indexOf(b.energy!))
  if (en.length >= 2 && ENERGY.indexOf(en[en.length - 1].energy!) - ENERGY.indexOf(en[0].energy!) >= 2) {
    out.push(`⚡ Mejor eficiencia energética: **${n(en[0])}** (${en[0].energy}) frente a **${n(en[en.length - 1])}** (${en[en.length - 1].energy}).`)
  }
  // Cole
  const cole = homes.filter(h => h.minutes_to_school != null).sort((a, b) => a.minutes_to_school! - b.minutes_to_school!)
  if (cole.length >= 2 && cole[cole.length - 1].minutes_to_school! - cole[0].minutes_to_school! >= 5) {
    out.push(`🏫 Más cerca del cole: **${n(cole[0])}** (${cole[0].minutes_to_school} min); **${n(cole[cole.length - 1])}** está a ${cole[cole.length - 1].minutes_to_school} min.`)
  }
  // Visitas
  for (const h of homes) {
    const bad = badPoints(h, visits)
    if (bad.length) out.push(`🔎 En la visita de **${n(h)}** marcasteis mal: ${list(bad)}.`)
  }
  const notVisited = homes.filter(h => !visits.some(v => v.home_id === h.id && v.status === 'done'))
  if (notVisited.length && notVisited.length < homes.length) out.push(`👀 Aún sin visitar: ${list(notVisited.map(h => `**${n(h)}**`))}.`)
  return out
}
