import { useEffect, useState } from 'react'
import { BUILDING_LABEL, FEATURES, LIGHT_LABEL, NOISE_LABEL, parsePrice, portalName, price, priceInput, priceShort, type BuildingState, type Competitor, type Light, type Mudanza, type Noise } from '../../lib/mudanza'
import { soldWeight, CONDITION_ICON, CONDITION_LABEL, conditionAdj, conditionOf, OBJECTION_HELP, adjustments, adjTotal, competitorFromLinkPrompt, competitorsPrompt, opinionPrompt, parseCompetitors, sameUrl, threshold, thermometer, valuation, type CompParse, type Condition } from '../../lib/venta'
import { today } from '../../lib/dates'
import { compDays, compMarket, exitRange, MARKET_MIN_GONE } from '../../lib/compMarket'
import { saleNet } from '../../lib/funds'
import { needFromSale } from '../../lib/afford'
import { usePurchaseLoan } from '../../lib/purchaseFunds'
import { ConfirmDelete, Sheet, TextArea } from '../../components/Sheet'
import { Field, SelectField } from '../../components/FormKit'
import { ImportDiffs, importMessage, merger, type ImportDiff } from '../../components/ListingImport'

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
      <AiOpinion m={m} />
    </div>
  )
}

/** €/m² pagado (notarías), pedido (portales) y días medios a la venta: a mano o desde la búsqueda */
/** Dónde mirar a mano las referencias (no hay API: se consultan cada cierto tiempo) */
function refLinks(zone: string | null, municipality: string | null) {
  const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  // «Vallehermoso, Chamberí» → barrio y distrito (Madrid capital)
  const [barrio, distrito] = (zone ?? '').split(',').map(x => x.trim()).filter(Boolean)
  // El informe por barrio de idealista a veces da «sin permisos»: enlace al del distrito y, de respaldo, una búsqueda que lleva al del barrio
  const base = 'https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid-comunidad/madrid-provincia/madrid/'
  const idealista = municipality === 'Madrid' && (distrito || barrio) ? `${base}${slug(distrito || barrio)}/` : 'https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/'
  const search = `https://www.google.com/search?q=${encodeURIComponent(`idealista precio vivienda venta ${[barrio, distrito, municipality].filter(Boolean).join(' ')} €/m²`)}`
  return { notariado: 'https://penotariado.com/inmobiliario', idealista, search }
}

function MarketRefs({ m, householdId }: { m: Mudanza; householdId: string }) {
  const mk = m.listing?.market ?? {}
  const links = refLinks(m.listing?.zone ?? null, m.listing?.municipality ?? null)
  const [paid, setPaid] = useState(mk.paid_m2?.toString() ?? '')
  const [ask, setAsk] = useState(mk.asking_m2?.toString() ?? '')
  const [days, setDays] = useState(mk.avg_days?.toString() ?? '')
  const [msg, setMsg] = useState('')
  // Si la búsqueda automática (u otro móvil) cambia las referencias, se ven aquí sin recargar
  useEffect(() => { setPaid(mk.paid_m2?.toString() ?? ''); setAsk(mk.asking_m2?.toString() ?? ''); setDays(mk.avg_days?.toString() ?? '') }, [mk.paid_m2, mk.asking_m2, mk.avg_days])
  const n = (x: string) => { const v = Number(x.replace(/\./g, '').replace(',', '.')); return x.trim() && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined }
  async function save() {
    const p = n(paid), a = n(ask)
    // Se conserva la fuente de cada dato si no se ha cambiado; si se cambia, queda como puesto a mano
    const next = {
      ...mk, paid_m2: p, asking_m2: a, avg_days: n(days), source: 'manual', at: today(),
      paid_note: p === mk.paid_m2 ? mk.paid_note : p ? `Puesto a mano (${today()})` : undefined,
      asking_note: a === mk.asking_m2 ? mk.asking_note : a ? `Puesto a mano (${today()})` : undefined
    }
    const err = await m.write('sale_listing', { household_id: householdId, market: JSON.parse(JSON.stringify(next)) }, undefined, 'household_id')
    setMsg(err ?? 'Guardado')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Pagado €/m²" inputMode="numeric" value={paid} onChange={e => setPaid(e.target.value)} placeholder="Notarías" />
        <Field label="Pedido €/m²" inputMode="numeric" value={ask} onChange={e => setAsk(e.target.value)} placeholder="Portales" />
        <Field label="Días a la venta" inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} placeholder="Media" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <a href={links.notariado} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🏛️ Pagado: Notariado ↗</a>
        <a href={links.idealista} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🏷️ Pedido: idealista (distrito) ↗</a>
        <a href={links.search} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">🔎 Pedido del barrio ↗</a>
      </div>
      <p className="text-[11px] text-muted -mt-1">En el Notariado, busca vuestro código postal en el mapa y mira la media de los últimos 3 meses (un mes suelto salta mucho). En idealista, el precio medio de venta del barrio (si el enlace del distrito no abre, usa «Pedido del barrio», que lo busca). Revísalos cada mes.</p>
      {(mk.paid_note || mk.asking_note) ? (
        <div className="text-[12px] text-muted flex flex-col gap-0.5">
          {mk.paid_note && <span>Pagado: {mk.paid_note}</span>}
          {mk.asking_note && <span>Pedido: {mk.asking_note}</span>}
        </div>
      ) : <p className="text-[11px] text-muted">Pagado: portal del Notariado (penotariado.com) para vuestro código postal. Pedido: informe de precios de idealista o fotocasa del barrio.</p>}
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
  const loanChosen = usePurchaseLoan()
  const cents = parsePrice(p)
  const net = cents != null ? saleNet(m, { price: cents }).net : null
  const budget = m.criteria?.max_price_cents ?? null
  const nf = needFromSale(budget, m.criteria?.finance, loanChosen)
  const need = nf?.need ?? null
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
          <span className="text-[11px] text-muted">Precio − hipoteca pendiente − gastos de la venta.{need != null ? ` Para comprar se cuenta el presupuesto de «Qué buscamos»${nf && (nf.savings || nf.loan) ? `, ${price(nf.savings)} de ahorros y ${price(nf.loan)} de hipoteca (${nf.loanFrom === 'compramos' ? 'la de Compramos' : 'la máxima de «¿Hasta dónde podemos llegar?»'})` : ' (sin ahorros ni hipoteca: ponlos en «¿Hasta dónde podemos llegar?», en Buscamos)'}.` : ''}</span>
        </>
      )}
    </section>
  )
}

