import { useState, type FormEvent, type ReactNode } from 'react'
import { addDays, hhmm, relativeDay, shortDate, today } from '../../lib/dates'
import {
  COST_TEMPLATE, DOC_PHASES, DOC_TEMPLATE, STEP_TEMPLATE, parsePrice, price, priceInput,
  type DocStatus, type Mudanza, type SaleCost, type SaleDoc, type SaleStep, type StepKind
} from '../../lib/mudanza'
import { Choice, ConfirmDelete, Sheet, TextArea, TextField } from '../../components/Sheet'
import DocFiles, { openDocFile } from '../../components/DocFiles'

/** Sección plegable de Vendemos */
export function Fold({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <button onClick={onToggle} aria-expanded={open} className="bg-card rounded-2xl p-4 flex justify-between items-center gap-2 text-left">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold">{title}</span>
          {summary && <span className="text-[13px] text-muted">{summary}</span>}
        </span>
        <span className="text-muted text-lg" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  )
}

// ---------- Documentos ----------
const DOC_STATUS: Record<DocStatus, { label: string; cls: string }> = {
  falta: { label: 'Falta', cls: 'bg-danger text-white dark:text-bg' },
  pedido: { label: 'Pedido', cls: 'bg-[#C77A12] text-white' },
  ok: { label: 'Lo tenemos', cls: 'bg-accent text-white dark:text-bg' },
  no_aplica: { label: 'No aplica', cls: 'bg-bg text-muted border border-line' }
}

/** Avisos de caducidad: caducado o caduca en 15 días */
export function docAlert(d: SaleDoc, t = today()) {
  if (!d.expires_on || d.status === 'no_aplica') return null
  if (d.expires_on < t) return { level: 'bad' as const, text: `Caducado (${shortDate(d.expires_on)})` }
  if (d.expires_on <= addDays(t, 15)) return { level: 'warn' as const, text: `Caduca ${relativeDay(d.expires_on).toLowerCase()}` }
  return null
}

export function docsSummary(docs: SaleDoc[]) {
  const relevant = docs.filter(d => d.status !== 'no_aplica')
  const have = relevant.filter(d => d.status === 'ok').length
  const alerts = docs.filter(d => docAlert(d)).length
  return `${have}/${relevant.length} listos${alerts ? ` · ⚠️ ${alerts} por caducar` : ''}`
}

