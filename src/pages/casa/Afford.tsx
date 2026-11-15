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
  const [saleTxt, setSaleTxt] = useState(fin?.sim?.sale ?? '')
  const [buyTxt, setBuyTxt] = useState(fin?.sim?.buy ?? '')
  const [reformTxt, setReformTxt] = useState(fin?.sim?.reform ?? '')
  // Se guarda al salir de cada campo (lo ven los dos y se recupera la próxima vez)
  async function saveSim() {
    const sim = { sale: saleTxt.trim(), buy: buyTxt.trim(), reform: reformTxt.trim() }
    const old = fin?.sim ?? {}
    if (sim.sale === (old.sale ?? '') && sim.buy === (old.buy ?? '') && sim.reform === (old.reform ?? '')) return
    if (!m.criteria) return
    await supabase.from('search_criteria').update({ finance: { ...(fin ?? {}), sim } }).eq('household_id', m.criteria.household_id)
    await m.reload()
  }
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
          {([['Vendemos a', saleTxt, setSaleTxt, k(saleNetAt(m)?.sale ?? null)], ['Compramos a', buyTxt, setBuyTxt, '€'], ['Reforma', reformTxt, setReformTxt, '0']] as const).map(([lb, v, set, ph]) => (
            <label key={lb} className="flex flex-col gap-1 min-w-0">
              <span className="text-[12px] font-semibold text-muted">{lb}</span>
              <input inputMode="decimal" value={v} onChange={e => set(e.target.value)} onBlur={() => void saveSim()} placeholder={ph}
                className="w-full min-w-0 min-h-10 px-2 rounded-lg border border-line bg-bg text-[14px]" />
            </label>
          ))}
        </div>
        <span className="flex justify-between gap-2 text-[11px] text-muted"><span>Vacío = lo de la app (precio de Vendemos). Se guarda lo último que pongáis.</span>{(saleTxt || buyTxt || reformTxt) && <button type="button" onClick={() => { setSaleTxt(''); setBuyTxt(''); setReformTxt(''); if (m.criteria) void supabase.from('search_criteria').update({ finance: { ...(fin ?? {}), sim: null } }).eq('household_id', m.criteria.household_id).then(() => m.reload()) }} className="font-semibold text-accent shrink-0">Vaciar</button>}</span>
      </div>

      <Story m={m} fin={fin} b={b} sim={sim} buy={buy} reform={reform} top={top} />

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