/** La competencia: pisos parecidos en venta, ajustados a cómo es el vuestro */
/** Por qué no vale una propuesta de la búsqueda automática (la búsqueda lo lee para no volver a traerla) */
const COMP_REJECT = ['Ya no está publicado', 'No se parece al nuestro', 'Otra zona', 'Datos erróneos', 'Repetido'] as const

/**
 * Pisos que ha traído la búsqueda automática: se revisan (abrir el anuncio) y se aceptan o se rechazan.
 * Solo los aceptados cuentan en «¿Estamos en precio?»; los rechazados no vuelven.
 */
/** «🔨 a reformar» (lo puesto a mano o, si no, lo que se deduce del año de reforma) */
function condText(c: Competitor) {
  const k = conditionOf({ features: c.features, reform_year: c.reform_year, year_built: c.year_built, condition: c.condition })
  return k ? `${CONDITION_ICON[k]} ${CONDITION_LABEL[k].replace(/ \(.*\)$/, '').toLowerCase()}` : null
}

/** «unos 45 días a la venta» (aprox. si no sabemos cuándo se publicó) */
function daysText(c: Competitor) {
  const d = compDays(c, today())
  const since = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date((c.listed_on ?? c.first_seen) + 'T12:00:00Z'))
  return `${d.exact ? '' : '≥ '}${d.days} día${d.days === 1 ? '' : 's'} ${d.ongoing ? 'a la venta' : 'en venta'} (${d.exact ? 'anunciado' : 'visto'} el ${since})`
}

/** «📊 Cómo se mueve el mercado»: entradas y salidas de pisos parecidos, cuánto tardan y cuánto bajan, frente al vuestro */
function MarketMoves({ m }: { m: Mudanza }) {
  const s = compMarket(m.competitors, m.listing, today())
  if (!s.active && !s.gone) return null
  const enough = s.gone >= MARKET_MIN_GONE
  const ref = s.medianDaysSold ?? s.medianDays
  const k = (c: number) => `${Math.round(c / 100).toLocaleString('es-ES')} €/m²`
  return (
    <div className="rounded-2xl bg-card p-3 flex flex-col gap-1.5 text-[13px]">
      <span className="font-bold text-[14px]">📊 Cómo se mueve el mercado</span>
      <span>{s.active} parecido{s.active === 1 ? '' : 's'} a la venta · últimas 4 semanas: <b>+{s.newIn}</b> nuevo{s.newIn === 1 ? '' : 's'}, <b>{s.soldOut}</b> vendido{s.soldOut === 1 ? '' : 's'} y <b>{s.withdrawnOut}</b> retirado{s.withdrawnOut === 1 ? '' : 's'}</span>
      {enough ? (
        <>
          <span>⏱️ Tardan en irse <b>unos {ref} días</b>{s.medianDaysSold != null && s.medianDays != null && s.sold < s.gone ? <span className="text-muted"> (vendidos; contando también los retirados, {s.medianDays})</span> : null}
            {s.exact < s.gone ? <span className="text-muted"> · aproximado: de {s.gone - s.exact} no sabemos cuándo se publicaron (serán algunos días más)</span> : null}</span>
          {s.droppedShare != null && <span>📉 {s.droppedShare} % bajaron antes de irse{s.avgDrop ? <> (de media un <b>{s.avgDrop.toLocaleString('es-ES')} %</b>)</> : ''}</span>}
          {s.ourDays != null && ref != null && (
            <span className={s.ourDays > ref * 1.5 ? 'text-danger font-semibold' : ''}>🏠 Vosotros lleváis <b>{s.ourDays} días</b>{s.ourDays > ref * 1.5 ? ': bastante más que los parecidos; toca revisar precio o presentación' : s.ourDays > ref ? ': ya más que la media' : ': dentro de lo normal'}</span>
          )}
        </>
      ) : (
        <span className="text-muted">Cuando se vayan {MARKET_MIN_GONE} o más ({s.gone} hasta ahora) os diré cuánto tardan en venderse y cuánto bajan antes. La búsqueda de los martes y viernes los va siguiendo.</span>
      )}
      {(s.soldM2 != null || s.activeM2 != null) && s.ourM2 != null && (
        <span>💶 Corregido al vuestro: {s.soldM2 != null ? <>vendidos <b>{k(s.soldM2)}</b> · </> : null}{s.activeM2 != null ? <>a la venta {k(s.activeM2)} · </> : null}vosotros <b className={s.ourM2 > (s.soldM2 ?? s.activeM2!) * 1.05 ? 'text-danger' : ''}>{k(s.ourM2)}</b></span>
      )}
      {s.relisted > 0 && <span className="text-muted">🔁 {s.relisted} han vuelto a salir con otro anuncio: se cuentan como el mismo piso.</span>}
      <span className="text-[11px] text-muted">Retirado no siempre es vendido: los vendidos pesan más en la valoración del vuestro (completos hasta 3 meses, la mitad hasta 6; después dejan de contar).</span>
    </div>
  )
}

