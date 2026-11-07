import { useState, type FormEvent } from 'react'
import { addDays, hhmm, parseISO, relativeDay, shortDate, today } from '../../lib/dates'
import { OFFER_STATUS, parsePrice, price, priceInput, saleDocUrl, type Mudanza } from '../../lib/mudanza'
import {
  ARRAS, CONTACT_ROLES, GROUP_TEMPLATES, PCOST_TEMPLATE, PHASES, PSTEP_TEMPLATE, monthlyPayment,
  type ArrasType, type Compra, type Contact, type Cost, type DocGroup, type MortgageOffer, type PDocStatus, type PStepKind,
  type PurchaseDoc, type PurchaseStep, type RateType
} from '../../lib/compra'
import { Choice, ConfirmDelete, Sheet, TextArea, TextField } from '../../components/Sheet'
import { Fold, saleNet } from './VentaGestion'

const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`

export default function Compramos({ m, c, householdId }: { m: Mudanza; c: Compra; householdId: string }) {
  const [fold, setFold] = useState<string | null>(null)
  const toggle = (k: string) => setFold(f => (f === k ? null : k))
  const p = c.purchase
  const home = m.homes.find(h => h.id === p?.home_id) ?? null
  const t = today()

  if (c.loading || m.loading) return <p className="text-sm text-muted">Cargando…</p>
  if (!home) return <ChooseHome m={m} c={c} householdId={householdId} />

  const offers = m.homeOffers.filter(o => o.home_id === home.id)
  const accepted = offers.find(o => o.status === 'accepted')
  const buyPrice = accepted?.amount_cents ?? offers[0]?.amount_cents ?? home.price_cents ?? null
  const alerts = buildAlerts(c, t)
  const firma = c.steps.find(s => s.kind === 'firma')
  const group = (g: DocGroup) => c.docs.filter(d => d.grp === g)
  const chosen = c.banks.find(b => b.chosen)

  return (
    <div className="flex flex-col gap-5">
      {/* El piso */}
      <div className="bg-accent text-white dark:text-bg rounded-2xl p-4 flex flex-col gap-1">
        <span className="text-[13px] opacity-85">Lo que compramos</span>
        <span className="text-[19px] font-bold leading-tight">{home.title}</span>
        <span className="text-[24px] font-bold leading-tight">{price(buyPrice)}</span>
        <span className="text-[13px] opacity-90">
          {accepted ? `Oferta aceptada el ${shortDate(accepted.offer_date)}` : offers[0] ? `Oferta ${OFFER_STATUS[offers[0].status].toLowerCase()} · ${shortDate(offers[0].offer_date)}` : `Precio del anuncio · aún sin oferta`}
          {home.price_cents && buyPrice && buyPrice !== home.price_cents ? ` · ${Math.round((buyPrice / home.price_cents - 1) * 1000) / 10} % sobre el anuncio` : ''}
        </span>
        {firma?.step_date && !firma.done && <span className="text-[13px] opacity-90">Firma en notaría: {relativeDay(firma.step_date).toLowerCase()} ({daysBetween(t, firma.step_date)} días)</span>}
      </div>
      {home.url && <a href={home.url} target="_blank" rel="noopener noreferrer" className="-mt-3 self-start min-h-9 px-3 rounded-full bg-card border border-line text-[13px] font-semibold text-accent flex items-center">Ver el anuncio ↗</a>}

      {alerts.length > 0 && (
        <div className="bg-card rounded-2xl p-4 flex flex-col gap-1 ring-2 ring-danger">
          <span className="text-[13px] font-semibold text-danger">⚠️ Ojo</span>
          {alerts.map((a, i) => <span key={i} className="text-[14px]">{a}</span>)}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Fold title="🔍 Comprobaciones antes de ofertar" summary={docsSummary(group('comprobacion'), 'Nota simple, cargas, comunidad, obras…')} open={fold === 'check'} onToggle={() => toggle('check')}>
          <PDocs c={c} householdId={householdId} grp="comprobacion" />
        </Fold>
        <Fold title="🤝 Oferta y condiciones" summary={[offers.length ? `${offers.length} oferta${offers.length > 1 ? 's' : ''}` : 'Sin ofertas', p?.arras_type && `arras ${ARRAS[p.arras_type].label.toLowerCase()}`].filter(Boolean).join(' · ')} open={fold === 'oferta'} onToggle={() => toggle('oferta')}>
          <Condiciones m={m} c={c} householdId={householdId} homeId={home.id} />
        </Fold>
        <Fold title="🏦 Hipoteca" summary={[p?.mortgage_phase && PHASES.find(x => x.key === p.mortgage_phase)?.label, chosen ? `${chosen.bank}${chosen.tin != null ? ` al ${pct(chosen.tin)}` : ''}` : c.banks.length ? `${c.banks.length} banco${c.banks.length > 1 ? 's' : ''} comparados` : 'Compara bancos y sigue las fases'].filter(Boolean).join(' · ')} open={fold === 'hipoteca'} onToggle={() => toggle('hipoteca')}>
          <Hipoteca c={c} householdId={householdId} />
          <h3 className="font-bold text-[15px] mt-2">Lo que pide el banco</h3>
          <PDocs c={c} householdId={householdId} grp="banco" />
        </Fold>
        <Fold title="✍️ Pasos hasta las llaves" summary={stepsSummary(c.steps)} open={fold === 'pasos'} onToggle={() => toggle('pasos')}>
          <Pasos c={c} />
        </Fold>
        <Fold title="💶 ¿Cuánto nos cuesta?" summary={costSummary(c, buyPrice)} open={fold === 'cuentas'} onToggle={() => toggle('cuentas')}>
          <Cuentas m={m} c={c} householdId={householdId} buyPrice={buyPrice} />
        </Fold>
        <Fold title="🔄 Venta y compra a la vez" summary={m.saleSteps.length || c.steps.length ? 'Las fechas de las dos operaciones juntas' : 'Cuando tengáis fechas de arras y firma'} open={fold === 'ambas'} onToggle={() => toggle('ambas')}>
          <Coordinacion m={m} c={c} />
        </Fold>
        <Fold title="📇 Contactos" summary={p?.contacts.length ? p.contacts.map(x => x.role).join(', ') : 'Notaría, banco, gestoría, agencia…'} open={fold === 'contactos'} onToggle={() => toggle('contactos')}>
          <Contactos c={c} householdId={householdId} />
        </Fold>
        <Fold title="🗂️ Documentos para guardar" summary={docsSummary(group('final'), 'Arras, escrituras, ITP, registro…')} open={fold === 'final'} onToggle={() => toggle('final')}>
          <PDocs c={c} householdId={householdId} grp="final" />
        </Fold>
      </div>

      <button onClick={() => c.savePurchase(householdId, { home_id: null })} className="self-center min-h-10 px-3 text-sm text-muted">Cambiar de piso</button>
    </div>
  )
}

// ---------- Elegir el piso ----------
function ChooseHome({ m, c, householdId }: { m: Mudanza; c: Compra; householdId: string }) {
  const [other, setOther] = useState('')
  const top = m.homes.filter(h => h.status === 'oferta' || h.status === 'favorito')
  const rest = m.homes.filter(h => h.status !== 'descartado' && !top.includes(h))
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card rounded-2xl p-4 flex flex-col gap-1">
        <span className="text-[15px] font-bold">¿Qué piso vais a comprar?</span>
        <span className="text-sm text-muted">Cuando vayáis a hacer una oferta, elegidlo aquí: tendréis las comprobaciones, la hipoteca, los pasos hasta la firma, las cuentas y los documentos. La ficha, las fotos y las ofertas siguen en Buscamos.</span>
      </div>
      {top.map(h => (
        <button key={h.id} onClick={() => c.savePurchase(householdId, { home_id: h.id })} className="bg-card rounded-2xl p-4 text-left flex justify-between items-center gap-2">
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[15px] font-semibold truncate">{h.title}</span>
            <span className="text-[13px] text-muted">{price(h.price_cents)} · {h.status === 'oferta' ? 'Con oferta' : 'Favorito'}</span>
          </span>
          <span className="text-sm font-semibold text-accent shrink-0">Elegir</span>
        </button>
      ))}
      {rest.length > 0 && (
        <div className="flex gap-2">
          <select value={other} onChange={e => setOther(e.target.value)} aria-label="Otro piso"
            className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[15px]">
            <option value="">{top.length ? 'Otro piso…' : 'Elige un piso…'}</option>
            {rest.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
          </select>
          <button disabled={!other} onClick={() => c.savePurchase(householdId, { home_id: other })} className="min-h-11 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-40">Elegir</button>
        </div>
      )}
      {!m.homes.length && <p className="text-sm text-muted">Primero guarda el piso en Buscamos.</p>}
    </div>
  )
}

// ---------- Avisos ----------
function docAlert(d: PurchaseDoc, t: string) {
  if (!d.expires_on || d.status === 'no_aplica') return null
  if (d.expires_on < t) return `${d.title}: caducado (${shortDate(d.expires_on)})`
  if (d.expires_on <= addDays(t, 15)) return `${d.title}: caduca ${relativeDay(d.expires_on).toLowerCase()}`
  return null
}
function buildAlerts(c: Compra, t: string) {
  const out: string[] = []
  for (const d of c.docs) {
    if (d.status === 'problema') out.push(`${d.title}: marcado como problema${d.notes ? ` (${d.notes})` : ''}`)
    const a = docAlert(d, t); if (a) out.push(a)
  }
  const firma = c.steps.find(s => s.kind === 'firma' && s.step_date && !s.done)
  const arras = c.steps.find(s => s.kind === 'arras' && s.step_date && !s.done)
  const fein = c.purchase?.fein_date
  if (firma?.step_date && fein && daysBetween(fein, firma.step_date) < 10) out.push('Entre la FEIN y la firma tiene que haber al menos 10 días naturales: la fecha de firma no llega.')
  if (firma?.step_date && !fein && daysBetween(t, firma.step_date) <= 20 && c.purchase?.mortgage_phase !== 'firmada') out.push('Quedan menos de 3 semanas para la firma y aún no tenéis la FEIN del banco.')
  if (arras?.step_date && daysBetween(t, arras.step_date) <= 7 && c.docs.some(d => d.grp === 'comprobacion' && d.status === 'pendiente'))
    out.push('Firmáis arras en menos de una semana y hay comprobaciones pendientes.')
  return out
}

function docsSummary(docs: PurchaseDoc[], empty: string) {
  if (!docs.length) return empty
  const relevant = docs.filter(d => d.status !== 'no_aplica')
  const ok = relevant.filter(d => d.status === 'ok').length
  const bad = docs.filter(d => d.status === 'problema').length
  return `${ok}/${relevant.length} listos${bad ? ` · ⚠️ ${bad} con problema` : ''}`
}

// ---------- Comprobaciones y documentos ----------
const STATUS: Record<PDocStatus, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-bg text-muted border border-line' },
  pedido: { label: 'Pedido', cls: 'bg-[#C77A12] text-white' },
  ok: { label: 'Bien', cls: 'bg-accent text-white dark:text-bg' },
  problema: { label: 'Problema', cls: 'bg-danger text-white dark:text-bg' },
  no_aplica: { label: 'No aplica', cls: 'bg-bg text-muted border border-line' }
}
const GROUP_INTRO: Record<DocGroup, string> = {
  comprobacion: 'Lo que conviene revisar antes de ofertar o, como tarde, antes de firmar arras.',
  banco: 'La documentación que suelen pedir los bancos para estudiar la hipoteca.',
  final: 'Los papeles que hay que guardar después de comprar.'
}

function PDocs({ c, householdId, grp }: { c: Compra; householdId: string; grp: DocGroup }) {
  const [edit, setEdit] = useState<PurchaseDoc | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const docs = c.docs.filter(d => d.grp === grp)
  const tpl = GROUP_TEMPLATES[grp]
  const missing = tpl.filter(x => !docs.some(d => d.doc_key === x.key))
  const t = today()

  async function addTemplate() {
    setBusy(true)
    for (const [i, x] of tpl.entries()) if (!docs.some(d => d.doc_key === x.key)) await c.write('purchase_docs', { grp, doc_key: x.key, title: x.title, position: i })
    setBusy(false)
  }

  return (
    <>
      {docs.length === 0 && (
        <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm">{GROUP_INTRO[grp]}</p>
          <button onClick={addTemplate} disabled={busy} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">{busy ? 'Creando…' : 'Crear la lista'}</button>
        </div>
      )}
      {docs.length > 0 && (
        <ul className="bg-card rounded-2xl px-4">
          {docs.map((d, i) => {
            const alert = docAlert(d, t)
            const hint = tpl.find(x => x.key === d.doc_key)?.hint
            return (
              <li key={d.id} className={`py-3 flex items-center gap-3 ${i < docs.length - 1 ? 'border-b border-line' : ''}`}>
                <button onClick={() => setEdit(d)} className="flex-1 text-left flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-semibold">{d.title}</span>
                  {alert ? <span className="text-[12px] font-semibold text-danger">⚠️ {alert.replace(`${d.title}: `, '')}</span>
                    : d.notes ? <span className="text-[12px] text-muted truncate">{d.notes}</span>
                      : hint && d.status === 'pendiente' ? <span className="text-[12px] text-muted">{hint}</span> : null}
                </button>
                {d.path && <button onClick={async () => { const u = await saleDocUrl(d.path!); if (u) window.open(u, '_blank', 'noopener') }} aria-label={`Ver ${d.title}`} className="min-h-10 px-2 text-lg">📄</button>}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <button onClick={() => setEdit('new')} className="flex-1 min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir</button>
        {docs.length > 0 && missing.length > 0 && <button onClick={addTemplate} disabled={busy} className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold">+ {missing.length} de la lista</button>}
      </div>
      {edit && <PDocSheet doc={edit === 'new' ? undefined : edit} grp={grp} c={c} householdId={householdId} onClose={() => setEdit(null)} />}
    </>
  )
}

function PDocSheet({ doc, grp, c, householdId, onClose }: { doc?: PurchaseDoc; grp: DocGroup; c: Compra; householdId: string; onClose: () => void }) {
  const tpl = GROUP_TEMPLATES[grp].find(x => x.key === doc?.doc_key)
  const [title, setTitle] = useState(doc?.title ?? '')
  const [status, setStatus] = useState<PDocStatus>(doc?.status ?? 'pendiente')
  const [expires, setExpires] = useState(doc?.expires_on ?? '')
  const [notes, setNotes] = useState(doc?.notes ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre'); return }
    const err = await c.write('purchase_docs', { ...(doc ? {} : { grp, position: 99 }), title: title.trim(), status, expires_on: expires || null, notes: notes.trim() || null }, doc?.id)
    if (err) setError(err); else onClose()
  }

  async function upload(f: File | undefined) {
    if (!f || !doc) return
    if (f.size > 15 * 1024 * 1024) { setError('El archivo pesa más de 15 MB'); return }
    setBusy('Subiendo…')
    if (!expires && tpl?.months) {
      const d = new Date(); d.setMonth(d.getMonth() + tpl.months)
      const iso = d.toISOString().slice(0, 10)
      setExpires(iso)
      await c.write('purchase_docs', { expires_on: iso }, doc.id)
    }
    const err = await c.uploadDoc(householdId, doc, f)
    setBusy(null)
    if (err) setError(err); else if (status !== 'problema') setStatus('ok')
  }

  return (
    <Sheet title={doc ? doc.title : 'Nuevo'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-5">
        {tpl && <p className="text-sm text-muted -mt-2">{tpl.hint}</p>}
        <TextField label="Nombre" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus={!doc} />
        <Choice<PDocStatus> label="Estado" value={status} onChange={setStatus}
          options={(['pendiente', 'pedido', 'ok', 'problema', 'no_aplica'] as PDocStatus[]).map(s => ({ value: s, label: STATUS[s].label }))} />
        <TextField label={tpl?.months ? `Caduca el (suele valer ${tpl.months} mes${tpl.months > 1 ? 'es' : ''})` : 'Caduca el (opcional)'} type="date" value={expires} onChange={e => setExpires(e.target.value)} />
        <TextArea label={status === 'problema' ? 'Qué problema hay' : 'Notas'} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        {doc ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">Archivo</span>
            {doc.path && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={async () => { const u = await saleDocUrl(doc.path!); if (u) window.open(u, '_blank', 'noopener') }}
                  className="flex-1 min-h-11 px-3 rounded-xl border border-line bg-card text-sm font-semibold text-left truncate">📄 {doc.file_name ?? 'Ver documento'}</button>
                <button type="button" onClick={() => c.removeDocFile(doc)} className="min-h-11 px-3 text-sm text-danger">Quitar</button>
              </div>
            )}
            <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center text-sm font-semibold text-accent cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy ?? (doc.path ? 'Cambiar archivo (PDF o foto)' : '⬆️ Subir PDF o foto')}
              <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            <p className="text-xs text-muted">Se guarda en privado, solo para vosotros. Hasta 15 MB.</p>
          </div>
        ) : <p className="text-xs text-muted">Guárdalo para poder subir su archivo.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
        {doc && <ConfirmDelete label="Eliminar" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await c.removeDoc(doc); onClose() }} />}
      </form>
    </Sheet>
  )
}

// ---------- Oferta y condiciones ----------
function Condiciones({ m, c, householdId, homeId }: { m: Mudanza; c: Compra; householdId: string; homeId: string }) {
  const p = c.purchase
  const offers = m.homeOffers.filter(o => o.home_id === homeId)
  const [mortgage, setMortgage] = useState(p?.subject_to_mortgage ?? false)
  const [sale, setSale] = useState(p?.subject_to_sale ?? false)
  const [arras, setArras] = useState<ArrasType | null>(p?.arras_type ?? null)
  const [delivery, setDelivery] = useState(p?.delivery_date ?? '')
  const [conditions, setConditions] = useState(p?.conditions ?? '')
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const err = await c.savePurchase(householdId, { subject_to_mortgage: mortgage, subject_to_sale: sale, arras_type: arras, delivery_date: delivery || null, conditions: conditions.trim() || null })
    if (!err) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }

  return (
    <>
      <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">Ofertas hechas</span>
        {offers.length === 0 ? <p className="text-sm text-muted">Aún no hay ofertas. Se apuntan en la ficha del piso, en Buscamos (botón «Oferta»), y aquí se ve cómo van.</p>
          : offers.map(o => (
            <div key={o.id} className="flex justify-between items-baseline gap-2 text-sm">
              <span><b>{price(o.amount_cents)}</b> · {shortDate(o.offer_date)}{o.counter_cents ? ` · contraoferta ${price(o.counter_cents)}` : ''}</span>
              <span className="text-muted shrink-0">{OFFER_STATUS[o.status]}{o.response_deadline && (o.status === 'pending' || o.status === 'countered') ? ` · resp. ${relativeDay(o.response_deadline).toLowerCase()}` : ''}</span>
            </div>
          ))}
      </div>
      <form onSubmit={save} className="bg-card rounded-2xl p-4 flex flex-col gap-4">
        <span className="text-[13px] font-semibold text-muted">Condiciones que pedimos o pactamos</span>
        <label className="flex items-start gap-3 min-h-11">
          <input type="checkbox" checked={mortgage} onChange={() => setMortgage(!mortgage)} className="mt-0.5 w-5 h-5 accent-[var(--app-accent)] shrink-0" />
          <span className="text-[15px]">Condicionada a que el banco nos dé la hipoteca <span className="block text-xs text-muted">Si no la conceden, se recuperan la reserva o las arras.</span></span>
        </label>
        <label className="flex items-start gap-3 min-h-11">
          <input type="checkbox" checked={sale} onChange={() => setSale(!sale)} className="mt-0.5 w-5 h-5 accent-[var(--app-accent)] shrink-0" />
          <span className="text-[15px]">Condicionada a vender nuestra casa <span className="block text-xs text-muted">O un plazo de firma largo que dé tiempo a vender.</span></span>
        </label>
        <Choice<ArrasType | null> label="Tipo de arras" value={arras} onChange={setArras}
          options={[...(Object.keys(ARRAS) as ArrasType[]).map(k => ({ value: k as ArrasType | null, label: ARRAS[k].label })), { value: null, label: 'Sin decidir' }]} />
        {arras && <p className="text-xs text-muted -mt-2">{ARRAS[arras].hint}</p>}
        <TextField label="Entrega de llaves" type="date" value={delivery} onChange={e => setDelivery(e.target.value)} />
        <TextArea label="Otras condiciones" value={conditions} onChange={e => setConditions(e.target.value)} maxLength={2000} placeholder="Muebles y electrodomésticos que se quedan, reparaciones antes de la firma, quién paga qué…" />
        <button type="submit" className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">{saved ? 'Guardado ✓' : 'Guardar condiciones'}</button>
      </form>
    </>
  )
}

// ---------- Hipoteca ----------
function Hipoteca({ c, householdId }: { c: Compra; householdId: string }) {
  const p = c.purchase
  const [edit, setEdit] = useState<MortgageOffer | 'new' | null>(null)
  const [fein, setFein] = useState(p?.fein_date ?? '')
  const firma = c.steps.find(s => s.kind === 'firma')?.step_date
  const earliest = fein ? addDays(fein, 10) : null
  const sorted = [...c.banks].sort((a, b) => (a.tae ?? a.tin ?? 99) - (b.tae ?? b.tin ?? 99))
  return (
    <>
      <div className="bg-card rounded-2xl p-4 flex flex-col gap-3">
        <span className="text-[13px] font-semibold text-muted">En qué fase está</span>
        <div className="flex gap-1.5 flex-wrap">
          {PHASES.map((ph, i) => {
            const idx = PHASES.findIndex(x => x.key === p?.mortgage_phase)
            const on = idx >= i
            return (
              <button key={ph.key} onClick={() => c.savePurchase(householdId, { mortgage_phase: p?.mortgage_phase === ph.key ? (PHASES[i - 1]?.key ?? null) : ph.key })}
                aria-pressed={p?.mortgage_phase === ph.key}
                className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-accent text-white dark:text-bg border-accent' : 'bg-bg border-line'}`}>{on ? '✓ ' : ''}{ph.label}</button>
            )
          })}
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><TextField label="Fecha de la FEIN" type="date" value={fein} onChange={e => setFein(e.target.value)} onBlur={() => c.savePurchase(householdId, { fein_date: fein || null })} /></div>
        </div>
        {earliest && <p className={`text-xs ${firma && firma < earliest ? 'text-danger font-semibold' : 'text-muted'}`}>Por ley, la firma no puede ser antes del {shortDate(earliest)} (10 días desde la FEIN){firma ? ` · firma prevista el ${shortDate(firma)}` : ''}.</p>}
      </div>
      <div className="flex justify-between items-center mt-1">
        <h3 className="font-bold text-[15px]">Bancos comparados</h3>
        <button onClick={() => setEdit('new')} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Banco</button>
      </div>
      {sorted.length === 0 ? <p className="text-sm text-muted">Apunta cada oferta de hipoteca: tipo, TIN, TAE, plazo y vinculaciones. La cuota se calcula sola.</p> : sorted.map((b, i) => {
        const cuota = b.monthly_cents ?? monthlyPayment(b.amount_cents, b.tin, b.years)
        return (
          <button key={b.id} onClick={() => setEdit(b)} className={`bg-card rounded-2xl p-4 text-left flex flex-col gap-0.5 ${b.chosen ? 'ring-2 ring-accent' : ''}`}>
            <span className="flex justify-between items-baseline gap-2">
              <span className="text-[16px] font-bold">{b.bank}{b.chosen ? ' · elegida' : i === 0 && sorted.length > 1 ? ' · la más barata' : ''}</span>
              <span className="text-[15px] font-bold shrink-0">{cuota ? `${price(cuota)}/mes` : ''}</span>
            </span>
            <span className="text-[13px] text-muted">
              {[b.rate_type === 'fijo' ? 'Fija' : b.rate_type === 'variable' ? 'Variable' : 'Mixta', b.tin != null && `TIN ${pct(b.tin)}`, b.tae != null && `TAE ${pct(b.tae)}`, b.years && `${b.years} años`, b.amount_cents && price(b.amount_cents)].filter(Boolean).join(' · ')}
            </span>
            {b.ties && <span className="text-[13px]">Vinculaciones: {b.ties}</span>}
          </button>
        )
      })}
      {sorted.length > 1 && <p className="text-xs text-muted">Ordenados por TAE: incluye comisiones y seguros obligatorios, así que compara mejor que el TIN.</p>}
      {edit && <BankSheet bank={edit === 'new' ? undefined : edit} c={c} onClose={() => setEdit(null)} />}
    </>
  )
}

