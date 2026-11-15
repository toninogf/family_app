// «🧮 ¿Hasta dónde podemos llegar?» en Buscamos: límite para entrar a vivir según venta, ahorros, ingresos e hipoteca
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parsePrice, price, priceInput, type Mudanza } from '../../lib/mudanza'
import { AFFORD_ICON, DEF_TIN, DEF_YEARS, RATIO, affordAt, affordBase, affordHome, maxPrice, saleNetAt, type Finance } from '../../lib/afford'
import { recommend } from '../../lib/pricing'
import type { Home } from '../../lib/mudanza'

/** «Chalet pareado · Los Linares · Moralzarzal» (sin habitaciones ni metros, para distinguirlas) */
const shortName = (h: Home) => {
  const parts = h.title.split(' · ').map(x => x.replace(/\s+\d+\s*(hab\.?|m²).*$/i, '').trim()).filter(Boolean)
  const kind = parts[0] ?? h.title
  const where = parts.slice(1).find(x => x !== h.municipality && !/^\d/.test(x))
  return [kind, where, h.municipality].filter(Boolean).join(' · ')
}

const k = (c: number | null | undefined) => (c == null ? '—' : `${Math.round(c / 100000).toLocaleString('es-ES')} k€`)

export function AffordCard({ m, householdId }: { m: Mudanza; householdId: string }) {
  const fin = (m.criteria?.finance ?? null) as Finance | null
  const [open, setOpen] = useState(false)
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
      {open && <Result m={m} householdId={householdId} fin={fin} />}
    </section>
  )
}

function Result({ m, householdId, fin: saved }: { m: Mudanza; householdId: string; fin: Finance | null }) {
  // Vuestros datos: se escriben una vez, el cálculo se actualiza al teclear y se guardan al salir de cada campo
  const [d, setD] = useState({
    income: priceInput(saved?.income_cents), debts: priceInput(saved?.debts_cents), savings: priceInput(saved?.savings_cents),
    cushion: priceInput(saved?.cushion_cents), tin: saved?.tin != null ? String(saved.tin).replace('.', ',') : '', years: saved?.years != null ? String(saved.years) : ''
  })
  const num = (x: string) => { const n = Number(x.replace(',', '.')); return x.trim() && Number.isFinite(n) ? n : null }
  const tinN = num(d.tin), yearsN = num(d.years)
  const fin: Finance = {
    ...(saved ?? {}),
    income_cents: d.income.trim() ? parsePrice(d.income) : null, debts_cents: d.debts.trim() ? parsePrice(d.debts) : null,
    savings_cents: d.savings.trim() ? parsePrice(d.savings) : null, cushion_cents: d.cushion.trim() ? parsePrice(d.cushion) : null,
    tin: tinN != null && tinN >= 0 && tinN <= 15 ? tinN : null, years: yearsN != null && yearsN >= 5 && yearsN <= 40 ? Math.round(yearsN) : null
  }
  async function saveData() {
    const keys = ['income_cents', 'debts_cents', 'savings_cents', 'cushion_cents', 'tin', 'years'] as const
    if (saved && keys.every(k => (fin[k] ?? null) === (saved[k] ?? null))) return
    const q = m.criteria
      ? supabase.from('search_criteria').update({ finance: fin }).eq('household_id', householdId)
      : supabase.from('search_criteria').insert({ household_id: householdId, finance: fin })
    await q
    await m.reload()
  }
  const field = (key: keyof typeof d, label: string, ph: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label key={key} className="flex flex-col gap-1 min-w-0">
      <span className="text-[12px] font-semibold text-muted truncate">{label}</span>
      <input inputMode={mode} value={d[key]} onChange={e => setD(x => ({ ...x, [key]: e.target.value }))} onBlur={() => void saveData()} placeholder={ph}
        className="w-full min-w-0 min-h-10 px-2 rounded-lg border border-line bg-bg text-[14px]" />
    </label>
  )
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
    await supabase.from('search_criteria').update({ finance: { ...(fin ?? {}), sim: { ...(fin?.sim ?? {}), ...sim } } }).eq('household_id', m.criteria.household_id)
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
  
  return (
    <div className="flex flex-col gap-3">
      <details className="rounded-xl bg-bg p-3" open={!saved?.income_cents}>
        <summary className="cursor-pointer text-[14px] font-bold">👛 Vuestros datos <span className="text-[11px] text-muted font-normal">· se guardan solos · solo los veis vosotros</span></summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {field('income', 'Ingresos netos/mes (los dos)', '€')}
          {field('debts', 'Otras cuotas/mes', 'coche, préstamos…')}
          {field('savings', 'Ahorros que ponéis', '€')}
          {field('cushion', 'Colchón que no se toca', '€')}
          {field('tin', 'Tipo hipoteca (%)', String(DEF_TIN).replace('.', ','))}
          {field('years', 'Plazo (años)', String(DEF_YEARS), 'numeric')}
        </div>
        <span className="block text-[11px] text-muted mt-1.5">Lo que deja la venta sale de Vendemos (o de «Vendemos a» en Simular). Tipo y plazo vacíos = {String(DEF_TIN).replace('.', ',')} % y {DEF_YEARS} años.</span>
      </details>
      {!fin.income_cents ? <p className="text-[13px] text-[#C77A12]">Pon los ingresos netos al mes para calcular la cuota y la hipoteca.</p> : <>
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
        <span className="flex justify-between gap-2 text-[11px] text-muted"><span>Vacío = lo de la app (precio de Vendemos). Se guarda lo último que pongáis.</span>{(saleTxt || buyTxt || reformTxt) && <button type="button" onClick={() => { setSaleTxt(''); setBuyTxt(''); setReformTxt(''); if (m.criteria) void supabase.from('search_criteria').update({ finance: { ...(fin ?? {}), sim: fin?.sim?.home ? { home: fin.sim.home } : null } }).eq('household_id', m.criteria.household_id).then(() => m.reload()) }} className="font-semibold text-accent shrink-0">Vaciar</button>}</span>
      </div>

      <Story m={m} fin={fin} b={b} sim={sim} buy={buy} reform={reform} top={top} />

      {homes.length > 0 && <HomeCheck m={m} b={b} homes={homes} fin={fin} manualSale={!!saleOv} />}

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
      </>}
    </div>
  )
}