/** El cálculo contado paso a paso: qué necesitáis → qué ponéis → cuánto os prestan → qué cuota queda */
function Story({ m, fin, b, sim, buy, reform, top }: {
  m: Mudanza; fin: Finance | null; b: ReturnType<typeof affordBase>; sim: ReturnType<typeof affordAt>; buy: number | null; reform: number; top: ReturnType<typeof maxPrice>
}) {
  const sale = b.sale
  const mort = m.listing?.mortgage_cents ?? 0
  const scosts = (m.listing?.costs ?? []).reduce((a, c) => a + (c.cents || 0), 0)
  const eur = (c: number | null | undefined) => price(c ?? 0)
  const cuotaTxt = (c: number | null | undefined) => `${Math.round((c ?? 0) / 100).toLocaleString('es-ES')} €/mes`
  const ltv = buy ? Math.round(buy * 0.8) : null
  const steps: { icon: string; title: string; value: string; detail: string; tone?: string }[] = []
  if (buy && sim) steps.push({ icon: '🏠', title: 'Qué necesitáis', value: eur(sim.need), detail: `compra ${eur(buy)} + impuestos y gastos ~${eur(sim.costs)}${reform ? ` + reforma ${eur(reform)}` : ''}` })
  steps.push({
    icon: '💶', title: 'Qué ponéis vosotros', value: eur(b.own),
    detail: [sale ? `venta ${eur(sale.sale)}${sale.manual ? ' (a mano)' : ''}${mort ? ` − hipoteca pendiente ${eur(mort)}` : ''}${scosts ? ` − gastos de venta ${eur(scosts)}` : ''} = ${eur(sale.net)}` : 'sin venta', fin?.savings_cents ? `+ ahorros ${eur(fin.savings_cents)}` : '', fin?.cushion_cents ? `− colchón ${eur(fin.cushion_cents)}` : ''].filter(Boolean).join(' ')
  })
  steps.push({ icon: '📅', title: 'Cuota máxima', value: cuotaTxt(b.maxCuota), detail: `${Math.round(RATIO * 100)} % de ${eur(fin?.income_cents)} de ingresos${fin?.debts_cents ? ` − otras cuotas ${eur(fin.debts_cents)}` : ''}` })
  steps.push({
    icon: '🏦', title: 'Hipoteca máxima', value: eur(ltv != null ? Math.min(ltv, b.maxLoan ?? 0) : b.maxLoan),
    detail: `con esa cuota al ${String(b.tin).replace('.', ',')} % a ${b.years} años: ${eur(b.maxLoan)}${ltv != null ? ` · el banco presta como mucho el 80 % del precio: ${eur(ltv)}` : ''}`
  })
  if (buy && sim) {
    steps.push({ icon: '🧾', title: 'Qué hipoteca necesitáis', value: eur(sim.loan), detail: sim.loan ? `${eur(sim.need)} que necesitáis − ${eur(b.own)} que ponéis` : 'os llega con vuestro dinero', tone: sim.status === 'no' ? 'text-danger' : undefined })
    steps.push({ icon: '💳', title: 'Qué cuota queda', value: sim.cuota ? cuotaTxt(sim.cuota) : '0 €/mes', detail: fin?.income_cents && sim.cuota ? `el ${Math.round(sim.cuota * 100 / fin.income_cents)} % de los ingresos` : '' })
  }
  const verdict = buy && sim
    ? { tone: sim.status === 'no' ? 'bg-danger/10 text-danger' : sim.status === 'justo' ? 'bg-[#E0A21B]/15 text-[#C77A12]' : 'bg-accent-soft text-accent', text: `${AFFORD_ICON[sim.status]} ${sim.status === 'no' ? 'No llega' : sim.status === 'justo' ? 'Muy justo' : 'Entra'}: ${sim.slack >= 0 ? `os sobran ~${k(sim.slack)} de margen` : `faltan ~${k(-sim.slack)}`}${sim.why ? ` (${sim.why})` : ''}` }
    : top ? { tone: 'bg-accent-soft', text: `Hasta ~${k(top.ready)} para entrar a vivir (compra hasta ~${k(top.price)} sin reforma). Lo que os limita: ${top.why === 'entrada' ? 'vuestro dinero (el banco solo presta el 80 %)' : 'la cuota (30 % de los ingresos)'}.` } : null
  return (
    <div className="flex flex-col">
      {steps.map((st, n) => (
        <div key={st.title} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="w-7 h-7 rounded-full bg-bg text-[13px] font-bold flex items-center justify-center shrink-0">{n + 1}</span>
            {n < steps.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
          </div>
          <div className="flex-1 min-w-0 pb-3">
            <span className="flex justify-between items-baseline gap-2">
              <span className="text-[14px] font-semibold">{st.icon} {st.title}</span>
              <b className={`text-[15px] shrink-0 ${st.tone ?? ''}`}>{st.value}</b>
            </span>
            {st.detail && <span className="block text-[12px] text-muted">{st.detail}</span>}
          </div>
        </div>
      ))}
      {verdict && <p className={`rounded-xl p-3 text-[14px] font-semibold ${verdict.tone}`}>{verdict.text}</p>}
      {!buy && <p className="text-[11px] text-muted mt-1">Pon un precio en «Compramos a» para ver qué hipoteca necesitáis y qué cuota queda.</p>}
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
    const finance: Finance = { income_cents: parsePrice(income), debts_cents: parsePrice(debts), savings_cents: parsePrice(savings), cushion_cents: parsePrice(cushion), tin: t, years: y, sim: fin?.sim ?? null }
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