function BankSheet({ bank, c, onClose }: { bank?: MortgageOffer; c: Compra; onClose: () => void }) {
  const [name, setName] = useState(bank?.bank ?? '')
  const [type, setType] = useState<RateType>(bank?.rate_type ?? 'fijo')
  const [amount, setAmount] = useState(priceInput(bank?.amount_cents))
  const [years, setYears] = useState(bank?.years?.toString() ?? '30')
  const [tin, setTin] = useState(bank?.tin?.toString().replace('.', ',') ?? '')
  const [tae, setTae] = useState(bank?.tae?.toString().replace('.', ',') ?? '')
  const [monthly, setMonthly] = useState(priceInput(bank?.monthly_cents))
  const [ties, setTies] = useState(bank?.ties ?? '')
  const [fees, setFees] = useState(bank?.fees ?? '')
  const [notes, setNotes] = useState(bank?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const rate = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : null)
  const auto = monthlyPayment(amount.trim() ? parsePrice(amount) : null, rate(tin), years ? Number(years) : null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Pon el nombre del banco'); return }
    const r = [rate(tin), rate(tae)]
    if (r.some(x => x != null && (isNaN(x) || x < 0 || x > 20))) { setError('Revisa el TIN y la TAE (en %, por ejemplo 2,45)'); return }
    const y = years.trim() ? parseInt(years, 10) : null
    if (y != null && (isNaN(y) || y < 1 || y > 40)) { setError('El plazo va de 1 a 40 años'); return }
    const err = await c.write('mortgage_offers', {
      bank: name.trim(), rate_type: type, amount_cents: amount.trim() ? parsePrice(amount) : null, years: y, tin: r[0], tae: r[1],
      monthly_cents: monthly.trim() ? parsePrice(monthly) : null, ties: ties.trim() || null, fees: fees.trim() || null, notes: notes.trim() || null
    }, bank?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={bank ? bank.bank : 'Oferta de hipoteca'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-5">
        <TextField label="Banco" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus={!bank} />
        <Choice<RateType> label="Tipo" value={type} onChange={setType} options={[{ value: 'fijo', label: 'Fija' }, { value: 'variable', label: 'Variable' }, { value: 'mixto', label: 'Mixta' }]} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Importe (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          <TextField label="Plazo (años)" inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} />
          <TextField label="TIN (%)" inputMode="decimal" value={tin} onChange={e => setTin(e.target.value)} placeholder="2,45" />
          <TextField label="TAE (%)" inputMode="decimal" value={tae} onChange={e => setTae(e.target.value)} placeholder="2,90" />
        </div>
        <TextField label="Cuota mensual (€)" inputMode="decimal" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder={auto ? `Calculada: ${price(auto)}` : 'Se calcula con importe, TIN y plazo'} />
        <TextField label="Vinculaciones" value={ties} onChange={e => setTies(e.target.value)} maxLength={300} placeholder="Nómina, seguro de vida, hogar, tarjeta…" />
        <TextField label="Comisiones" value={fees} onChange={e => setFees(e.target.value)} maxLength={300} placeholder="Apertura, amortización anticipada…" />
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
        {bank && !bank.chosen && <button type="button" onClick={async () => { await c.chooseBank(bank.id); onClose() }} className="min-h-11 rounded-xl border border-accent text-accent text-sm font-semibold">Elegir esta hipoteca</button>}
        {bank && <ConfirmDelete label="Eliminar" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await c.remove('mortgage_offers', bank.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

// ---------- Pasos ----------
function stepsSummary(steps: PurchaseStep[]) {
  const next = steps.filter(s => !s.done && s.step_date).sort((a, b) => a.step_date!.localeCompare(b.step_date!))[0]
  return next ? `Siguiente: ${next.title} · ${relativeDay(next.step_date!).toLowerCase()}` : steps.length ? `${steps.filter(s => s.done).length}/${steps.length} hechos` : 'Reserva → arras → hipoteca → notaría → registro'
}

function Pasos({ c }: { c: Compra }) {
  const [edit, setEdit] = useState<PurchaseStep | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const t = today()
  async function create() {
    setBusy(true)
    for (const [i, s] of PSTEP_TEMPLATE.entries()) if (!c.steps.some(x => x.kind === s.kind)) await c.write('purchase_steps', { kind: s.kind, title: s.title, position: i })
    setBusy(false)
  }
  return (
    <>
      {c.steps.length === 0 ? (
        <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm">Reserva, arras, hipoteca, notaría, impuestos y registro, y los cambios de la mudanza. Cada paso con su fecha (sale en la Agenda) y lo que hay que tener listo.</p>
          <button onClick={create} disabled={busy} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">{busy ? 'Creando…' : 'Crear los pasos'}</button>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {c.steps.map((s, i) => {
            const items = PSTEP_TEMPLATE.find(x => x.kind === s.kind)?.checklist ?? []
            const ticked = items.filter(x => s.checklist?.[x.key]).length
            const late = !s.done && s.step_date && s.step_date < t
            return (
              <li key={s.id}>
                <button onClick={() => setEdit(s)} className="w-full bg-card rounded-2xl p-4 text-left flex gap-3 items-start">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${s.done ? 'bg-accent text-white dark:text-bg' : 'bg-bg border border-line'}`}>{s.done ? '✓' : i + 1}</span>
                  <span className="flex-1 flex flex-col gap-0.5">
                    <span className={`text-[15px] font-semibold ${s.done ? 'line-through text-muted' : ''}`}>{s.title}</span>
                    <span className={`text-[13px] ${late ? 'text-danger font-semibold' : 'text-muted'}`}>
                      {s.step_date ? `${relativeDay(s.step_date)}${s.step_time ? ` · ${hhmm(s.step_time)}` : ''}${s.location ? ` · ${s.location}` : ''}` : 'Sin fecha'}
                      {s.amount_cents ? ` · ${price(s.amount_cents)}` : ''}
                    </span>
                    {items.length > 0 && <span className="text-[12px] text-muted">{ticked}/{items.length} preparado</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {c.steps.length > 0 && <button onClick={() => setEdit('new')} className="min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Otro paso</button>}
      {edit && <PStepSheet step={edit === 'new' ? undefined : edit} c={c} onClose={() => setEdit(null)} />}
    </>
  )
}

function PStepSheet({ step, c, onClose }: { step?: PurchaseStep; c: Compra; onClose: () => void }) {
  const tpl = PSTEP_TEMPLATE.find(x => x.kind === step?.kind)
  const [title, setTitle] = useState(step?.title ?? '')
  const [date, setDate] = useState(step?.step_date ?? '')
  const [time, setTime] = useState(hhmm(step?.step_time))
  const [location, setLocation] = useState(step?.location ?? '')
  const [amount, setAmount] = useState(priceInput(step?.amount_cents))
  const [notes, setNotes] = useState(step?.notes ?? '')
  const [checks, setChecks] = useState<Record<string, boolean>>(step?.checklist ?? {})
  const [done, setDone] = useState(step?.done ?? false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const showAmount = step?.kind === 'reserva' || step?.kind === 'arras' || step?.kind === 'otro' || !step

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre'); return }
    const err = await c.write('purchase_steps', {
      ...(step ? {} : { kind: 'otro' as PStepKind, position: c.steps.length }),
      title: title.trim(), step_date: date || null, step_time: time || null, location: location.trim() || null,
      amount_cents: amount.trim() ? parsePrice(amount) : null, notes: notes.trim() || null, checklist: checks, done
    }, step?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={step ? step.title : 'Nuevo paso'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-5">
        <TextField label="Nombre" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Fecha" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <TextField label="Hora" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <p className="text-xs text-muted -mt-3">Con fecha, sale en la Agenda (categoría Mudanza).</p>
        <TextField label="Lugar" value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="Notaría, banco, agencia…" />
        {showAmount && <TextField label={step?.kind === 'reserva' ? 'Importe de la reserva (€)' : step?.kind === 'arras' ? 'Importe de las arras (€)' : 'Importe (€, opcional)'} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />}
        {tpl && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-muted mb-1">Qué tener listo</legend>
            {tpl.checklist.map(x => (
              <label key={x.key} className="flex items-center gap-3 min-h-11">
                <input type="checkbox" checked={!!checks[x.key]} onChange={() => setChecks({ ...checks, [x.key]: !checks[x.key] })} className="w-5 h-5 accent-[var(--app-accent)] shrink-0" />
                <span className="text-[15px]">{x.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={done} onChange={() => setDone(!done)} className="w-5 h-5 accent-[var(--app-accent)]" />
          <span className="text-[15px] font-semibold">Hecho</span>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
        {step && <ConfirmDelete label="Eliminar paso" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await c.remove('purchase_steps', step.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

// ---------- Cuentas ----------
function totals(c: Compra, buyPrice: number | null) {
  const costs = (c.purchase?.costs ?? []).reduce((s, x) => s + (x.cents || 0), 0)
  return { costs, total: buyPrice != null ? buyPrice + costs : null }
}
function costSummary(c: Compra, buyPrice: number | null) {
  const t = totals(c, buyPrice)
  return t.costs ? `${price(t.total)} con gastos (${price(t.costs)})` : 'Precio + impuestos + notaría…'
}

function Cuentas({ m, c, householdId, buyPrice }: { m: Mudanza; c: Compra; householdId: string; buyPrice: number | null }) {
  const p = c.purchase
  const chosen = c.banks.find(b => b.chosen)
  const [costs, setCosts] = useState<{ label: string; amount: string }[]>(
    p?.costs?.length ? p.costs.map(x => ({ label: x.label, amount: priceInput(x.cents) })) : PCOST_TEMPLATE.map(label => ({ label, amount: '' })))
  const [savings, setSavings] = useState(priceInput(p?.savings_cents))
  const [loan, setLoan] = useState(priceInput(p?.loan_cents ?? chosen?.amount_cents))
  const [error, setError] = useState('')

  function list(rows = costs): Cost[] {
    return rows.filter(x => x.label.trim()).map(x => ({ label: x.label.trim().slice(0, 60), cents: x.amount.trim() ? parsePrice(x.amount) ?? 0 : 0 }))
  }
  async function save(rows = costs) {
    const err = await c.savePurchase(householdId, {
      costs: list(rows), savings_cents: savings.trim() ? parsePrice(savings) : null, loan_cents: loan.trim() ? parsePrice(loan) : null
    })
    setError(err ?? '')
  }
  function itp() {
    if (!buyPrice) return
    const v = priceInput(Math.round(buyPrice * 0.06))
    const i = costs.findIndex(x => /ITP|transmisiones/i.test(x.label))
    const next = i >= 0 ? costs.map((x, j) => (j === i ? { ...x, amount: v } : x)) : [{ label: 'ITP (impuesto de transmisiones)', amount: v }, ...costs]
    setCosts(next); void save(next)
  }

  const costCents = list().reduce((s, x) => s + x.cents, 0)
  const total = buyPrice != null ? buyPrice + costCents : null
  const net = saleNet(m).net
  const have = (net ?? 0) + (savings.trim() ? parsePrice(savings) ?? 0 : 0) + (loan.trim() ? parsePrice(loan) ?? 0 : 0)
  const gap = total != null ? have - total : null
  const cuota = chosen ? chosen.monthly_cents ?? monthlyPayment(loan.trim() ? parsePrice(loan) : chosen.amount_cents, chosen.tin, chosen.years) : null

  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted">Precio de compra</span>
        <span className="text-[17px] font-bold">{price(buyPrice)}</span>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-muted mb-1">Gastos de la compra</legend>
        {costs.map((x, i) => (
          <div key={i} className="flex gap-2">
            <input value={x.label} onChange={e => setCosts(costs.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} onBlur={() => save()} maxLength={60}
              className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px]" aria-label="Concepto" />
            <input value={x.amount} onChange={e => setCosts(costs.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} onBlur={() => save()} inputMode="decimal" placeholder="€"
              className="w-28 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px] text-right" aria-label={`Importe de ${x.label}`} />
            <button type="button" onClick={() => { const next = costs.filter((_, j) => j !== i); setCosts(next); void save(next) }} aria-label="Quitar" className="w-9 text-muted text-xl">×</button>
          </div>
        ))}
        <div className="flex gap-2">
          {costs.length < 20 && <button type="button" onClick={() => setCosts([...costs, { label: '', amount: '' }])} className="flex-1 min-h-10 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir gasto</button>}
          {buyPrice != null && <button type="button" onClick={itp} className="min-h-10 px-3 rounded-xl border border-line text-sm font-semibold">ITP al 6 %</button>}
        </div>
        <p className="text-[11px] text-muted">En la Comunidad de Madrid el ITP general de vivienda usada es el 6 %; hay reducciones en algunos casos (por ejemplo familia numerosa o jóvenes). Confirmadlo con la gestoría.</p>
      </fieldset>
      <div className="flex justify-between text-[16px] font-bold border-t border-line pt-3"><span>Total</span><span>{price(total)}</span></div>

      <span className="text-sm font-medium text-muted mt-1">De dónde sale el dinero</span>
      <div className="flex justify-between text-sm"><span className="text-muted">Lo que nos queda de la venta</span><span>{price(net)}</span></div>
      <TextField label="Ahorros que ponemos (€)" inputMode="decimal" value={savings} onChange={e => setSavings(e.target.value)} onBlur={() => save()} />
      <TextField label="Hipoteca (€)" inputMode="decimal" value={loan} onChange={e => setLoan(e.target.value)} onBlur={() => save()} placeholder={chosen?.amount_cents ? `La elegida: ${price(chosen.amount_cents)}` : ''} />
      {cuota ? <p className="text-xs text-muted -mt-2">Cuota con {chosen!.bank}: {price(cuota)}/mes.</p> : null}
      {gap != null && (
        <div className={`rounded-xl p-3 text-[15px] font-semibold ${gap >= 0 ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>
          {gap >= 0 ? `Cuadra: os sobran ${price(gap)}` : `Faltan ${price(-gap)}`}
        </div>
      )}
      {buyPrice && loan.trim() && (parsePrice(loan) ?? 0) > buyPrice * 0.8 && <p className="text-xs text-danger">Los bancos suelen financiar hasta el 80 % del precio o de la tasación (el menor).</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  )
}

// ---------- Venta y compra a la vez ----------
function Coordinacion({ m, c }: { m: Mudanza; c: Compra }) {
  const rows = [
    ...m.saleSteps.filter(s => s.step_date).map(s => ({ date: s.step_date!, title: s.title, side: 'venta' as const, kind: s.kind, done: s.done })),
    ...c.steps.filter(s => s.step_date).map(s => ({ date: s.step_date!, title: s.title, side: 'compra' as const, kind: s.kind, done: s.done }))
  ].sort((a, b) => a.date.localeCompare(b.date))
  const sellFirma = m.saleSteps.find(s => s.kind === 'firma')?.step_date
  const buyFirma = c.steps.find(s => s.kind === 'firma')?.step_date
  const buyArras = c.steps.find(s => s.kind === 'arras')?.step_date
  const sellArras = m.saleSteps.find(s => s.kind === 'arras')?.step_date
  const warnings: string[] = []
  if (buyFirma && (!sellFirma || buyFirma < sellFirma)) {
    warnings.push(sellFirma
      ? `Firmáis la compra ${daysBetween(buyFirma, sellFirma)} días antes de cobrar la venta: hará falta tener el dinero antes (ahorros, hipoteca puente o retrasar la firma).`
      : 'Hay fecha de firma de la compra pero aún no de la venta: si necesitáis el dinero de la venta, condicionad la compra o pactad un plazo largo.')
  }
  if (buyArras && !sellArras && !c.purchase?.subject_to_sale) warnings.push('Vais a firmar arras de compra sin tener la venta atada: si no vendéis a tiempo, podríais perder las arras.')
  if (sellFirma && buyFirma && buyFirma > sellFirma && daysBetween(sellFirma, buyFirma) > 0)
    warnings.push(`Entre la entrega de vuestra casa (${shortDate(sellFirma)}) y las llaves de la nueva (${shortDate(buyFirma)}) hay ${daysBetween(sellFirma, buyFirma)} días: pensad dónde vivir o pactad con el comprador quedaros unos días más.`)

  return (
    <>
      {warnings.map((w, i) => <p key={i} className="bg-card rounded-2xl p-4 text-sm ring-2 ring-[#C77A12]">⚠️ {w}</p>)}
      {rows.length === 0 ? <p className="text-sm text-muted">Poned fechas a los pasos de Vendemos y de aquí (arras, firma…) y saldrán juntas, en orden.</p> : (
        <ol className="bg-card rounded-2xl px-4">
          {rows.map((r, i) => (
            <li key={i} className={`py-3 flex items-center gap-3 ${i < rows.length - 1 ? 'border-b border-line' : ''}`}>
              <span className="w-14 text-[13px] font-semibold shrink-0">{shortDate(r.date)}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${r.side === 'venta' ? 'bg-accent-soft text-accent' : 'bg-[#C77A12] text-white'}`}>{r.side === 'venta' ? 'Venta' : 'Compra'}</span>
              <span className={`flex-1 text-[15px] ${r.done ? 'line-through text-muted' : ''}`}>{r.title}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">Lo más tranquilo suele ser firmar la venta y la compra el mismo día o la venta primero. Si compráis antes de vender, preguntad al banco por una hipoteca puente.</p>
    </>
  )
}

// ---------- Contactos ----------
function Contactos({ c, householdId }: { c: Compra; householdId: string }) {
  const [rows, setRows] = useState<Contact[]>(c.purchase?.contacts ?? [])
  const [saved, setSaved] = useState(false)
  const set = (i: number, k: keyof Contact, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  async function save() {
    const clean = rows.filter(r => r.role.trim() || r.name.trim()).map(r => ({
      role: r.role.trim().slice(0, 40), name: r.name.trim().slice(0, 80),
      ...(r.phone?.trim() ? { phone: r.phone.trim().slice(0, 30) } : {}), ...(r.email?.trim() ? { email: r.email.trim().slice(0, 120) } : {})
    }))
    const err = await c.savePurchase(householdId, { contacts: clean })
    if (!err) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }
  const used = new Set(rows.map(r => r.role))
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="bg-card rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input value={r.role} onChange={e => set(i, 'role', e.target.value)} placeholder="Notaría" maxLength={40} list="contact-roles" aria-label="Quién"
              className="w-28 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px] font-semibold" />
            <input value={r.name} onChange={e => set(i, 'name', e.target.value)} placeholder="Nombre" maxLength={80} aria-label="Nombre"
              className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px]" />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar" className="w-9 text-muted text-xl">×</button>
          </div>
          <div className="flex gap-2">
            <input value={r.phone ?? ''} onChange={e => set(i, 'phone', e.target.value)} placeholder="Teléfono" type="tel" inputMode="tel" maxLength={30} aria-label="Teléfono"
              className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px]" />
            {r.phone && /^[0-9 +().-]{3,30}$/.test(r.phone) && <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="min-h-11 px-3 rounded-xl bg-accent-soft text-accent text-sm font-semibold flex items-center">Llamar</a>}
          </div>
          <div className="flex gap-2">
            <input value={r.email ?? ''} onChange={e => set(i, 'email', e.target.value)} placeholder="Email" type="email" inputMode="email" maxLength={120} aria-label="Email"
              className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px]" />
            {r.email && /@/.test(r.email) && <a href={`mailto:${r.email.trim()}`} className="min-h-11 px-3 rounded-xl bg-accent-soft text-accent text-sm font-semibold flex items-center">Escribir</a>}
          </div>
        </div>
      ))}
      <datalist id="contact-roles">{CONTACT_ROLES.map(x => <option key={x} value={x} />)}</datalist>
      <div className="flex gap-1.5 flex-wrap">
        {rows.length < 20 && CONTACT_ROLES.filter(x => !used.has(x)).map(x => (
          <button key={x} type="button" onClick={() => setRows([...rows, { role: x, name: '' }])} className="min-h-9 px-3 rounded-full border border-dashed border-line text-[13px] font-semibold text-accent">+ {x}</button>
        ))}
      </div>
      <button onClick={save} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">{saved ? 'Guardado ✓' : 'Guardar contactos'}</button>
    </div>
  )
}