export function VentaDocs({ m, householdId }: { m: Mudanza; householdId: string }) {
  const [edit, setEdit] = useState<SaleDoc | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const missing = DOC_TEMPLATE.filter(t => !m.saleDocs.some(d => d.doc_key === t.key))

  async function addTemplate() {
    setBusy(true)
    for (const [i, t] of DOC_TEMPLATE.entries()) {
      if (!m.saleDocs.some(d => d.doc_key === t.key)) await m.write('sale_documents', { doc_key: t.key, title: t.title, status: 'falta', position: i })
    }
    setBusy(false)
  }

  return (
    <>
      {m.saleDocs.length === 0 && (
        <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm">Empieza con la lista de documentos que suelen pedir al vender una vivienda.</p>
          <button onClick={addTemplate} disabled={busy} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">
            {busy ? 'Creando…' : 'Crear la lista de documentos'}
          </button>
        </div>
      )}
      {m.saleDocs.length > 0 && [...DOC_PHASES, { key: 'otros', title: '📎 Otros', keys: [] as string[] }].map(ph => {
        const known = DOC_PHASES.flatMap(x => x.keys)
        const list = m.saleDocs.filter(d => (ph.key === 'otros' ? !d.doc_key || !known.includes(d.doc_key) : ph.keys.includes(d.doc_key ?? '')))
          .sort((a, b) => (ph.keys.indexOf(a.doc_key ?? '') - ph.keys.indexOf(b.doc_key ?? '')) || a.title.localeCompare(b.title, 'es'))
        if (!list.length) return null
        const rel = list.filter(d => d.status !== 'no_aplica')
        const ok = rel.filter(d => d.status === 'ok').length
        return (
        <div key={ph.key} className="flex flex-col gap-1.5">
          <span className="flex justify-between items-baseline px-1">
            <span className="text-[13px] font-semibold">{ph.title}</span>
            <span className={`text-[12px] font-semibold ${ok === rel.length ? 'text-accent' : 'text-muted'}`}>{ok === rel.length ? '✓ ' : ''}{ok}/{rel.length}</span>
          </span>
        <ul className="bg-card rounded-2xl px-4">
          {list.map((d, i) => {
            const alert = docAlert(d)
            const hint = DOC_TEMPLATE.find(t => t.key === d.doc_key)?.hint
            return (
              <li key={d.id} className={`py-3 flex items-center gap-3 ${i < list.length - 1 ? 'border-b border-line' : ''}`}>
                <button onClick={() => setEdit(d)} className="flex-1 text-left flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-semibold">{d.title}</span>
                  {alert ? <span className={`text-[12px] font-semibold ${alert.level === 'bad' ? 'text-danger' : 'text-[#C77A12]'}`}>⚠️ {alert.text}</span>
                    : d.expires_on ? <span className="text-[12px] text-muted">Válido hasta {shortDate(d.expires_on)}</span>
                      : hint && d.status !== 'ok' ? <span className="text-[12px] text-muted">{hint}</span> : null}
                </button>
                {d.files.length > 0 && (
                  <button onClick={() => (d.files.length === 1 ? openDocFile(d.files[0]) : setEdit(d))} aria-label={`Ver ${d.title}`} className="min-h-10 px-2 text-[15px] flex items-center gap-0.5">
                    📄{d.files.length > 1 && <span className="text-[12px] font-semibold text-muted">{d.files.length}</span>}
                  </button>
                )}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${DOC_STATUS[d.status].cls}`}>{DOC_STATUS[d.status].label}</span>
              </li>
            )
          })}
        </ul>
        </div>
        )
      })}
      <div className="flex gap-2">
        <button onClick={() => setEdit('new')} className="flex-1 min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Otro documento</button>
        {m.saleDocs.length > 0 && missing.length > 0 && (
          <button onClick={addTemplate} disabled={busy} className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold">+ {missing.length} de la lista</button>
        )}
      </div>
      {edit && <DocSheet doc={edit === 'new' ? undefined : edit} m={m} householdId={householdId} onClose={() => setEdit(null)} />}
    </>
  )
}

function DocSheet({ doc: initial, m, householdId, onClose }: { doc?: SaleDoc; m: Mudanza; householdId: string; onClose: () => void }) {
  // Siempre la versión al día (los archivos cambian al subir o quitar)
  const doc = initial ? m.saleDocs.find(x => x.id === initial.id) ?? initial : undefined
  const tpl = DOC_TEMPLATE.find(t => t.key === doc?.doc_key)
  const [title, setTitle] = useState(doc?.title ?? '')
  const [status, setStatus] = useState<DocStatus>(doc?.status ?? 'falta')
  const [expires, setExpires] = useState(doc?.expires_on ?? '')
  const [notes, setNotes] = useState(doc?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre'); return }
    const err = await m.write('sale_documents', { title: title.trim(), status, expires_on: expires || null, notes: notes.trim() || null }, doc?.id)
    if (err) setError(err); else onClose()
  }

  async function upload(list: File[], onProgress: (i: number) => void) {
    if (!doc) return
    // Si aún no tiene fecha de caducidad y el documento caduca, se propone desde hoy
    if (!expires && tpl?.months) {
      const d = new Date(); d.setMonth(d.getMonth() + tpl.months)
      const iso = d.toISOString().slice(0, 10)
      setExpires(iso)
      await m.write('sale_documents', { expires_on: iso }, doc.id)
    }
    const err = await m.uploadSaleDoc(householdId, doc, list, onProgress)
    if (!err) setStatus('ok')
    return err
  }

  return (
    <Sheet title={doc ? doc.title : 'Nuevo documento'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-5">
        {tpl && <p className="text-sm text-muted -mt-2">{tpl.hint}</p>}
        <TextField label="Nombre" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus={!doc} />
        <Choice<DocStatus> label="Estado" value={status} onChange={setStatus}
          options={(['falta', 'pedido', 'ok', 'no_aplica'] as DocStatus[]).map(s => ({ value: s, label: DOC_STATUS[s].label }))} />
        <TextField label={tpl?.months ? `Caduca el (suele valer ${tpl.months >= 12 ? `${tpl.months / 12} año${tpl.months > 12 ? 's' : ''}` : `${tpl.months} mes${tpl.months > 1 ? 'es' : ''}`})` : 'Caduca el (opcional)'}
          type="date" value={expires} onChange={e => setExpires(e.target.value)} />
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="Dónde se pide, cuánto cuesta, quién lo trae…" />
        {doc ? (
          <DocFiles files={doc.files} onAdd={upload} onRemove={f => m.removeSaleDocFile(doc, f)} />
        ) : <p className="text-xs text-muted">Guarda el documento para poder subir sus archivos.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
        {doc && <ConfirmDelete label="Eliminar documento" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.removeSaleDoc(doc); onClose() }} />}
      </form>
    </Sheet>
  )
}

// ---------- Cuentas de la venta ----------
export function saleNet(m: Mudanza) {
  const accepted = m.offers.find(o => o.status === 'accepted')
  const sale = accepted?.amount_cents ?? m.listing?.price_cents ?? null
  const costs = (m.listing?.costs ?? []).reduce((s, c) => s + (c.cents || 0), 0)
  const mortgage = m.listing?.mortgage_cents ?? 0
  return { sale, fromOffer: !!accepted, costs, mortgage, net: sale != null ? sale - mortgage - costs : null }
}

export function VentaCuentas({ m, householdId }: { m: Mudanza; householdId: string }) {
  const l = m.listing
  const [mortgage, setMortgage] = useState(priceInput(l?.mortgage_cents))
  const [costs, setCosts] = useState<{ label: string; amount: string }[]>(
    l?.costs?.length ? l.costs.map(c => ({ label: c.label, amount: priceInput(c.cents) })) : COST_TEMPLATE.map(label => ({ label, amount: '' })))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const n = saleNet(m)
  const budget = m.criteria?.max_price_cents ?? null

  async function save() {
    const list: SaleCost[] = costs.filter(c => c.label.trim()).map(c => ({ label: c.label.trim().slice(0, 60), cents: c.amount.trim() ? parsePrice(c.amount) ?? 0 : 0 }))
    const mc = mortgage.trim() ? parsePrice(mortgage) : null
    const err = await m.write('sale_listing', { household_id: householdId, mortgage_cents: mc, costs: list }, undefined, 'household_id')
    if (err) setError(err); else { setError(''); setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }

  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted">{n.fromOffer ? 'Precio de la oferta aceptada' : 'Precio de venta (el publicado)'}</span>
        <span className="text-[17px] font-bold">{price(n.sale)}</span>
      </div>
      <TextField label="Hipoteca pendiente (€)" inputMode="decimal" value={mortgage} onChange={e => setMortgage(e.target.value)} onBlur={save} placeholder="Lo que dice el certificado de deuda" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-muted mb-1">Gastos de la venta</legend>
        {costs.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input value={c.label} onChange={e => setCosts(costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} onBlur={save} maxLength={60}
              className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px]" aria-label="Concepto" />
            <input value={c.amount} onChange={e => setCosts(costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} onBlur={save} inputMode="decimal" placeholder="€"
              className="w-28 min-h-11 px-3 rounded-xl border border-line bg-bg text-[15px] text-right" aria-label={`Importe de ${c.label}`} />
            <button type="button" onClick={() => { const next = costs.filter((_, j) => j !== i); setCosts(next) }} aria-label="Quitar" className="w-9 text-muted text-xl">×</button>
          </div>
        ))}
        {costs.length < 20 && (
          <button type="button" onClick={() => setCosts([...costs, { label: '', amount: '' }])} className="min-h-10 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir gasto</button>
        )}
      </fieldset>
      <div className="border-t border-line pt-3 flex flex-col gap-1">
        <div className="flex justify-between text-sm"><span className="text-muted">Venta</span><span>{price(n.sale)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted">− Hipoteca</span><span>{price(n.mortgage)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted">− Gastos</span><span>{price(n.costs)}</span></div>
        <div className="flex justify-between text-[16px] font-bold"><span>Os queda para la compra</span><span className="text-accent">{price(n.net)}</span></div>
        {budget != null && n.net != null && (
          <p className="text-xs text-muted">Presupuesto máximo para entrar a vivir (Buscamos): {price(budget)} · {budget > n.net ? `harían falta ${price(budget - n.net)} más (ahorros o hipoteca)` : `os sobran ${price(n.net - budget)}`}.</p>
        )}
      </div>
      <p className="text-[11px] text-muted">La plusvalía municipal y el IRPF dependen de cada caso (por ejemplo, si reinvertís en vivienda habitual puede haber exención): confirmad las cifras con un gestor o asesor.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {saved && <p role="status" className="text-xs text-accent">Guardado</p>}
    </div>
  )
}

// ---------- Pasos de la venta ----------
export function stepsSummary(steps: SaleStep[]) {
  const next = steps.filter(s => !s.done && s.step_date).sort((a, b) => a.step_date!.localeCompare(b.step_date!))[0]
  const done = steps.filter(s => s.done).length
  return next ? `Siguiente: ${next.title} · ${relativeDay(next.step_date!).toLowerCase()}` : steps.length ? `${done}/${steps.length} hechos` : 'Reserva → arras → firma'
}

export function VentaPasos({ m }: { m: Mudanza }) {
  const [edit, setEdit] = useState<SaleStep | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const t = today()

  async function create() {
    setBusy(true)
    for (const [i, s] of STEP_TEMPLATE.entries()) {
      if (!m.saleSteps.some(x => x.kind === s.kind)) await m.write('sale_steps', { kind: s.kind, title: s.title, position: i })
    }
    setBusy(false)
  }

  return (
    <>
      {m.saleSteps.length === 0 ? (
        <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm">Cuando aceptéis una oferta: reserva, firma de arras y firma ante notario, cada uno con su fecha (sale en la Agenda) y lo que hay que tener listo.</p>
          <button onClick={create} disabled={busy} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">{busy ? 'Creando…' : 'Crear los pasos'}</button>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {m.saleSteps.map((s, i) => {
            const tpl = STEP_TEMPLATE.find(x => x.kind === s.kind)
            const items = tpl?.checklist ?? []
            const ticked = items.filter(c => s.checklist?.[c.key]).length
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
      {m.saleSteps.length > 0 && (
        <button onClick={() => setEdit('new')} className="min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Otro paso</button>
      )}
      {edit && <StepSheet step={edit === 'new' ? undefined : edit} m={m} onClose={() => setEdit(null)} />}
    </>
  )
}

function StepSheet({ step, m, onClose }: { step?: SaleStep; m: Mudanza; onClose: () => void }) {
  const tpl = STEP_TEMPLATE.find(x => x.kind === step?.kind)
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

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre'); return }
    const cents = amount.trim() ? parsePrice(amount) : null
    const err = await m.write('sale_steps', {
      ...(step ? {} : { kind: 'otro' as StepKind, position: m.saleSteps.length }),
      title: title.trim(), step_date: date || null, step_time: time || null, location: location.trim() || null,
      amount_cents: cents, notes: notes.trim() || null, checklist: checks, done
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
        <TextField label="Lugar" value={location} onChange={e => setLocation(e.target.value)} maxLength={120} placeholder="Notaría, banco…" />
        {step?.kind !== 'firma' && <TextField label={step?.kind === 'reserva' ? 'Importe de la reserva (€)' : step?.kind === 'arras' ? 'Importe de las arras (€)' : 'Importe (€, opcional)'} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />}
        {tpl && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-muted mb-1">Qué tener listo</legend>
            {tpl.checklist.map(c => (
              <label key={c.key} className="flex items-center gap-3 min-h-11">
                <input type="checkbox" checked={!!checks[c.key]} onChange={() => setChecks({ ...checks, [c.key]: !checks[c.key] })} className="w-5 h-5 accent-[var(--app-accent)]" />
                <span className="text-[15px]">{c.label}</span>
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
        {step && <ConfirmDelete label="Eliminar paso" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('sale_steps', step.id); onClose() }} />}
      </form>
    </Sheet>
  )
}
