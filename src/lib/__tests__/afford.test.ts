import { describe, expect, it } from 'vitest'
import { affordAt, affordBase, affordHome, loanFor, maxPrice, needFromSale, type Finance } from '../afford'
import { monthlyPayment } from '../compra'
import { home, sale } from './fixtures'

// Caso real (15-nov): 4.000 € de ingresos, 3,5 % a 20 años
const fin: Finance = { income_cents: 4_000_00, tin: 3.5, years: 20 }
const eur = (c: number) => Math.round(c / 100)

describe('hipoteca', () => {
  it('cuota sin intereses = capital / meses', () => {
    expect(monthlyPayment(120_000_00, 0, 10)).toBe(100_000)
  })
  it('1.200 €/mes al 3,5 % a 20 años dan 206.911 € de hipoteca', () => {
    expect(eur(loanFor(1_200_00, 3.5, 20))).toBe(206_911)
  })
  it('la cuota de la hipoteca máxima es la cuota máxima', () => {
    const cuota = monthlyPayment(loanFor(1_200_00, 3.5, 20), 3.5, 20)!
    expect(Math.abs(cuota - 1_200_00)).toBeLessThanOrEqual(1)
  })
})

describe('affordBase · de qué dinero partimos', () => {
  it('cuota máxima = 30 % de los ingresos', () => {
    expect(affordBase(sale(), fin).maxCuota).toBe(1_200_00)
  })
  it('las otras cuotas restan', () => {
    expect(affordBase(sale(), { ...fin, debts_cents: 200_00 }).maxCuota).toBe(1_000_00)
  })
  it('dinero propio = venta + ahorros − colchón', () => {
    expect(affordBase(sale(), fin).own).toBe(566_950_00)
    expect(affordBase(sale(), { ...fin, savings_cents: 50_000_00, cushion_cents: 20_000_00 }).own).toBe(596_950_00)
  })
  it('el precio de venta puesto a mano cambia el dinero propio', () => {
    expect(affordBase(sale(), fin, 0, 650_000_00).own).toBe(536_950_00)
  })
  it('sin ingresos no se puede calcular', () => {
    const b = affordBase(sale(), { savings_cents: 10_000_00 })
    expect(b.maxLoan).toBeNull()
    expect(b.ready).toBe(false)
  })
})

describe('affordAt · simulador', () => {
  const b = affordBase(sale(), fin)
  it('caso real: comprar a 610.000 € con 20.000 € de reforma', () => {
    const a = affordAt(b, 610_000_00, 20_000_00)!
    expect(eur(a.need)).toBe(669_509)   // compra + ~39.509 € de impuestos y gastos + reforma
    expect(eur(a.loan)).toBe(102_559)   // lo que falta tras poner 566.950 €
    expect(eur(a.cuota!)).toBe(595)
    expect(Math.round(a.slack / 100_000)).toBe(104) // «os sobran ~104 k€»
    expect(a.status).toBe('ok')
  })
  it('si falta entrada, no llega aunque la cuota quepa', () => {
    const poor = affordBase({ listing: null, offers: [] } as never, { ...fin, income_cents: 20_000_00, savings_cents: 50_000_00 })
    const a = affordAt(poor, 600_000_00)!
    expect(a.status).toBe('no')
    expect(a.why).toContain('entrada')
  })
  it('si la cuota no cabe, lo dice', () => {
    const a = affordAt(b, 900_000_00)!
    expect(a.status).toBe('no')
    expect(a.why).toContain('cuota')
  })
  it('menos de 20.000 € de margen es «justo»', () => {
    const top = maxPrice(b, 0)!
    expect(affordAt(b, top.price - 5_000_00)!.status).toBe('justo')
  })
})

describe('maxPrice · hasta dónde llegamos', () => {
  const b = affordBase(sale(), fin)
  it('al precio máximo entra y 5.000 € más ya no', () => {
    for (const reform of [0, 30_000_00, 100_000_00]) {
      const top = maxPrice(b, reform)!
      expect(affordAt(b, top.price - 2_000_00, reform)!.slack).toBeGreaterThanOrEqual(0)
      expect(affordAt(b, top.price + 5_000_00, reform)!.slack).toBeLessThan(0)
    }
  })
  it('cada euro de reforma baja el precio máximo', () => {
    expect(maxPrice(b, 60_000_00)!.price).toBeLessThan(maxPrice(b, 0)!.price)
  })
  it('vender por menos baja el precio máximo', () => {
    expect(maxPrice(affordBase(sale(), fin, 0.1), 0)!.price).toBeLessThan(maxPrice(b, 0)!.price)
  })
})

describe('affordHome · una casa concreta', () => {
  it('suma su reforma, impuestos y honorarios', () => {
    const b = affordBase(sale(), fin)
    const plain = affordHome(b, home(), 605_000_00)!
    const fee = affordHome(b, home({ buyer_fee_kind: 'fijo', buyer_fee_cents: 10_000_00 }), 605_000_00)!
    expect(plain.need).toBe(605_000_00 + plain.costs)
    expect(fee.need - plain.need).toBe(fee.fee)
    expect(fee.fee).toBeGreaterThanOrEqual(10_000_00)
  })
})

describe('needFromSale · lo que tiene que dar la venta', () => {
  it('sin ahorros ni hipoteca: todo el presupuesto', () => {
    expect(needFromSale(700_000_00, null, null)!.need).toBe(700_000_00)
  })
  it('resta ahorros (menos el colchón) y la hipoteca de Compramos', () => {
    const n = needFromSale(700_000_00, { savings_cents: 50_000_00, cushion_cents: 10_000_00 }, 200_000_00)!
    expect(n.need).toBe(460_000_00)
    expect(n.loanFrom).toBe('compramos')
  })
  it('sin hipoteca elegida usa la máxima de la calculadora', () => {
    const n = needFromSale(700_000_00, fin, null)!
    expect(eur(n.loan)).toBe(206_911)
    expect(n.loanFrom).toBe('calculadora')
  })
  it('sin presupuesto no hay cuenta', () => {
    expect(needFromSale(null, fin, null)).toBeNull()
  })
})
