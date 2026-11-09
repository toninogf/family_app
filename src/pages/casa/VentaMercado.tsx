import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FEATURES, parsePrice, portalName, price, priceInput, priceShort, type Competitor, type Mudanza } from '../../lib/mudanza'
import { CONDITION_LABEL, OBJECTION_HELP, adjustments, adjTotal, threshold, thermometer, valuation, type Condition } from '../../lib/venta'
import { today } from '../../lib/dates'
import { ConfirmDelete, Sheet, TextArea } from '../../components/Sheet'
import { Field, SelectField } from '../../components/FormKit'

const toneCls = (t: string) => (t === 'ok' ? 'text-accent' : t === 'warn' ? 'text-[#C77A12]' : t === 'bad' ? 'text-danger' : 'text-muted')
const dot = (t: string) => (t === 'ok' ? '🟢' : t === 'warn' ? '🟠' : t === 'bad' ? '🔴' : '⚪')

/** «¿Estamos en precio?»: valoración, termómetro, umbrales de los portales y simulador */
export function MarketCard({ m, householdId }: { m: Mudanza; householdId: string }) {
  const l = m.listing
  const asking = l?.price_cents ?? null
  const v = valuation(l, m.competitors)
  const th = threshold(asking)
  const t = today()
  const thermo = thermometer({ visits: m.visits, offers: m.offers, asking, publishedOn: l?.published_on ?? null, today: t, avgDays: l?.market?.avg_days, prices: m.prices, competitors: m.competitors })
  const [refsOpen, setRefsOpen] = useState(false)
  const diff = v && asking ? Math.round((asking / v.target - 1) * 100) : null

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-card rounded-2xl p-4 flex flex-col gap-2.5">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-bold text-[15px]">📊 ¿Estamos en precio?</span>
          {v && <span className={`text-[12px] font-semibold ${v.confidence === 'alta' ? 'text-accent' : 'text-[#C77A12]'}`}>Fiabilidad {v.confidence}</span>}
        </div>
        {v ? (
          <>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <span className="rounded-xl bg-bg p-2 flex flex-col"><span className="text-[11px] text-muted">Salida</span><span className="text-[15px] font-bold">{priceShort(v.start)}</span></span>
              <span className="rounded-xl bg-accent-soft p-2 flex flex-col"><span className="text-[11px] text-muted">Objetivo</span><span className="text-[17px] font-bold text-accent">{priceShort(v.target)}</span></span>
              <span className="rounded-xl bg-bg p-2 flex flex-col"><span className="text-[11px] text-muted">Suelo</span><span className="text-[15px] font-bold">{priceShort(v.low)}</span></span>
            </div>
            {diff != null && (
              <p className={`text-[14px] font-semibold ${Math.abs(diff) <= 4 ? 'text-accent' : diff > 0 ? 'text-danger' : 'text-accent'}`}>
                Pedís {price(asking)}: {Math.abs(diff) <= 4 ? 'en precio' : diff > 0 ? `un ${diff} % por encima del objetivo` : `un ${-diff} % por debajo del objetivo (podríais pedir más)`}
              </p>
            )}
            <p className="text-[12px] text-muted">Objetivo ≈ {price(v.perM2)}/m² × {v.m2} m², con: {v.sources.join('; ')}.</p>
            {v.prem.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[12px] text-muted">Lo que tiene el vuestro frente a un piso medio de la zona:</span>
                <span className="flex gap-1 flex-wrap">{v.prem.map(p => <span key={p.label} className={`px-2 py-0.5 rounded-lg text-[12px] ${p.pct > 0 ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>{p.label} {p.pct > 0 ? '+' : ''}{p.pct} %</span>)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">Para valorarlo hacen falta los m² del piso y pisos parecidos en «Competencia» o las referencias de la zona (abajo). La búsqueda de los martes y viernes los va rellenando.</p>
        )}
        {th && (
          <p className="text-[13px] rounded-xl bg-[#C77A12]/12 px-3 py-2">
            🔎 Estáis {price(th.over)} por encima de {price(th.at)}: quien filtra en los portales «hasta {priceShort(th.at)}» no os ve. Bajar a {price(th.at)} os mete en muchas más búsquedas.
          </p>
        )}
        <button onClick={() => setRefsOpen(!refsOpen)} className="self-start min-h-9 text-[13px] font-semibold text-accent">{refsOpen ? '▾' : '▸'} Referencias de la zona{l?.market?.at ? ` (al ${l.market.at})` : ''}</button>
        {refsOpen && <MarketRefs m={m} householdId={householdId} />}
      </section>

      <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
        <span className="font-bold text-[15px]">🌡️ Termómetro</span>
        <p className={`text-[14px] font-semibold ${toneCls(thermo.verdict.tone)}`}>{thermo.verdict.text}</p>
        {thermo.signals.map(s => <span key={s.text} className="text-[13px]">{dot(s.tone)} {s.text}</span>)}
      </section>

      <Simulator m={m} />
    </div>
  )
}

/** €/m² pagado (notarías), pedido (portales) y días medios a la venta: a mano o desde la búsqueda */
function MarketRefs({ m, householdId }: { m: Mudanza; householdId: string }) {
  const mk = m.listing?.market ?? {}
  const [paid, setPaid] = useState(mk.paid_m2?.toString() ?? '')
  const [ask, setAsk] = useState(mk.asking_m2?.toString() ?? '')
  const [days, setDays] = useState(mk.avg_days?.toString() ?? '')
  const [msg, setMsg] = useState('')
  const n = (x: string) => { const v = Number(x.replace(/\./g, '').replace(',', '.')); return x.trim() && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined }
  async function save() {
    const err = await m.write('sale_listing', { household_id: householdId, market: { paid_m2: n(paid), asking_m2: n(ask), avg_days: n(days), source: 'manual', at: today() } }, undefined, 'household_id')
    setMsg(err ?? 'Guardado')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Pagado €/m²" inputMode="numeric" value={paid} onChange={e => setPaid(e.target.value)} placeholder="Notarías" />
        <Field label="Pedido €/m²" inputMode="numeric" value={ask} onChange={e => setAsk(e.target.value)} placeholder="Portales" />
        <Field label="Días a la venta" inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} placeholder="Media" />
      </div>
      <p className="text-[11px] text-muted">Pagado: portal del Notariado (penotariado.com) para vuestro barrio. Pedido: informe de precios de idealista o fotocasa. {mk.source === 'ia' ? 'Ahora mismo los puso la búsqueda automática.' : ''}</p>
      <div className="flex gap-2 items-center">
        <button onClick={save} className="min-h-10 px-4 rounded-xl border border-line text-sm font-semibold">Guardar referencias</button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  )
}

/** Si lo vendemos a X: cuánto nos queda y si llega para la compra */
function Simulator({ m }: { m: Mudanza }) {
  const l = m.listing
  const [p, setP] = useState(priceInput(l?.price_cents))
  const [buy, setBuy] = useState<{ savings_cents: number | null; loan_cents: number | null } | null>(null)
  useEffect(() => { void supabase.from('purchase').select('savings_cents, loan_cents').maybeSingle().then(({ data }) => setBuy(data as never)) }, [])
  const cents = parsePrice(p)
  const costs = (l?.costs ?? []).reduce((s, c) => s + (c.cents || 0), 0)
  const net = cents != null ? cents - (l?.mortgage_cents ?? 0) - costs : null
  const budget = m.criteria?.max_price_cents ?? null
  const need = budget != null ? budget - (buy?.savings_cents ?? 0) - (buy?.loan_cents ?? 0) : null
  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <span className="font-bold text-[15px]">🧮 Si lo vendemos a…</span>
      <Field label="Precio de venta" suffix="€" inputMode="decimal" value={p} onChange={e => setP(e.target.value)} />
      {net != null && (
        <>
          <span className="flex justify-between text-[14px]"><span className="text-muted">Nos queda limpio</span><b>{price(net)}</b></span>
          {need != null && (
            <span className={`text-[13px] font-semibold ${net >= need ? 'text-accent' : 'text-danger'}`}>
              {net >= need ? `✅ Llega para comprar hasta ${priceShort(budget!)} para entrar a vivir (sobran ${price(net - need)})` : `Faltarían ${price(need - net)} para comprar hasta ${priceShort(budget!)} para entrar a vivir`}
            </span>
          )}
          <span className="text-[11px] text-muted">Precio − hipoteca pendiente − gastos de la venta.{need != null ? ` Para comprar se cuenta el presupuesto de «Qué buscamos»${buy?.savings_cents || buy?.loan_cents ? ', vuestros ahorros y la hipoteca de Compramos' : ' (sin ahorros ni hipoteca nueva: ponlos en Compramos)'}.` : ''}</span>
        </>
      )}
    </section>
  )
}

/** La competencia: pisos parecidos en venta, ajustados a cómo es el vuestro */
export function Competitors({ m, householdId }: { m: Mudanza; householdId: string }) {
  const [edit, setEdit] = useState<Competitor | 'new' | null>(null)
  const [showOld, setShowOld] = useState(false)
  const l = m.listing
  const ourM2 = l?.price_cents && l.size_m2 ? l.price_cents / Number(l.size_m2) : null
  const list = m.competitors.filter(c => showOld || c.status === 'activo')
  const old = m.competitors.filter(c => c.status !== 'activo').length
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted">El €/m² de cada uno se corrige por lo que le falta o le sobra frente al vuestro (exterior, estado, aire, baños, planta, terraza…). La búsqueda de los martes y viernes añade y vigila pisos; también puedes añadirlos a mano.</p>
      {list.length === 0 && <p className="text-sm text-muted">Aún no hay pisos de la competencia.</p>}
      {list.map(c => {
        const adj = l ? adjustments(l, c) : []
        const total = adjTotal(adj)
        const raw = c.price_cents && c.size_m2 ? c.price_cents / Number(c.size_m2) : null
        const adjusted = raw != null ? raw * (1 + total / 100) : null
        const hist = c.price_history
        const dropped = c.first_price_cents && c.price_cents && c.price_cents < c.first_price_cents
        return (
          <button key={c.id} onClick={() => setEdit(c)} className={`rounded-2xl bg-card p-3 text-left flex flex-col gap-1 ${c.status !== 'activo' ? 'opacity-60' : ''}`}>
            <span className="flex justify-between gap-2 items-baseline">
              <span className="text-[14px] font-semibold min-w-0 truncate">{c.title}</span>
              <span className="text-[15px] font-bold shrink-0">{price(c.price_cents)}</span>
            </span>
            <span className="text-[12px] text-muted">
              {[c.zone, c.size_m2 && `${Number(c.size_m2)} m²`, c.rooms != null && `${c.rooms} hab.`, c.baths != null && `${c.baths} baños`, c.floor, c.status !== 'activo' && (c.status === 'vendido' ? 'vendido' : 'retirado'), dropped && `📉 ha bajado ${price(c.first_price_cents! - c.price_cents!)}`, hist.length > 1 && `${hist.length - 1} cambio${hist.length > 2 ? 's' : ''} de precio`].filter(Boolean).join(' · ')}
            </span>
            {raw != null && (
              <span className="text-[13px]">
                {price(Math.round(raw))}/m² → <b>{price(Math.round(adjusted!))}/m²</b> <span className="text-muted">comparado con el vuestro</span>
                {ourM2 != null && adjusted != null && <span className={ourM2 > adjusted * 1.05 ? 'text-danger' : 'text-accent'}> · vosotros {price(Math.round(ourM2))}/m²</span>}
              </span>
            )}
            {adj.length > 0 && (
              <span className="flex gap-1 flex-wrap">{adj.map(a => <span key={a.label} className={`px-1.5 py-0.5 rounded-md text-[11px] ${a.pct > 0 ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>{a.label} {a.pct > 0 ? '+' : ''}{a.pct} %</span>)}</span>
            )}
          </button>
        )
      })}
      <div className="flex gap-2 items-center">
        <button onClick={() => setEdit('new')} className="flex-1 min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir un piso parecido</button>
        {old > 0 && <button onClick={() => setShowOld(!showOld)} className="min-h-11 px-3 text-[13px] text-muted">{showOld ? 'Ocultar' : `Ver ${old}`} vendidos/retirados</button>}
      </div>
      {edit && <CompetitorSheet c={edit === 'new' ? undefined : edit} m={m} householdId={householdId} onClose={() => setEdit(null)} />}
    </div>
  )
}