/** 🏠 Una casa elegida, en detalle: a lo que piden y con la oferta (con su reforma, impuestos y honorarios) */
function HomeCheck({ m, b, homes, fin, manualSale }: { m: Mudanza; b: ReturnType<typeof affordBase>; homes: Home[]; fin: Finance; manualSale: boolean }) {
  const [id, setId] = useState(fin.sim?.home && homes.some(h => h.id === fin.sim!.home) ? fin.sim.home : '')
  async function pick(v: string) {
    setId(v)
    if (m.criteria) { await supabase.from('search_criteria').update({ finance: { ...fin, sim: { ...(fin.sim ?? {}), home: v } } }).eq('household_id', m.criteria.household_id); await m.reload() }
  }
  const h = homes.find(x => x.id === id)
  const rec = h ? recommend(h, m.homes) : null
  const cols = h ? [{ label: 'A lo que piden', at: h.price_cents! }, ...(rec ? [{ label: 'Con la oferta inicial', at: rec.open }] : [])].map(c => ({ ...c, a: affordHome(b, h, c.at) })) : []
  const tone = (st: 'ok' | 'justo' | 'no') => (st === 'no' ? 'text-danger' : st === 'justo' ? 'text-[#C77A12]' : 'text-accent')
  const row = (lb: string, v: string, strong = false) => <span className={`flex justify-between gap-2 ${strong ? 'font-bold border-t border-line pt-1' : ''}`}><span className={strong ? '' : 'text-muted'}>{lb}</span><span className="shrink-0">{v}</span></span>
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">🏠 ¿Y esta casa?{manualSale ? ' (con la venta puesta a mano)' : ''}</span>
        <select value={id} onChange={e => void pick(e.target.value)} className="w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-[14px]">
          <option value="">Elige una casa…</option>
          {homes.map(x => <option key={x.id} value={x.id}>{shortName(x)} · {k(x.price_cents)}</option>)}
        </select>
      </label>
      {h && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cols.map(({ label, at, a }) => a && (
            <div key={label} className="rounded-xl bg-bg p-3 flex flex-col gap-1 text-[13px]">
              <span className="text-[13px] font-bold">{label}</span>
              {row('Compra', price(at))}
              {row('Impuestos y gastos', price(a.costs))}
              {a.reform ? row('Reforma estimada', price(a.reform)) : null}
              {a.fee ? row('Honorarios inmobiliaria', price(a.fee)) : null}
              {row('Para entrar a vivir', price(a.need), true)}
              {row('Ponéis vosotros', `− ${price(Math.min(b.own, a.need))}`)}
              {row('Hipoteca necesaria', price(a.loan), true)}
              {row('Hipoteca máxima', `${price(a.limit)} (${a.limit < (b.maxLoan ?? 0) ? '80 % del precio' : 'por la cuota'})`)}
              {row('Cuota', a.cuota ? `${Math.round(a.cuota / 100).toLocaleString('es-ES')} €/mes${fin.income_cents ? ` (${Math.round(a.cuota * 100 / fin.income_cents)} %)` : ''}` : 'sin hipoteca')}
              <b className={`mt-1 ${tone(a.status)}`}>{AFFORD_ICON[a.status]} {a.slack >= 0 ? `Os sobran ~${k(a.slack)} de margen` : `Faltan ~${k(-a.slack)}`}{a.why ? ` (${a.why})` : ''}</b>
            </div>
          ))}
        </div>
      )}
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