function CompetitorProposals({ m }: { m: Mudanza }) {
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [other, setOther] = useState('')
  const [showRejected, setShowRejected] = useState(false)
  const l = m.listing
  const ourM2 = l?.price_cents && l.size_m2 ? l.price_cents / Number(l.size_m2) : null
  const props = m.competitorProposals
  const rejected = m.competitorRejected
  if (!props.length && !rejected.length) return null

  const accept = (c: Competitor) => m.write('sale_competitors', { review: null, reject_reason: null }, c.id)
  const reject = async (c: Competitor, reason: string) => {
    await m.write('sale_competitors', { review: 'rechazado', reject_reason: reason.slice(0, 200) }, c.id)
    setRejecting(null); setOther('')
  }
  return (
    <div className="flex flex-col gap-2">
      {props.length > 0 && (
        <div className="rounded-2xl border border-dashed border-accent/60 p-3 flex flex-col gap-2">
          <span className="font-semibold text-[14px]">🤖 Por revisar ({props.length})</span>
          <span className="text-[12px] text-muted -mt-1">Los ha traído la búsqueda automática. Abre el anuncio y acepta los que sigan publicados y se parezcan al vuestro: solo los aceptados cuentan en la valoración.</span>
          {props.map(c => {
            const raw = c.price_cents && c.size_m2 ? c.price_cents / Number(c.size_m2) : null
            const adj = l ? adjTotal(adjustments(l, c)) : 0
            return (
              <div key={c.id} className="rounded-xl bg-card p-3 flex flex-col gap-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold text-[14px] min-w-0 truncate">{c.title}</span>
                  <span className="font-bold shrink-0">{c.price_cents != null ? price(c.price_cents) : '—'}</span>
                </div>
                <span className="text-[12px] text-muted">
                  {[c.zone, c.size_m2 && `${Number(c.size_m2)} m²`, c.rooms != null && `${c.rooms} hab.`, c.baths != null && `${c.baths} baños`, c.floor, condText(c),
                    raw && `${Math.round(raw / 100).toLocaleString('es-ES')} €/m²${ourM2 ? ` (vuestro ${Math.round(ourM2 / 100).toLocaleString('es-ES')})` : ''}`,
                    raw && Math.abs(adj) >= 0.5 && `ajustado ${adj > 0 ? '+' : ''}${adj.toFixed(1).replace('.', ',')} %`].filter(Boolean).join(' · ')}
                </span>
                {c.notes && <span className="text-[12px]">{c.notes}</span>}
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold text-accent flex items-center">🔗 {portalName(c.url) ?? 'Anuncio'} ↗</a>}
                  <button onClick={() => accept(c)} className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-[13px] font-semibold">✅ Aceptar</button>
                  <button onClick={() => setRejecting(rejecting === c.id ? null : c.id)} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold">🙅 Rechazar</button>
                </div>
                {rejecting === c.id && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <span className="text-[12px] text-muted">¿Por qué? (la búsqueda no volverá a traerlo)</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {COMP_REJECT.map(r => <button key={r} onClick={() => reject(c, r)} className="min-h-9 px-3 rounded-lg border border-line text-[12px]">{r}</button>)}
                    </div>
                    <div className="flex gap-1.5">
                      <input value={other} onChange={e => setOther(e.target.value)} placeholder="Otro motivo" maxLength={200}
                        className="flex-1 min-w-0 min-h-10 px-3 rounded-lg border border-line bg-bg text-[13px]" />
                      {other.trim() && <button onClick={() => reject(c, other.trim())} className="min-h-10 px-3 rounded-lg border border-line text-[13px] font-semibold">Rechazar</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {rejected.length > 0 && (
        <button onClick={() => setShowRejected(!showRejected)} className="self-start text-[12px] text-muted min-h-9">
          {showRejected ? '▾' : '▸'} Rechazados ({rejected.length})
        </button>
      )}
      {showRejected && rejected.map(c => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-[12px] text-muted px-1">
          <span className="min-w-0 truncate">{c.title}{c.reject_reason ? ` · ${c.reject_reason}` : ''}</span>
          <button onClick={() => m.write('sale_competitors', { review: 'propuesta', reject_reason: null }, c.id)} className="shrink-0 min-h-9 px-2 text-accent font-semibold">Recuperar</button>
        </div>
      ))}
    </div>
  )
}

export function Competitors({ m, householdId }: { m: Mudanza; householdId: string }) {
  const [edit, setEdit] = useState<Competitor | 'new' | null>(null)
  const [showOld, setShowOld] = useState(false)
  const l = m.listing
  const ourM2 = l?.price_cents && l.size_m2 ? l.price_cents / Number(l.size_m2) : null
  const list = m.competitors.filter(c => c.status === 'activo')
  // Los que ya no están: aparte, los más recientes primero
  const gone = m.competitors.filter(c => c.status !== 'activo').sort((a, b) => (b.off_market_on ?? b.last_seen).localeCompare(a.off_market_on ?? a.last_seen))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted">El €/m² de cada uno se corrige por lo que le falta o le sobra frente al vuestro (exterior, estado, aire, baños, planta, terraza…). La búsqueda de los martes y viernes añade y vigila pisos; también puedes añadirlos a mano.</p>
      <MarketMoves m={m} />
      <CompetitorProposals m={m} />
      <AiCompetitorSearch m={m} householdId={householdId} />
      {list.length === 0 && <p className="text-sm text-muted">Aún no hay pisos de la competencia verificados.</p>}
      {list.map(c => card(c))}
      <div className="flex gap-2 items-center">
        <button onClick={() => setEdit('new')} className="flex-1 min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir un piso parecido</button>
      </div>
      {gone.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <button onClick={() => setShowOld(!showOld)} aria-expanded={showOld} className="flex items-center gap-2 text-left min-h-11">
            <span className="font-bold text-[14px] flex-1">🏁 Ya no están a la venta ({gone.length})</span>
            <span className="text-[12px] text-muted">{gone.filter(c => c.status === 'vendido').length} vendidos · {gone.filter(c => c.status === 'retirado').length} retirados</span>
            <span className="text-muted" aria-hidden="true">{showOld ? '▴' : '▾'}</span>
          </button>
          {showOld && gone.map(c => card(c))}
        </div>
      )}
      {edit && <CompetitorSheet c={edit === 'new' ? undefined : edit} m={m} householdId={householdId} onClose={() => setEdit(null)} />}
    </div>
  )

  function card(c: Competitor) {
        const adj = l ? adjustments(l, c) : []
        const total = adjTotal(adj)
        const raw = c.price_cents && c.size_m2 ? c.price_cents / Number(c.size_m2) : null
        const adjusted = raw != null ? raw * (1 + total / 100) : null
        const hist = c.price_history
        const dropped = c.first_price_cents && c.price_cents && c.price_cents < c.first_price_cents
        return (
          // Tarjeta pulsable (abre la ficha) con el enlace al anuncio dentro: div con rol de botón para no anidar <a> en <button>
          <div key={c.id} role="button" tabIndex={0} onClick={() => setEdit(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEdit(c) } }}
            className={`rounded-2xl p-3 text-left flex flex-col gap-1 cursor-pointer ${c.status === 'activo' ? 'bg-card' : 'bg-card/60 border border-line'}`}>
            {c.status !== 'activo' && (
              <span className={`self-start text-[12px] font-bold px-2 py-0.5 rounded-lg ${c.status === 'vendido' ? 'bg-[#1F8A4C]/15 text-[#1F8A4C]' : 'bg-line text-muted'}`}>
                {c.status === 'vendido' ? '🤝 Vendido' : '🚫 Retirado'}{exitRange(c) ? ` ${exitRange(c)}` : ''}
                {c.status === 'vendido' && (soldWeight(c) === 0 ? ' · ya no cuenta para el precio (más de 6 meses)' : soldWeight(c) < 1 ? ' · cuenta la mitad (3–6 meses)' : '')}
                {c.status === 'retirado' && c.off_market_on && c.off_market_on < new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10) ? ' · ya no cuenta (más de 6 meses)' : ''}
              </span>
            )}
            <span className="flex justify-between gap-2 items-baseline">
              <span className="text-[14px] font-semibold min-w-0 truncate">{c.title}</span>
              <span className="text-[15px] font-bold shrink-0">{price(c.price_cents)}</span>
            </span>
            <span className="text-[12px] text-muted">
              {[c.zone, c.size_m2 && `${Number(c.size_m2)} m²`, c.rooms != null && `${c.rooms} hab.`, c.baths != null && `${c.baths} baños`, c.floor, condText(c), c.year_built && `finca ${c.year_built}${c.building_reform_year ? ` (rehab. ${c.building_reform_year})` : ''}`, 
                `${c.status === 'activo' ? '⏱️ ' : ''}${daysText(c)}`, c.relisted > 0 && `🔁 reanunciado${c.relisted > 1 ? ` ${c.relisted} veces` : ''}`, dropped && `📉 ha bajado ${price(c.first_price_cents! - c.price_cents!)}`, hist.length > 1 && `${hist.length - 1} cambio${hist.length > 2 ? 's' : ''} de precio`].filter(Boolean).join(' · ')}
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
            {c.url && (
              <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="self-start min-h-9 px-3 mt-0.5 rounded-lg border border-line text-[13px] font-semibold text-accent flex items-center">🔗 Ver en {portalName(c.url) ?? 'el portal'} ↗</a>
            )}
          </div>
        )
  }
}

// «Reformado» no va aquí: sale del estado (abajo) para que no se contradigan
const COMP_FEATURES = ['exterior', 'aire', 'ascensor', 'terraza', 'balcon', 'garaje', 'trastero', 'portero', 'piscina_comunitaria']

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
  const [listedOn, setListedOn] = useState(c?.listed_on ?? '')
  const [yearBuilt, setYearBuilt] = useState(c?.year_built?.toString() ?? '')
  const [buildingRehab, setBuildingRehab] = useState(c?.building_reform_year?.toString() ?? '')
  const [features, setFeatures] = useState<string[]>(c?.features ?? [])
  const [status, setStatus] = useState<Competitor['status']>(c?.status ?? 'activo')
  const [notes, setNotes] = useState(c?.notes ?? '')
  const [fee, setFee] = useState(priceInput(c?.community_fee_cents))
  const [central, setCentral] = useState(c?.heating_type === 'central')
  const [energy, setEnergy] = useState<string | null>(c?.energy ?? null)
  const [building, setBuilding] = useState<BuildingState | null>(c?.building_state ?? null)
  const [derrama, setDerrama] = useState(priceInput(c?.derrama_cents))
  const [noise, setNoise] = useState<Noise | null>(c?.noise ?? null)
  const [light, setLight] = useState<Light | null>(c?.light ?? null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const int = (x: string) => (x.trim() && Number.isFinite(Number(x)) ? Math.round(Number(x)) : null)
  // Ayuda de la IA: le pasas el enlace, contesta con un JSON y se rellena la ficha (solo lo que esté vacío)
  const [aiNote, setAiNote] = useState('')
  const [diffs, setDiffs] = useState<ImportDiff[]>([])
  const [aiText, setAiText] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const fullUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : ''

  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude') {
    const prompt = competitorFromLinkPrompt(fullUrl, m.listing)
    let copied = true
    try { await navigator.clipboard.writeText(prompt) } catch { copied = false }
    const q = encodeURIComponent(prompt)
    window.open(ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app', '_blank', 'noopener')
    setAiOpen(true)
    setAiNote(copied ? 'Petición copiada. Cuando conteste, copia su respuesta y pulsa «Pegar respuesta».' : 'No se ha podido copiar: dale permiso al portapapeles.')
  }
  function fillFrom(t: string) {
    const r = parseCompetitors(t)
    const x = r.items[0]
    if (r.error || !x) { setAiNote(r.error ?? 'La respuesta no trae el piso.'); return }
    // Lo vacío se rellena; si ya había otro valor, no se toca y se ofrece en la lista de diferencias
    const f = merger()
    const eurIn = (c: number | null | undefined) => (c != null ? priceInput(c) : null)
    const year = (y: number | null | undefined) => (y != null ? String(Math.round(y)) : null)
    f.put('nombre', title, x.title !== 'Piso parecido' ? x.title : null, setTitle, { diff: false })
    f.put('zona', zone === m.listing?.zone ? '' : zone, x.zone, setZone)
    f.put('precio', amount, eurIn(x.price_cents), setAmount)
    f.put('m²', m2, x.size_m2 != null ? String(x.size_m2) : null, setM2)
    f.put('habitaciones', rooms, year(x.rooms), setRooms)
    f.put('baños', baths, year(x.baths), setBaths)
    f.put('planta', floor, x.floor, setFloor)
    f.put('estado', cond ? CONDITION_LABEL[cond] : null, x.condition ? CONDITION_LABEL[x.condition] : null, () => setCond(x.condition))
    f.put('año de reforma', reformYear, year(x.reform_year), setReformYear)
    f.put('año de la finca', yearBuilt, year(x.year_built), setYearBuilt)
    f.put('rehabilitación de la finca', buildingRehab, year(x.building_reform_year), setBuildingRehab)
    f.put('comunidad', fee, eurIn(x.community_fee_cents), setFee)
    f.put('certificado', energy, x.energy, () => setEnergy(x.energy))
    f.put('edificio', building ? BUILDING_LABEL[building] : null, x.building_state ? BUILDING_LABEL[x.building_state] : null, () => setBuilding(x.building_state))
    f.put('derrama', derrama, eurIn(x.derrama_cents), setDerrama)
    f.put('ruido', noise ? NOISE_LABEL[noise] : null, x.noise ? NOISE_LABEL[x.noise] : null, () => setNoise(x.noise))
    f.put('luz', light ? LIGHT_LABEL[light] : null, x.light ? LIGHT_LABEL[x.light] : null, () => setLight(x.light))
    f.put('notas', notes, x.notes, setNotes, { diff: false })
    if (x.heating_type === 'central' && !central) { setCentral(true); f.filled.push('calefacción central') }
    const newF = x.features.filter(k => COMP_FEATURES.includes(k) && !features.includes(k))
    if (newF.length) { setFeatures(cur => [...cur, ...newF]); f.filled.push('características') }
    if (x.status !== status) {
      if (status === 'activo') { setStatus(x.status); f.filled.push('situación') }
      else { const L = { activo: 'en venta', vendido: 'vendido', retirado: 'retirado' } as const; f.diffs.push({ label: 'situación', now: L[status], next: L[x.status], use: () => setStatus(x.status) }) }
    }
    setAiText(''); setAiOpen(false)
    setDiffs(f.diffs)
    const msg = importMessage('✨ Rellenado', f.filled, f.diffs.length)
    setAiNote(f.filled.length || f.diffs.length ? msg.text : 'La respuesta no añade nada a lo que ya tienes.')
  }
  async function pasteAi() {
    try { const t = await navigator.clipboard.readText(); setAiText(t); fillFrom(t) } catch { setAiOpen(true); setAiNote('No puedo leer el portapapeles: pega la respuesta en el recuadro.') }
  }

  async function save() {
    if (!title.trim()) { setError('Pon un título'); return }
    const cents = amount.trim() ? parsePrice(amount) : null
    const u = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : null
    const hist = c?.price_history ?? []
    const data = {
      household_id: householdId, title: title.trim().slice(0, 160), url: u, zone: zone.trim() || null, price_cents: cents,
      first_price_cents: c?.first_price_cents ?? cents, size_m2: m2.trim() ? Number(m2.replace(',', '.')) : null, rooms: int(rooms), baths: int(baths),
      floor: floor.trim() || null, condition: cond, reform_year: /^\d{4}$/.test(reformYear.trim()) ? Number(reformYear) : null,
      year_built: /^\d{4}$/.test(yearBuilt.trim()) ? Number(yearBuilt) : null, building_reform_year: /^\d{4}$/.test(buildingRehab.trim()) ? Number(buildingRehab) : null,
      features: [...features.filter(f => f !== 'reformado'), ...(cond === 'reformado' ? ['reformado'] : [])], status, notes: notes.trim() || null,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, heating_type: central ? 'central' : c?.heating_type === 'central' ? null : c?.heating_type ?? null,
      energy, building_state: building, derrama_cents: derrama.trim() ? parsePrice(derrama) : null, noise, light,
      price_history: cents != null && cents !== c?.price_cents ? [...hist, { date: today(), cents }].slice(-60) : hist,
      listed_on: listedOn || null,
      // Al marcarlo vendido o retirado a mano: sale hoy (la última vez a la venta, la que teníamos); si vuelve, se borra
      ...(status !== 'activo' && (!c || c.status === 'activo') ? { off_market_on: today(), off_market_after: c?.last_seen ?? null }
        : status === 'activo' && c && c.status !== 'activo' ? { off_market_on: null, off_market_after: null, relisted: c.relisted + 1 } : {})
    }
    const err = await m.write('sale_competitors', data, c?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={c ? 'Piso de la competencia' : 'Añadir un piso parecido'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Enlace del anuncio" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.idealista.com/…" />
        {c?.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="self-start text-[13px] font-semibold text-accent">🔗 Abrir en {portalName(c.url) ?? 'el portal'} ↗</a>}
        <div className="rounded-2xl bg-card p-3 flex flex-col gap-2">
          <span className="text-[13px] font-semibold">✨ Rellenar con la IA</span>
          {!fullUrl ? <span className="text-[12px] text-muted">Pega arriba el enlace del anuncio y la IA te saca los datos.</span> : (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {(['chatgpt', 'claude', 'gemini'] as const).map(ai => (
                  <button key={ai} type="button" onClick={() => askAi(ai)} className="min-h-10 px-3 rounded-xl border border-line bg-bg text-[13px] font-semibold">
                    {ai === 'chatgpt' ? 'ChatGPT' : ai === 'claude' ? 'Claude' : 'Gemini'} ↗
                  </button>
                ))}
                <button type="button" onClick={pasteAi} className="min-h-10 px-3 rounded-xl bg-accent text-white dark:text-bg text-[13px] font-semibold">📋 Pegar respuesta</button>
              </div>
              {aiOpen && (
                <div className="flex flex-col gap-1.5">
                  <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={3} placeholder="O pega aquí la respuesta de la IA"
                    className="w-full px-3 py-2 rounded-xl border border-line bg-bg text-[14px]" />
                  {aiText.trim() && <button type="button" onClick={() => fillFrom(aiText)} className="self-start min-h-10 px-3 rounded-xl border border-line text-[13px] font-semibold">Rellenar</button>}
                </div>
              )}
            </>
          )}
          {aiNote && <span className="text-[12px] text-muted">{aiNote}</span>}
          <ImportDiffs diffs={diffs} onChange={setDiffs} />
        </div>
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
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Estado del piso</span>
          <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Estado del piso">
            {(Object.keys(CONDITION_LABEL) as Condition[]).map(k => {
              const on = cond === k
              return <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setCond(on ? null : k)}
                className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>{CONDITION_ICON[k]} {CONDITION_LABEL[k]}</button>
            })}
          </div>
          {(() => {
            const a = m.listing ? conditionAdj(m.listing, cond) : null
            if (a == null) return cond ? null : <span className="text-[12px] text-muted">Pesa en la comparación con el vuestro: un piso a reformar vale bastante menos por m².</span>
            return <span className="text-[12px] text-muted">{a === 0 ? 'Mismo estado que el vuestro: no corrige nada.' : `En la comparación, su €/m² se corrige un ${a > 0 ? '+' : ''}${a} % (${a > 0 ? 'el vuestro está mejor' : 'está mejor que el vuestro'}).`}</span>
          })()}
          <Field label="Año de reforma del piso" inputMode="numeric" value={reformYear} onChange={e => setReformYear(e.target.value)} placeholder="Si lo dice" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Año de la finca" inputMode="numeric" value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} placeholder="Anuncio o Catastro" />
          <Field label="Rehabilitación finca" inputMode="numeric" value={buildingRehab} onChange={e => setBuildingRehab(e.target.value)} placeholder="Si se sabe" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {COMP_FEATURES.map(k => {
            const on = features.includes(k)
            return <button key={k} type="button" onClick={() => setFeatures(f => (on ? f.filter(x => x !== k) : [...f, k]))} aria-pressed={on}
              className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>{k === 'garaje' ? 'Garaje incluido' : FEATURES[k] ?? k}</button>
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Comunidad" suffix="€/mes" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} />
          <SelectField<string> label="Certificado" value={energy} onChange={setEnergy} options={'ABCDEFG'.split('').map(x => ({ value: x, label: x }))} />
        </div>
        <label className="flex items-center gap-2 text-[14px] min-h-10">
          <input type="checkbox" checked={central} onChange={e => setCentral(e.target.checked)} className="w-5 h-5" />
          <span>Calefacción central (va en la comunidad)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <SelectField<BuildingState> label="Edificio" value={building} onChange={setBuilding} options={(Object.keys(BUILDING_LABEL) as BuildingState[]).map(k => ({ value: k, label: BUILDING_LABEL[k] }))} />
          <Field label="Derrama" suffix="€" inputMode="decimal" value={derrama} onChange={e => setDerrama(e.target.value)} placeholder="Si la hay" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField<Noise> label="Ruido" value={noise} onChange={setNoise} options={(Object.keys(NOISE_LABEL) as Noise[]).map(k => ({ value: k, label: NOISE_LABEL[k] }))} />
          <SelectField<Light> label="Luz" value={light} onChange={setLight} options={(Object.keys(LIGHT_LABEL) as Light[]).map(k => ({ value: k, label: LIGHT_LABEL[k] }))} />
        </div>
        <SelectField<Competitor['status']> label="Situación" value={status} onChange={v => setStatus(v ?? 'activo')} empty="En venta"
          options={[{ value: 'vendido', label: 'Vendido' }, { value: 'retirado', label: 'Retirado' }]} />
        <Field label="Anuncio publicado el (aprox.)" type="date" value={listedOn} max={today()} onChange={e => setListedOn(e.target.value)} />
        {c && (() => {
          const d = compDays({ ...c, listed_on: listedOn || null }, today())
          return <p className="text-[12px] text-muted -mt-1">{!listedOn ? `Sin fecha del anuncio: se cuenta desde que lo encontramos (${c.first_seen.split('-').reverse().slice(0, 2).join('/')}). ` : !d.exact ? `El anuncio dice una fecha posterior a cuando lo encontramos (se republicaría): se cuenta desde el ${c.first_seen.split('-').reverse().slice(0, 2).join('/')}. ` : ''}{d.ongoing ? 'Lleva' : 'Estuvo'} {d.exact ? 'unos' : '≥'} {d.days} días a la venta{c.status !== 'activo' && exitRange(c) ? `; salió ${exitRange(c)}` : ''}.</p>
        })()}
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

/** Segunda opinión: prepara un texto con todos los datos de la venta y abre la IA */
function AiOpinion({ m }: { m: Mudanza }) {
  const [note, setNote] = useState('')
  const loanChosen = usePurchaseLoan()
  const l = m.listing
  if (!l) return null
  async function ask(ai: 'chatgpt' | 'gemini' | 'claude') {
    const net = saleNet(m).net
    const need = needFromSale(m.criteria?.max_price_cents, m.criteria?.finance, loanChosen)?.need ?? null
    const prompt = opinionPrompt({ l: l!, competitors: m.competitors, visits: m.visits, offers: m.offers, prices: m.prices, today: today(), net, need })
    let copied = true
    try { await navigator.clipboard.writeText(prompt) } catch { copied = false }
    // Si el texto es muy largo, el enlace no lo lleva entero: se pega desde el portapapeles
    const q = encodeURIComponent(prompt.length < 6000 ? prompt : 'Ahora te pego mi petición (la tengo copiada). Espera a que la pegue.')
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setNote(copied ? (q && ai !== 'gemini' ? 'Abierta con todos los datos (también están copiados por si no aparecen).' : 'Datos copiados: pégalos en la IA y envía.') : 'No se ha podido copiar: dale permiso al portapapeles e inténtalo otra vez.')
    window.open(target, '_blank', 'noopener')
  }
  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <span className="font-bold text-[15px]">🤖 Pedir opinión a la IA</span>
      <span className="text-[13px] text-muted">Le pasa vuestro piso, la competencia con sus ajustes, las referencias, las visitas, las ofertas y lo que calcula la app, y le pide que lo contraste en la web: si estáis en precio, si conviene bajar y cómo vender mejor.</span>
      <div className="grid grid-cols-3 gap-2">
        {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, lb]) => (
          <button key={k} onClick={() => void ask(k)} className="min-h-11 rounded-xl border border-line text-sm font-semibold">{lb}</button>
        ))}
      </div>
      {note && <p role="status" className="text-[12px] text-muted">{note}</p>}
    </section>
  )
}

/** Buscar pisos parecidos con una IA: se le pide, se pega su respuesta, se revisan y se añaden */
function AiCompetitorSearch({ m, householdId }: { m: Mudanza; householdId: string }) {
  const [note, setNote] = useState('')
  const [parsed, setParsed] = useState<CompParse | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveMarket, setSaveMarket] = useState(true)
  const l = m.listing
  if (!l) return null

  async function ask(ai: 'chatgpt' | 'gemini' | 'claude') {
    const prompt = competitorsPrompt(l!, m.competitors)
    let copied = true
    try { await navigator.clipboard.writeText(prompt) } catch { copied = false }
    const q = encodeURIComponent(prompt.length < 6000 ? prompt : 'Ahora te pego mi petición (la tengo copiada). Espera a que la pegue.')
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setNote(copied ? 'Petición copiada. Cuando conteste, copia su respuesta y vuelve a «Pegar respuesta de la IA».' : 'No se ha podido copiar: dale permiso al portapapeles.')
    window.open(target, '_blank', 'noopener')
  }
  function load(t: string) {
    const r = parseCompetitors(t)
    setParsed(r)
    if (r.error) { setNote(r.error); return }
    // Por defecto, todos menos los que ya estaban con el mismo precio
    setPicked(new Set(r.items.map((x, i) => [x, i] as const).filter(([x]) => !m.competitors.some(c => sameUrl(c.url, x.url) && c.price_cents === x.price_cents)).map(([, i]) => i)))
    setNote(r.items.length ? `${r.items.length} piso${r.items.length > 1 ? 's' : ''} en la respuesta. Revisa y añade.` : 'La respuesta no trae pisos.')
  }
  async function paste() {
    try { const t = await navigator.clipboard.readText(); setText(t); load(t) } catch { setNote('No puedo leer el portapapeles: pega la respuesta en el recuadro.') }
  }
  async function add() {
    if (!parsed) return
    setBusy(true)
    let added = 0, updated = 0
    for (const [i, x] of parsed.items.entries()) {
      if (!picked.has(i)) continue
      const cur = m.competitors.find(c => sameUrl(c.url, x.url))
      const base = { ...x, rooms: x.rooms != null ? Math.round(x.rooms) : null, baths: x.baths != null ? Math.round(x.baths) : null, reform_year: x.reform_year != null ? Math.round(x.reform_year) : null }
      if (cur) {
        const changed = x.price_cents != null && x.price_cents !== cur.price_cents
        await m.write('sale_competitors', {
          status: x.status, price_cents: x.price_cents ?? cur.price_cents, last_seen: today(),
          price_history: changed ? [...cur.price_history, { date: today(), cents: x.price_cents! }].slice(-60) : cur.price_history
        }, cur.id)
        updated++
      } else {
        await m.write('sale_competitors', {
          household_id: householdId, ...base, first_price_cents: x.price_cents, source: 'ia',
          price_history: x.price_cents != null ? [{ date: today(), cents: x.price_cents }] : []
        })
        added++
      }
    }
    if (saveMarket && parsed.market) {
      await m.write('sale_listing', { household_id: householdId, market: { ...(l!.market ?? {}), ...parsed.market, source: 'ia', at: today() } }, undefined, 'household_id')
    }
    setBusy(false)
    setParsed(null); setText('')
    setNote(`Hecho: ${added} añadido${added === 1 ? '' : 's'}${updated ? ` y ${updated} actualizado${updated === 1 ? '' : 's'}` : ''}.`)
  }

  return (
    <section className="rounded-2xl bg-accent-soft p-3 flex flex-col gap-2">
      <span className="font-bold text-[14px]">🔎 Buscar pisos parecidos con IA</span>
      <div className="grid grid-cols-3 gap-2">
        {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, lb]) => (
          <button key={k} onClick={() => void ask(k)} className="min-h-10 rounded-xl border border-line bg-card text-sm font-semibold">{lb}</button>
        ))}
      </div>
      <button onClick={() => void paste()} className="min-h-10 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar respuesta de la IA</button>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => text.trim() && load(text)} rows={2} placeholder="…o pégala aquí"
        className="w-full px-3 py-2 rounded-xl border border-line bg-card text-[14px]" />
      {note && <p role="status" className="text-[12px] text-muted">{note}</p>}
      {parsed && parsed.items.length > 0 && l && (
        <div className="flex flex-col gap-1.5">
          {parsed.items.map((x, i) => {
            const fake = { ...x, id: String(i), first_seen: '', last_seen: '', price_history: [], source: 'ia', first_price_cents: x.price_cents, review: null, reject_reason: null, listed_on: null, off_market_on: null, off_market_after: null, relisted: 0, old_urls: [] } as Competitor
            const adj = adjustments(l, fake)
            const raw = x.price_cents && x.size_m2 ? x.price_cents / x.size_m2 : null
            const cur = m.competitors.find(c => sameUrl(c.url, x.url))
            const on = picked.has(i)
            return (
              <label key={i} className={`rounded-xl bg-card p-2.5 flex gap-2 items-start ${on ? '' : 'opacity-60'}`}>
                <input type="checkbox" checked={on} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} className="w-5 h-5 mt-0.5" />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex justify-between gap-2"><span className="text-[13px] font-semibold truncate">{x.title}</span><b className="text-[13px] shrink-0">{price(x.price_cents)}</b></span>
                  <span className="text-[11px] text-muted">{[x.zone, x.size_m2 && `${x.size_m2} m²`, x.rooms != null && `${x.rooms} hab.`, x.baths != null && `${x.baths} baños`, x.floor, x.status !== 'activo' && x.status, cur && (cur.price_cents !== x.price_cents ? `ya lo tenéis: precio ${priceShort(cur.price_cents ?? 0)} → ${priceShort(x.price_cents ?? 0)}` : 'ya lo tenéis')].filter(Boolean).join(' · ')}</span>
                  {raw != null && <span className="text-[12px]">{price(Math.round(raw))}/m² → <b>{price(Math.round(raw * (1 + adjTotal(adj) / 100)))}/m²</b> comparado con el vuestro</span>}
                  {adj.length > 0 && <span className="flex gap-1 flex-wrap">{adj.map(a => <span key={a.label} className={`px-1.5 rounded text-[10px] ${a.pct > 0 ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>{a.label} {a.pct > 0 ? '+' : ''}{a.pct}%</span>)}</span>}
                  {x.notes && <span className="text-[11px] text-muted">{x.notes}</span>}
                </span>
              </label>
            )
          })}
          {parsed.market && (
            <label className="flex items-center gap-2 text-[13px] min-h-10">
              <input type="checkbox" checked={saveMarket} onChange={e => setSaveMarket(e.target.checked)} className="w-5 h-5" />
              <span>Guardar también las referencias de la zona ({[parsed.market.paid_m2 && `pagado ${parsed.market.paid_m2} €/m²`, parsed.market.asking_m2 && `pedido ${parsed.market.asking_m2} €/m²`, parsed.market.avg_days && `${parsed.market.avg_days} días`].filter(Boolean).join(', ')})</span>
            </label>
          )}
          <button onClick={() => void add()} disabled={busy || picked.size === 0} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-bold disabled:opacity-50">
            {busy ? 'Añadiendo…' : `Añadir ${picked.size} piso${picked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </section>
  )
}