const COMP_FEATURES = ['exterior', 'aire', 'ascensor', 'terraza', 'balcon', 'garaje', 'trastero', 'portero', 'piscina_comunitaria', 'reformado']

function CompetitorSheet({ c, m, householdId, onClose }: { c?: Competitor; m: Mudanza; householdId: string; onClose: () => void }) {
  const [url, setUrl] = useState(c?.url ?? '')
  const [title, setTitle] = useState(c?.title ?? '')
  const [zone, setZone] = useState(c?.zone ?? m.listing?.zone ?? '')
  const [amount, setAmount] = useState(priceInput(c?.price_cents))
  const [m2, setM2] = useState(c?.size_m2?.toString() ?? '')
  const [rooms, setRooms] = useState(c?.rooms?.toString() ?? '')
  const [baths, setBaths] = useState(c?.baths?.toString() ?? '')
  const [floor, setFloor] = useState(c?.floor ?? '')
  const [cond, setCond] = useState<Condition | null>(c?.condition ?? null)
  const [reformYear, setReformYear] = useState(c?.reform_year?.toString() ?? '')
  const [features, setFeatures] = useState<string[]>(c?.features ?? [])
  const [status, setStatus] = useState<Competitor['status']>(c?.status ?? 'activo')
  const [notes, setNotes] = useState(c?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const int = (x: string) => (x.trim() && Number.isFinite(Number(x)) ? Math.round(Number(x)) : null)

  async function save() {
    if (!title.trim()) { setError('Pon un título'); return }
    const cents = amount.trim() ? parsePrice(amount) : null
    const u = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : null
    const hist = c?.price_history ?? []
    const data = {
      household_id: householdId, title: title.trim().slice(0, 160), url: u, zone: zone.trim() || null, price_cents: cents,
      first_price_cents: c?.first_price_cents ?? cents, size_m2: m2.trim() ? Number(m2.replace(',', '.')) : null, rooms: int(rooms), baths: int(baths),
      floor: floor.trim() || null, condition: cond, reform_year: /^\d{4}$/.test(reformYear.trim()) ? Number(reformYear) : null, features, status, notes: notes.trim() || null,
      price_history: cents != null && cents !== c?.price_cents ? [...hist, { date: today(), cents }].slice(-60) : hist
    }
    const err = await m.write('sale_competitors', data, c?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={c ? 'Piso de la competencia' : 'Añadir un piso parecido'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Enlace del anuncio" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.idealista.com/…" />
        {c?.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="self-start text-[13px] font-semibold text-accent">🔗 Abrir en {portalName(c.url) ?? 'el portal'} ↗</a>}
        <Field label="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="Piso 2 hab. en Vallehermoso" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Zona" value={zone} onChange={e => setZone(e.target.value)} />
          <Field label="Precio" suffix="€" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="m²" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} />
          <Field label="Hab." inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <Field label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} />
          <Field label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField<Condition> label="Estado" value={cond} onChange={setCond} options={(Object.keys(CONDITION_LABEL) as Condition[]).map(k => ({ value: k, label: CONDITION_LABEL[k] }))} />
          <Field label="Año de reforma" inputMode="numeric" value={reformYear} onChange={e => setReformYear(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {COMP_FEATURES.map(k => {
            const on = features.includes(k)
            return <button key={k} type="button" onClick={() => setFeatures(f => (on ? f.filter(x => x !== k) : [...f, k]))} aria-pressed={on}
              className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>{FEATURES[k] ?? k}</button>
          })}
        </div>
        <SelectField<Competitor['status']> label="Situación" value={status} onChange={v => setStatus(v ?? 'activo')} empty="En venta"
          options={[{ value: 'vendido', label: 'Vendido' }, { value: 'retirado', label: 'Retirado' }]} />
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={600} />
        {c && c.price_history.length > 1 && <p className="text-[12px] text-muted">Historial: {c.price_history.map(h => `${h.date.slice(5).split('-').reverse().join('/')} ${priceShort(h.cents)}`).join(' → ')}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button onClick={save} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
        {c && <ConfirmDelete label="Quitar de la competencia" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('sale_competitors', c.id); onClose() }} />}
      </div>
    </Sheet>
  )
}

/** Para las pegas que más salen en las visitas: qué responder y qué arreglar */
export function ObjectionHelp({ objections }: { objections: [string, number][] }) {
  const items = objections.filter(([o]) => OBJECTION_HELP[o]).slice(0, 4)
  if (!items.length) return null
  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <span className="font-bold text-[15px]">💬 Cómo responder a las pegas</span>
      {items.map(([o, n]) => (
        <div key={o} className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">«{o}» <span className="text-muted font-normal">({n})</span></span>
          <span className="text-[13px]">{OBJECTION_HELP[o].reply}</span>
          {OBJECTION_HELP[o].fix && <span className="text-[12px] text-muted">🛠️ {OBJECTION_HELP[o].fix}</span>}
        </div>
      ))}
    </section>
  )
}
