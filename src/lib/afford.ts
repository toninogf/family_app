// «🧮 ¿Hasta dónde podemos llegar?»: con lo que deja la venta, los ahorros, los ingresos y la hipoteca,
// cuánto podemos pagar por una casa (y si una casa concreta entra). Es una estimación: el banco decide con su estudio.
import type { Home } from './mudanza'
import { saleNet, type SaleSide } from './funds'
import { monthlyPayment } from './compra'
import { purchaseCosts } from './gastos'
import { buyerFee, reformMid } from './reforma'

export type Finance = {
  income_cents?: number | null   // ingresos netos del hogar al mes
  debts_cents?: number | null    // otras cuotas al mes (coche, préstamos…)
  savings_cents?: number | null  // ahorros que se ponen en la compra
  cushion_cents?: number | null  // colchón que no se toca
  tin?: number | null            // tipo de la hipoteca (%)
  years?: number | null          // plazo (años)
  /** Lo último puesto a mano en «Simular» (texto tal cual) */
  sim?: { sale?: string; buy?: string; reform?: string; home?: string } | null
}
export const RATIO = 0.30        // cuota máxima: 30 % de los ingresos
export const LTV = 0.80          // el banco presta como mucho el 80 % del precio
export const DEF_TIN = 2.8
export const DEF_YEARS = 30

/** Lo que queda de la venta (misma cuenta que Vendemos: ver funds.ts) */
export function saleNetAt(m: SaleSide, discount = 0, override?: number | null) {
  const n = saleNet(m, { discount, price: override })
  return n.sale == null || n.net == null ? null : { sale: n.sale, net: n.net, accepted: n.fromOffer, manual: n.manual }
}

/** Préstamo máximo para una cuota (sistema francés) */
export function loanFor(cuota: number, tin: number, years: number) {
  const n = years * 12, r = tin / 100 / 12
  return Math.round(r === 0 ? cuota * n : cuota * (1 - Math.pow(1 + r, -n)) / r)
}
/** Impuestos y gastos de compra como % del precio (vivienda usada en Madrid) */
const costRate = (p: number) => (purchaseCosts({ price_cents: p }, p)?.mid ?? p * 0.072) / p

/** saleOverride: precio de venta puesto a mano para simular (si no, el publicado o la oferta aceptada) */
export function affordBase(m: SaleSide, f: Finance | null | undefined, saleDiscount = 0, saleOverride?: number | null) {
  const fin = f ?? {}
  const tin = fin.tin ?? DEF_TIN, years = fin.years ?? DEF_YEARS
  const s = saleNetAt(m, saleDiscount, saleOverride)
  const own = Math.max(0, (s?.net ?? 0) + (fin.savings_cents ?? 0) - (fin.cushion_cents ?? 0))
  const maxCuota = fin.income_cents ? Math.max(0, Math.round(fin.income_cents * RATIO) - (fin.debts_cents ?? 0)) : null
  const maxLoan = maxCuota != null ? loanFor(maxCuota, tin, years) : null
  return { own, sale: s, maxCuota, maxLoan, tin, years, ready: maxLoan != null && (s != null || !!fin.savings_cents) }
}
export type AffordBase = ReturnType<typeof affordBase>

/** Precio máximo de compra con una reforma de R céntimos (el menor de los dos topes) */
export function maxPrice(b: AffordBase, reform = 0) {
  if (b.maxLoan == null) return null
  // Iterar: el % de gastos depende del precio
  let p = 60000000, why: 'entrada' | 'cuota' = 'cuota'
  for (let i = 0; i < 6; i++) {
    const c = costRate(p)
    const byDown = (b.own - reform) / (1 - LTV + c)          // vuestro dinero cubre el 20 % + gastos + reforma
    const byLoan = (b.own + b.maxLoan - reform) / (1 + c)    // el préstamo cabe en la cuota
    why = byDown < byLoan ? 'entrada' : 'cuota'
    p = Math.max(0, Math.min(byDown, byLoan))
  }
  const c = costRate(p || 1)
  return { price: Math.round(p / 100000) * 100000, ready: Math.round((p * (1 + c) + reform) / 100000) * 100000, why }
}

/** ¿Entra esta casa al precio de compra P? */
export function affordHome(b: AffordBase, h: Home, buyPrice: number) {
  if (b.maxLoan == null) return null
  const costs = purchaseCosts(h, buyPrice)?.mid ?? Math.round(buyPrice * 0.072)
  const need = buyPrice + costs + reformMid(h) + (buyerFee(h) ?? 0)
  const loan = Math.max(0, need - b.own)
  const limit = Math.min(Math.round(buyPrice * LTV), b.maxLoan)
  const slack = limit - loan                               // > 0: os sobra; < 0: falta
  const cuota = loan ? monthlyPayment(loan, b.tin, b.years) : 0
  const status: 'ok' | 'justo' | 'no' = slack < 0 ? 'no' : slack < 2000000 ? 'justo' : 'ok'
  const why = loan > Math.round(buyPrice * LTV) ? 'el banco no presta más del 80 %: falta entrada' : loan > b.maxLoan ? 'la cuota pasaría del 30 % de los ingresos' : ''
  return { need, loan, cuota, slack, status, why, costs, reform: reformMid(h), fee: buyerFee(h) ?? 0, limit }
}
/** Simulación a mano: comprar a un precio con una reforma (sin casa concreta) */
export function affordAt(b: AffordBase, buyPrice: number, reform = 0, fee = 0) {
  if (b.maxLoan == null) return null
  const costs = purchaseCosts({ price_cents: buyPrice }, buyPrice)?.mid ?? Math.round(buyPrice * 0.072)
  const need = buyPrice + costs + reform + fee
  const loan = Math.max(0, need - b.own)
  const limit = Math.min(Math.round(buyPrice * LTV), b.maxLoan)
  const slack = limit - loan
  const cuota = loan ? monthlyPayment(loan, b.tin, b.years) : 0
  const status: 'ok' | 'justo' | 'no' = slack < 0 ? 'no' : slack < 2000000 ? 'justo' : 'ok'
  const why = loan > Math.round(buyPrice * LTV) ? 'falta entrada: el banco presta como mucho el 80 %' : loan > b.maxLoan ? 'la cuota pasaría del 30 % de los ingresos' : ''
  return { costs, need, loan, cuota, slack, status, why }
}
/**
 * Lo que hace falta sacar de la venta para comprar al presupuesto de «Qué buscamos»:
 * presupuesto − ahorros (menos el colchón) − hipoteca (la elegida en Compramos o, si no hay, la máxima de la calculadora, hasta el 80 %)
 */
export function needFromSale(budget: number | null | undefined, fin: Finance | null | undefined, loanChosen: number | null | undefined) {
  if (budget == null) return null
  const savings = Math.max(0, (fin?.savings_cents ?? 0) - (fin?.cushion_cents ?? 0))
  const maxCuota = fin?.income_cents ? Math.max(0, Math.round(fin.income_cents * RATIO) - (fin.debts_cents ?? 0)) : null
  const byCuota = maxCuota != null ? loanFor(maxCuota, fin?.tin ?? DEF_TIN, fin?.years ?? DEF_YEARS) : null
  const loan = loanChosen ?? (byCuota != null ? Math.min(byCuota, Math.round(budget / 1.072 * LTV)) : 0)
  return { need: Math.max(0, budget - savings - loan), savings, loan, loanFrom: loanChosen != null ? 'compramos' as const : byCuota != null ? 'calculadora' as const : 'ninguna' as const }
}
export const AFFORD_ICON = { ok: '✅', justo: '🟡', no: '⛔' } as const
