// Impuestos y gastos de la compra (Comunidad de Madrid, 2026). Orientativos: la gestoría y el notario dan la cifra final.
// Fuentes: guiafiscal.es (ITP/AJD Madrid 2026), cuantomecuesta.com (gastos de compra, abril 2026).

export const ITP = 0.06 // vivienda usada, tipo general en Madrid (no sois familia numerosa)
export const NEW_VAT = 0.10 // obra nueva: IVA
export const NEW_AJD = 0.0075 // obra nueva: AJD

export type CostLine = { k: string; label: string; lo: number; hi: number; note?: string; zero?: boolean; group: 'impuestos' | 'compraventa' | 'hipoteca' }

type HomeLike = { price_cents: number | null; ref_value_cents?: number | null; new_build?: boolean; plot_m2?: number | string | null }

/** Arancel aproximado de notaría de la compraventa según el precio (escritura + copias) */
function notary(p: number) {
  const e = p / 100
  const mid = e <= 150000 ? 750 : e <= 300000 ? 900 : e <= 600000 ? 1100 : 1350
  return { lo: Math.round(mid * 0.85) * 100, hi: Math.round(mid * 1.15) * 100 }
}
/** Registro de la Propiedad (inscripción) según el precio */
function registry(p: number) {
  const e = p / 100
  const mid = e <= 150000 ? 450 : e <= 300000 ? 550 : e <= 600000 ? 650 : 750
  return { lo: Math.round(mid * 0.85) * 100, hi: Math.round(mid * 1.15) * 100 }
}

/** Líneas de impuestos y gastos para un precio de compra (céntimos) */
export function purchaseLines(h: HomeLike, onPrice?: number | null, opts?: { mortgage?: boolean }): CostLine[] {
  const p = onPrice ?? h.price_cents
  if (p == null) return []
  const out: CostLine[] = []
  if (h.new_build) {
    const v = Math.round(p * NEW_VAT), a = Math.round(p * NEW_AJD)
    out.push({ k: 'iva', label: 'IVA (obra nueva, 10 %)', lo: v, hi: v, group: 'impuestos' })
    out.push({ k: 'ajd', label: 'AJD de la compra (0,75 %)', lo: a, hi: a, group: 'impuestos' })
  } else {
    // Base: el mayor entre el precio y el valor de referencia del Catastro
    const base = Math.max(p, h.ref_value_cents ?? 0)
    const v = Math.round(base * ITP)
    out.push({
      k: 'itp', label: 'ITP (6 %)', lo: v, hi: v, group: 'impuestos',
      note: h.ref_value_cents && h.ref_value_cents > p ? 'Sobre el valor de referencia del Catastro, que es mayor que el precio' : h.ref_value_cents ? 'Sobre el precio (mayor que el valor de referencia)' : 'Sobre el precio; si el valor de referencia del Catastro es mayor, se paga sobre ese'
    })
  }
  const n = notary(p), r = registry(p)
  out.push({ k: 'notaria', label: 'Notaría de la compraventa', ...n, group: 'compraventa' })
  out.push({ k: 'registro', label: 'Registro de la Propiedad', ...r, group: 'compraventa' })
  out.push({ k: 'gestoria', label: 'Gestoría', lo: 30000, hi: 50000, group: 'compraventa' })
  out.push({ k: 'nota', label: 'Nota simple', lo: 900, hi: 900, group: 'compraventa' })
  if (opts?.mortgage !== false) {
    out.push({ k: 'tasacion', label: 'Tasación', lo: h.plot_m2 ? 40000 : 30000, hi: h.plot_m2 ? 65000 : 50000, group: 'hipoteca' })
    out.push({ k: 'ajd_hip', label: 'AJD, notaría y registro de la hipoteca', lo: 0, hi: 0, zero: true, note: 'Los paga el banco desde 2019', group: 'hipoteca' })
  }
  return out
}

export type PurchaseTotal = { lo: number; hi: number; mid: number; lines: CostLine[] }
export function purchaseCosts(h: HomeLike, onPrice?: number | null): PurchaseTotal | null {
  const lines = purchaseLines(h, onPrice)
  if (!lines.length) return null
  const lo = lines.reduce((s, x) => s + x.lo, 0), hi = lines.reduce((s, x) => s + x.hi, 0)
  return { lo, hi, mid: Math.round((lo + hi) / 2), lines }
}
/** Gastos de compra estimados (céntimos, punto medio) */
export const purchaseMid = (h: HomeLike) => purchaseCosts(h)?.mid ?? 0

/** Opcionales que se pueden añadir en Compramos */
export const OPTIONAL_COSTS: { label: string; cents: number }[] = [
  { label: 'Perito / inspección técnica', cents: 45000 },
  { label: 'Abogado (arras y escritura)', cents: 100000 },
  { label: 'Mudanza', cents: 250000 },
  { label: 'Altas de suministros', cents: 15000 }
]
