// «🧮 ¿Hasta dónde podemos llegar?» en Buscamos: límite para entrar a vivir según venta, ahorros, ingresos e hipoteca
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parsePrice, price, priceInput, type Mudanza } from '../../lib/mudanza'
import { AFFORD_ICON, DEF_TIN, DEF_YEARS, RATIO, affordAt, affordBase, affordHome, maxPrice, saleNetAt, type Finance } from '../../lib/afford'
import { recommend } from '../../lib/pricing'
import { TextField } from '../../components/Sheet'

const k = (c: number | null | undefined) => (c == null ? '—' : `${Math.round(c / 100000).toLocaleString('es-ES')} k€`)

export function AffordCard({ m, householdId }: { m: Mudanza; householdId: string }) {
  const fin = (m.criteria?.finance ?? null) as Finance | null
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(!fin?.income_cents)
  const b = affordBase(m, fin)
  const top = b.ready ? maxPrice(b, 0) : null
  const budget = m.criteria?.max_price_cents ?? null

  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex justify-between items-center gap-2 text-left">
        <span className="flex flex-col">
          <span className="font-bold text-[16px]">🧮 ¿Hasta dónde podemos llegar?</span>
          <span className="text-[13px] text-muted">
            {top ? <>Hasta ~<b className="text-ink">{k(top.ready)}</b> para entrar a vivir (sin reforma, compra hasta ~{k(top.price)})</> : 'Con la venta, los ahorros y los ingresos'}
          </span>
        </span>
        <span className="text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {top && budget != null && budget > top.ready && (
        <span className="text-[12px] text-[#C77A12]">⚠️ El presupuesto de «Qué buscamos» ({k(budget)}) pasa de este límite.</span>
      )}
      {open && (edit || !b.ready ? <FinanceForm m={m} householdId={householdId} fin={fin} onDone={() => setEdit(false)} /> : <Result m={m} fin={fin} onEdit={() => setEdit(true)} />)}
    </section>
  )
}

function Result({ m, fin, onEdit }: { m: Mudanza; fin: Finance | null; onEdit: () => void }) {
  // Simulación a mano (no se guarda): precio de venta, de compra y reforma
  const [saleTxt, setSaleTxt] = useState('')
  const [buyTxt, setBuyTxt] = useState('')
  const [reformTxt, setReformTxt] = useState('')
  const saleOv = saleTxt.trim() ? parsePrice(saleTxt) : null
  const buy = buyTxt.trim() ? parsePrice(buyTxt) : null
  const reform = reformTxt.trim() ? parsePrice(reformTxt) ?? 0 : 0
  const b = affordBase(m, fin, 0, saleOv)
  const rows = [0, 3000000, 6000000, 10000000].map(r => ({ r, x: maxPrice(b, r) }))
  const scen = [0, 0.05, 0.1].map(d => { const bb = affordBase(m, fin, d, saleOv); return { d, sale: bb.sale?.sale ?? null, x: maxPrice(bb, 0) } })
  const top = maxPrice(b, 0)
  const sim = buy ? affordAt(b, buy, reform) : null
  const homes = m.homes.filter(h => h.status !== 'descartado' && h.price_cents)
  const tone = (st: 'ok' | 'justo' | 'no') => (st === 'no' ? 'text-danger' : st === 'justo' ? 'text-[#C77A12]' : 'text-accent')
  const cell = (st: 'ok' | 'justo' | 'no', slack: number, cuota: number | null) => (
    <span className={`flex flex-col items-end ${tone(st)}`}>
      <b>{AFFORD_ICON[st]} {slack >= 0 ? `+${k(slack)}` : `−${k(-slack)}`}</b>
      <span className="text-[11px] text-muted">{cuota ? `${Math.round(cuota / 100).toLocaleString('es-ES')} €/mes` : 'sin hipoteca'}</span>
    </span>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-accent p-3 flex flex-col gap-2">
        <span className="text-[14px] font-bold">🎛️ Simular</span>
        <div className="grid grid-cols-3 gap-2">
          <TextField label="Vendemos a" inputMode="decimal" value={saleTxt} onChange={e => setSaleTxt(e.target.value)} placeholder={k(saleNetAt(m)?.sale ?? null)} />
          <TextField label="Compramos a" inputMode="decimal" value={buyTxt} onChange={e => setBuyTxt(e.target.value)} placeholder="€" />
          <TextField label="Reforma" inputMode="decimal" value={reformTxt} onChange={e => setReformTxt(e.target.value)} placeholder="0" />
        </div>
        <span className="text-[11px] text-muted">Vacío = lo de la app (precio de Vendemos). No se guarda: es para probar.</span>
        {sim && (
          <div className={`rounded-lg bg-bg p-2.5 flex flex-col gap-0.5 text-[13px]`}>
            <b className={tone(sim.status)}>{AFFORD_ICON[sim.status]} {sim.status === 'no' ? 'No llega' : sim.status === 'justo' ? 'Muy justo' : 'Entra'}: {sim.slack >= 0 ? `os sobran ~${k(sim.slack)}` : `faltan ~${k(-sim.slack)}`}{sim.why ? ` (${sim.why})` : ''}</b>
            <span className="text-muted">Necesitáis {price(sim.need)} (compra + ~{k(sim.costs)} de impuestos y gastos{reform ? ` + ${k(reform)} de reforma` : ''}) · hipoteca {price(sim.loan)} · cuota ~{sim.cuota ? `${Math.round(sim.cuota / 100).toLocaleString('es-ES')} €/mes` : '0'}</span>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-bg p-3 flex flex-col gap-1 text-[13px]">
        <span className="flex justify-between"><span className="text-muted">De la venta {b.sale?.manual ? '(precio puesto a mano)' : b.sale?.accepted ? '(oferta aceptada)' : '(precio publicado)'}</span><b>{price(b.sale?.net ?? 0)}</b></span>
        <span className="flex justify-between"><span className="text-muted">+ Ahorros que ponéis</span><b>{price(fin?.savings_cents ?? 0)}</b></span>
        {fin?.cushion_cents ? <span className="flex justify-between"><span className="text-muted">− Colchón que no se toca</span><b>{price(fin.cushion_cents)}</b></span> : null}
        <span className="flex justify-between border-t border-line pt-1"><span>Dinero propio</span><b>{price(b.own)}</b></span>
        <span className="flex justify-between"><span className="text-muted">Cuota máxima ({Math.round(RATIO * 100)} % de ingresos{fin?.debts_cents ? ' − otras cuotas' : ''})</span><b>{price(b.maxCuota)}/mes</b></span>
        <span className="flex justify-between"><span className="text-muted">Hipoteca máxima con esa cuota ({String(b.tin).replace('.', ',')} %, {b.years} años)</span><b>{price(b.maxLoan)}</b></span>
      </div>
      {top && (
        <p className="text-[13px]">
          Hasta ~<b>{k(top.ready)}</b> para entrar a vivir. Lo que os limita: <b>{top.why === 'entrada' ? 'el dinero propio' : 'la cuota'}</b>.{' '}
          {top.why === 'entrada' ? 'El banco presta como mucho el 80 % del precio y el resto, los impuestos (~7 %) y la reforma salen de vuestro dinero.' : 'Con más precio, la cuota pasaría del 30 % de los ingresos.'}
        </p>
      )}

      {homes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold">🏠 Vuestras casas{saleOv ? ' (con la venta puesta a mano)' : ''}</span>
          <span className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px] text-muted"><span /><span className="text-right">a lo que piden</span><span className="text-right">con la oferta</span></span>
          {homes.map(h => {
            const rec = recommend(h, m.homes)
            const a1 = affordHome(b, h, h.price_cents!)
            const a2 = rec ? affordHome(b, h, rec.open) : null
            return (
              <span key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center border-b border-line last:border-0 py-1.5 text-[13px]">
                <span className="flex flex-col min-w-0"><span className="truncate font-semibold">{h.title.split(' · ')[0]}</span><span className="text-[11px] text-muted truncate">{[h.municipality, k(h.price_cents), rec && `oferta ${k(rec.open)}`].filter(Boolean).join(' · ')}</span></span>
                {a1 ? cell(a1.status, a1.slack, a1.cuota) : <span />}
                {a2 ? cell(a2.status, a2.slack, a2.cuota) : <span className="text-muted text-right">—</span>}
              </span>
            )
          })}
          <span className="text-[11px] text-muted">+ = os sobra margen; − = falta. Incluye impuestos, reforma estimada y honorarios de cada casa.</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">Precio máximo de compra según la reforma</span>
        {rows.map(({ r, x }) => (
          <span key={r} className="flex justify-between text-[13px] border-b border-line last:border-0 py-1">
            <span className="text-muted">{r ? `Con ${k(r)} de reforma` : 'Sin reforma'}</span>
            <span><b>{k(x?.price)}</b> <span className="text-muted">· entrar a vivir {k(x?.ready)}</span></span>
          </span>
        ))}
      </div>
      {scen[0].sale != null && (
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold">Si vendéis por menos (sin reforma)</span>
          {scen.map(({ d, sale, x }) => (
            <span key={d} className="flex justify-between text-[13px] border-b border-line last:border-0 py-1">
              <span className="text-muted">{d ? `Vendiendo un ${Math.round(d * 100)} % menos (${k(sale)})` : `Vendiendo a ${k(sale)}`}</span>
              <b>compra hasta {k(x?.price)}</b>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted">Estimación orientativa: el banco decide con su estudio (edad, contrato, vinculaciones).</p>
      <button onClick={onEdit} className="self-start min-h-9 px-3 rounded-xl border border-line text-sm font-semibold">✏️ Cambiar los datos</button>
    </div>
  )
}

function FinanceForm({ m, householdId, fin, onDone }: { m: Mudanza; householdId: string; fin: Finance | null; onDone: () => void }) {
  const [income, setIncome] = useState(priceInput(fin?.income_cents))
  const [debts, setDebts] = useState(priceInput(fin?.debts_cents))
  const [savings, setSavings] = useState(priceInput(fin?.savings_cents))
  const [cushion, setCushion] = useState(priceInput(fin?.cushion_cents))
  const [tin, setTin] = useState(fin?.tin != null ? String(fin.tin).replace('.', ',') : '')
  const [years, setYears] = useState(fin?.years != null ? String(fin.years) : '')
  const [error, setError] = useState('')
  async function save() {
    const t = tin.trim() ? Number(tin.replace(',', '.')) : null
    const y = years.trim() ? parseInt(years, 10) : null
    if (!income.trim()) { setError('Pon los ingresos netos al mes: sin ellos no se puede calcular la cuota.'); return }
    if (t != null && (!Number.isFinite(t) || t < 0 || t > 15)) { setError('El tipo tiene que ser un % entre 0 y 15.'); return }
    if (y != null && (!Number.isFinite(y) || y < 5 || y > 40)) { setError('El plazo tiene que estar entre 5 y 40 años.'); return }
    const finance: Finance = { income_cents: parsePrice(income), debts_cents: parsePrice(debts), savings_cents: parsePrice(savings), cushion_cents: parsePrice(cushion), tin: t, years: y }
    const q = m.criteria
      ? supabase.from('search_criteria').update({ finance }).eq('household_id', householdId)
      : supabase.from('search_criteria').insert({ household_id: householdId, finance })
    const { error: err } = await q
    if (err) { setError('No se ha podido guardar. Inténtalo de nuevo.'); return }
    await m.reload(); onDone()
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">Lo que deja la venta sale solo de Vendemos. Estos datos solo los veis vosotros.</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Ingresos netos al mes (los dos)" inputMode="decimal" value={income} onChange={e => setIncome(e.target.value)} placeholder="€" />
        <TextField label="Otras cuotas al mes" inputMode="decimal" value={debts} onChange={e => setDebts(e.target.value)} placeholder="coche, préstamos…" />
        <TextField label="Ahorros que ponéis" inputMode="decimal" value={savings} onChange={e => setSavings(e.target.value)} placeholder="€" />
        <TextField label="Colchón que no se toca" inputMode="decimal" value={cushion} onChange={e => setCushion(e.target.value)} placeholder="€" />
        <TextField label="Tipo de la hipoteca (%)" inputMode="decimal" value={tin} onChange={e => setTin(e.target.value)} placeholder={`${String(DEF_TIN).replace('.', ',')} (si lo dejas vacío)`} />
        <TextField label="Plazo (años)" inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} placeholder={`${DEF_YEARS} (si lo dejas vacío)`} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button onClick={() => void save()} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg font-semibold">Calcular</button>
    </div>
  )
}
