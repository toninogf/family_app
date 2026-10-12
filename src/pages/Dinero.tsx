import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useHousehold } from '../lib/household'
import type { Member } from '../lib/supabase'
import {
  centsToInput, compressImage, debtOf, deleteReceipt, formatEur, monthLabel, parseEur, partyName, receiptUrl, shiftMonth, todayISO,
  uploadReceipt, useBalances, useCategories, useExpenses, type Category, type Debt, type Expense, type ExpenseInput
} from '../lib/money'
import { useSearchParams } from 'react-router-dom'
import ImportSheet from '../components/ImportSheet'
import { Card } from '../components/ui'

type Tab = 'saldos' | 'gastos' | 'mes'

export default function Dinero() {
  const { me, members } = useHousehold()
  const [tab, setTab] = useState<Tab>('saldos')
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [sheet, setSheet] = useState<{ open: boolean; expense?: Expense; defaults?: ExpenseDefaults }>({ open: false })
  const { categories, setBudget } = useCategories()
  const balances = useBalances()
  const exp = useExpenses(month)
  const [params, setParams] = useSearchParams()
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)

  // Abrir un gasto precargado desde otra pantalla (p. ej. Compra → "Pasar a gasto")
  useEffect(() => {
    if (params.get('nuevo') !== '1' || !categories.length) return
    setSheet({ open: true, defaults: { description: params.get('concepto') ?? undefined, categoryName: params.get('categoria') ?? undefined } })
    setParams({}, { replace: true })
  }, [params, categories, setParams])

  const adults = members.filter(m => m.kind === 'adult')
  const kids = members.filter(m => m.kind === 'child')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[26px] font-bold tracking-tight">Dinero</h1>

      <div role="tablist" aria-label="Vista" className="grid grid-cols-3 bg-line/60 rounded-xl p-1">
        {([['saldos', 'Saldos'], ['gastos', 'Gastos'], ['mes', 'Mes']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-10 rounded-lg text-sm ${tab === key ? 'bg-card font-bold text-ink shadow-sm' : 'font-medium text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'saldos' && (
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mes anterior" className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center">‹</button>
          <span className="font-semibold">{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Mes siguiente" className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center">›</button>
        </div>
      )}

      {exp.error && (
        <Card className="flex justify-between items-center gap-3">
          <p role="alert" className="text-danger text-sm">No se pudo guardar: {exp.error}</p>
          <button onClick={exp.clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
        </Card>
      )}

      {tab === 'saldos' && (
        <SaldosTab
          members={members}
          debts={balances.debts}
          settlements={balances.settlements}
          loading={balances.loading}
          onSettle={(d, cents) => me && balances.settle(me.household_id, d, cents)}
          onUndo={id => balances.undoSettlement(id)}
        />
      )}
      {tab === 'gastos' && (
        <>
          <button onClick={() => setImporting(true)} className="min-h-11 px-4 rounded-xl border border-line bg-card text-accent text-sm font-semibold self-start flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            Importar del banco (CSV)
          </button>
          {imported > 0 && <Card><p className="text-sm">Importados {imported} gastos.</p></Card>}
          <GastosTab expenses={exp.expenses} loading={exp.loading} categories={categories} members={members} onOpen={e => setSheet({ open: true, expense: e })} />
        </>
      )}
      {importing && me && (
        <ImportSheet
          householdId={me.household_id}
          categories={categories}
          adults={adults}
          onClose={() => setImporting(false)}
          onDone={n => { setImporting(false); setImported(n); exp.reload(); balances.reload() }}
        />
      )}
      {tab === 'mes' && (
        <MesTab expenses={exp.expenses} categories={categories} adults={adults} kids={kids} onBudget={setBudget} />
      )}

      <button
        onClick={() => setSheet({ open: true })}
        className="fixed right-5 bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] h-14 px-5 rounded-full bg-ink text-bg font-bold text-[15px] flex items-center gap-2 shadow-lg z-10"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Gasto
      </button>

      {sheet.open && me && (
        <ExpenseSheet
          expense={sheet.expense}
          defaults={sheet.defaults}
          householdId={me.household_id}
          categories={categories}
          adults={adults}
          kids={kids}
          onClose={() => setSheet({ open: false })}
          onSave={async input => {
            const err = await exp.save(me.household_id, input, sheet.expense?.id)
            if (!err) {
              setSheet({ open: false })
              balances.reload()
              const m = input.spent_on.slice(0, 7)
              if (m !== month) setMonth(m)
            }
            return err?.message
          }}
          onDelete={sheet.expense ? async () => { await exp.remove(sheet.expense!.id); setSheet({ open: false }); balances.reload() } : undefined}
        />
      )}
    </div>
  )
}

/* ---------- Saldos ---------- */

function SaldosTab({ members, debts, settlements, loading, onSettle, onUndo }: {
  members: Member[]
  debts: Debt[]
  settlements: { id: string; from_id: string | null; to_id: string | null; amount_cents: number; settled_on: string }[]
  loading: boolean
  onSettle: (d: Debt, cents: number) => unknown
  onUndo: (id: string) => unknown
}) {
  const [settling, setSettling] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')

  if (loading) return <p className="text-muted text-sm">Cargando…</p>

  return (
    <div className="flex flex-col gap-4">
      {debts.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Todo en orden</p>
          <p className="text-sm text-muted">No hay nada pendiente de reembolsar ni deudas entre vosotros.</p>
        </Card>
      ) : debts.map((d, i) => (
        <Card key={`${d.debtor}-${d.creditor}`} className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-muted">{partyName(d.debtor, members, 'subject')} debe a {partyName(d.creditor, members).replace('Cuenta común', 'la cuenta común')}</span>
              <span className="text-[26px] font-bold tracking-tight text-accent">{formatEur(d.cents)}</span>
            </div>
            {settling !== i && (
              <button onClick={() => { setSettling(i); setAmount(centsToInput(d.cents)); setErr('') }} className="min-h-11 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold shrink-0">
                {d.debtor === null ? 'Reembolsar' : 'Saldar'}
              </button>
            )}
          </div>
          {settling === i && (
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault()
                const cents = parseEur(amount)
                if (!cents) { setErr('Importe no válido'); return }
                if (cents > d.cents) { setErr(`Como máximo ${formatEur(d.cents)}`); return }
                await onSettle(d, cents)
                setSettling(null)
              }}
              className="flex flex-col gap-2 bg-bg rounded-xl p-3"
            >
              <p className="text-sm">
                Registra la transferencia de <b>{partyName(d.debtor, members).replace('Cuenta común', 'la cuenta común')}</b> a <b>{partyName(d.creditor, members).replace('Cuenta común', 'la cuenta común')}</b>. Puedes saldar solo una parte.
              </p>
              <div className="flex gap-2 items-center">
                <label className="flex-1">
                  <span className="sr-only">Importe</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className="w-full min-h-11 px-3 rounded-lg border border-line bg-card text-[16px]" />
                </label>
                <span className="text-muted">€</span>
              </div>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSettling(null)} className="min-h-11 px-3 text-sm text-muted">Cancelar</button>
                <button type="submit" className="min-h-11 px-4 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold">Registrar</button>
              </div>
            </form>
          )}
        </Card>
      ))}

      {settlements.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Últimos reembolsos y pagos</h2>
          <Card className="py-1">
            <ul>
              {settlements.map((s, idx) => (
                <li key={s.id} className={`flex items-center gap-3 min-h-14 ${idx < settlements.length - 1 ? 'border-b border-line' : ''}`}>
                  <div className="flex-1 flex flex-col">
                    <span className="text-[15px]">{partyName(s.from_id, members)} → {partyName(s.to_id, members)}</span>
                    <span className="text-xs text-muted">{new Date(s.settled_on).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <span className="font-semibold">{formatEur(s.amount_cents)}</span>
                  <button onClick={() => onUndo(s.id)} aria-label="Deshacer este pago" className="min-h-10 px-2 text-xs text-muted underline">Deshacer</button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <p className="text-xs text-muted px-1">
        Cuando uno paga algo de la familia con su dinero, la cuenta común se lo debe. Cuando uno paga algo personal del otro, el otro se lo debe.
      </p>
    </div>
  )
}

/* ---------- Gastos ---------- */

function GastosTab({ expenses, loading, categories, members, onOpen }: {
  expenses: Expense[]; loading: boolean; categories: Category[]; members: Member[]; onOpen: (e: Expense) => void
}) {
  const [filter, setFilter] = useState<string>('all')
  const kids = members.filter(m => m.kind === 'child')
  const adults = members.filter(m => m.kind === 'adult')
  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? 'Sin categoría'

  const filtered = expenses.filter(e => {
    if (filter === 'all') return true
    if (filter === 'family') return e.beneficiary_id === null
    if (filter.startsWith('kid:')) return e.child_id === filter.slice(4)
    return e.beneficiary_id === filter
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of filtered) map.set(e.spent_on, [...(map.get(e.spent_on) ?? []), e])
    return [...map.entries()]
  }, [filtered])

  const chips: [string, string][] = [['all', 'Todos'], ['family', 'Familia'], ...adults.map(a => [a.id, a.display_name] as [string, string]), ...kids.map(k => [`kid:${k.id}`, k.display_name] as [string, string])]

  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5">
        {chips.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={`shrink-0 min-h-9 px-3 rounded-full text-[13px] font-semibold ${filter === key ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <p className="text-muted text-sm">Cargando…</p> : byDay.length === 0 ? (
        <Card><p className="text-sm text-muted">No hay gastos en este mes{filter !== 'all' ? ' con este filtro' : ''}.</p></Card>
      ) : byDay.map(([day, list]) => (
        <section key={day} className="flex flex-col gap-1.5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">
            {new Date(day + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          <Card className="py-1">
            <ul>
              {list.map((e, idx) => (
                <li key={e.id} className={idx < list.length - 1 ? 'border-b border-line' : ''}>
                  <button onClick={() => onOpen(e)} className="w-full flex items-center gap-3 min-h-16 py-2 text-left">
                    <span className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">{e.description}</span>
                      <span className="text-xs text-muted">
                        {catName(e.category_id)} · {describeFlow(e, members)}
                        {e.child_id ? ` · ${members.find(m => m.id === e.child_id)?.display_name}` : ''}
                      </span>
                    </span>
                    <span className="font-bold text-[15px]">{formatEur(e.amount_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function describeFlow(e: Pick<Expense, 'payer_id' | 'beneficiary_id'>, members: Member[]) {
  const payer = e.payer_id === null ? 'común' : partyName(e.payer_id, members)
  if (e.beneficiary_id === null) return e.payer_id === null ? 'Pagó la común' : `Adelantó ${payer}`
  const ben = partyName(e.beneficiary_id, members)
  if (e.payer_id === e.beneficiary_id) return `Personal de ${ben}`
  return `De ${ben}, pagó ${payer}`
}

/* ---------- Mes ---------- */

function MesTab({ expenses, categories, adults, kids, onBudget }: {
  expenses: Expense[]; categories: Category[]; adults: Member[]; kids: Member[]; onBudget: (id: string, cents: number) => unknown
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const family = expenses.filter(e => e.beneficiary_id === null)
  const total = family.reduce((s, e) => s + e.amount_cents, 0)
  const active = categories.filter(c => !c.archived)
  const budget = active.reduce((s, c) => s + c.monthly_budget_cents, 0)

  const rows = active.map(c => ({
    ...c,
    spent: family.filter(e => e.category_id === c.id).reduce((s, e) => s + e.amount_cents, 0)
  })).filter(r => editing || r.spent > 0 || r.monthly_budget_cents > 0)
  const uncategorized = family.filter(e => !e.category_id || !active.some(c => c.id === e.category_id)).reduce((s, e) => s + e.amount_cents, 0)

  async function saveBudgets() {
    for (const c of active) {
      if (draft[c.id] === undefined) continue
      const cents = draft[c.id].trim() === '' ? 0 : parseEur(draft[c.id])
      if (cents !== null && cents !== c.monthly_budget_cents) await onBudget(c.id, cents)
    }
    setDraft({}); setEditing(false)
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <Card className="flex flex-col gap-2">
        <span className="text-sm text-muted">Gasto de la familia</span>
        <span className="text-[28px] font-bold tracking-tight">{formatEur(total)}</span>
        {budget > 0 && (
          <>
            <Bar value={total} max={budget} />
            <span className="text-sm text-muted">{total <= budget ? `Quedan ${formatEur(budget - total)} de ${formatEur(budget)}` : `${formatEur(total - budget)} por encima del presupuesto de ${formatEur(budget)}`}</span>
          </>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold">Por categoría</h2>
          {editing
            ? <button onClick={saveBudgets} className="min-h-10 px-3 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold">Guardar</button>
            : <button onClick={() => setEditing(true)} className="min-h-10 px-2 text-sm font-semibold text-accent">Editar presupuestos</button>}
        </div>
        <Card className="flex flex-col gap-3">
          {rows.length === 0 && !uncategorized && <p className="text-sm text-muted">Aún no hay gastos este mes.</p>}
          {rows.map(r => (
            <div key={r.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center gap-2 text-sm">
                <span className="font-medium">{r.name}</span>
                {editing ? (
                  <label className="flex items-center gap-1">
                    <span className="sr-only">Presupuesto mensual de {r.name}</span>
                    <input
                      inputMode="decimal"
                      value={draft[r.id] ?? (r.monthly_budget_cents ? centsToInput(r.monthly_budget_cents) : '')}
                      onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                      placeholder="0"
                      className="w-24 min-h-10 px-2 rounded-lg border border-line bg-bg text-right text-[16px]"
                    />
                    <span className="text-muted">€</span>
                  </label>
                ) : (
                  <span className="text-muted">{formatEur(r.spent)}{r.monthly_budget_cents ? ` / ${formatEur(r.monthly_budget_cents)}` : ''}</span>
                )}
              </div>
              {!editing && r.monthly_budget_cents > 0 && <Bar value={r.spent} max={r.monthly_budget_cents} />}
            </div>
          ))}
          {!editing && uncategorized > 0 && (
            <div className="flex justify-between text-sm"><span className="font-medium">Sin categoría</span><span className="text-muted">{formatEur(uncategorized)}</span></div>
          )}
        </Card>
      </section>

      {kids.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Por niño</h2>
          <Card className="flex flex-col gap-2">
            {kids.map(k => (
              <Row key={k.id} color={k.color} label={k.display_name} value={formatEur(expenses.filter(e => e.child_id === k.id).reduce((s, e) => s + e.amount_cents, 0))} />
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Gastos personales</h2>
        <Card className="flex flex-col gap-2">
          {adults.map(a => (
            <Row key={a.id} color={a.color} label={a.display_name} value={formatEur(expenses.filter(e => e.beneficiary_id === a.id).reduce((s, e) => s + e.amount_cents, 0))} />
          ))}
        </Card>
      </section>
    </div>
  )
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm min-h-8">
      <span className="flex items-center gap-2 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const over = value > max
  return (
    <div className="h-2 rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`h-2 rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ---------- Formulario de gasto ---------- */

function Segmented({ label, options, value, onChange }: {
  label: string; options: { value: string | null; label: string; color?: string }[]; value: string | null; onChange: (v: string | null) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-muted mb-1.5">{label}</legend>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(o => (
          <button
            type="button"
            key={o.value ?? 'null'}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 border ${value === o.value ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}
          >
            {o.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} aria-hidden="true" />}
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export type ExpenseDefaults = { description?: string; categoryName?: string }

function ExpenseSheet({ expense, defaults, householdId, categories, adults, kids, onClose, onSave, onDelete }: {
  expense?: Expense
  defaults?: ExpenseDefaults
  householdId: string
  categories: Category[]
  adults: Member[]
  kids: Member[]
  onClose: () => void
  onSave: (input: ExpenseInput) => Promise<string | undefined>
  onDelete?: () => Promise<void>
}) {
  const [amount, setAmount] = useState(expense ? centsToInput(expense.amount_cents) : '')
  const [description, setDescription] = useState(expense?.description ?? defaults?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(
    expense?.category_id ?? categories.find(c => c.name === defaults?.categoryName)?.id ?? null
  )
  const [receiptPath, setReceiptPath] = useState<string | null>(expense?.receipt_path ?? null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [newReceipt, setNewReceipt] = useState<Blob | null>(null)

  useEffect(() => {
    let cancelled = false
    if (receiptPath && !newReceipt) receiptUrl(receiptPath).then(u => { if (!cancelled) setReceiptPreview(u) })
    return () => { cancelled = true }
  }, [receiptPath, newReceipt])

  async function pickReceipt(file: File | undefined) {
    if (!file) return
    try {
      const blob = await compressImage(file)
      setNewReceipt(blob)
      setReceiptPreview(URL.createObjectURL(blob))
    } catch {
      setError('No se pudo leer la foto')
    }
  }
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? todayISO())
  const [payer, setPayer] = useState<string | null>(expense ? expense.payer_id : null)
  const [beneficiary, setBeneficiary] = useState<string | null>(expense ? expense.beneficiary_id : null)
  const [child, setChild] = useState<string | null>(expense?.child_id ?? null)
  const [note, setNote] = useState(expense?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const cents = parseEur(amount)
  const debt = cents ? debtOf(payer, beneficiary, cents) : null
  const members = [...adults, ...kids]
  const consequence = !cents ? '' : debt
    ? `${partyName(debt.debtor, members, 'subject')} deberá ${formatEur(debt.cents)} a ${partyName(debt.creditor, members).replace('Cuenta común', 'la cuenta común')}.`
    : 'No genera deudas.'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cents) { setError('Escribe un importe válido, por ejemplo 12,50'); return }
    if (!description.trim()) { setError('Escribe un concepto'); return }
    setBusy(true); setError('')
    let path = receiptPath
    try {
      if (newReceipt) path = await uploadReceipt(householdId, newReceipt)
    } catch {
      setBusy(false); setError('No se pudo subir la foto del ticket'); return
    }
    const err = await onSave({
      amount_cents: cents, description: description.trim(), category_id: categoryId, spent_on: spentOn,
      payer_id: payer, beneficiary_id: beneficiary, child_id: beneficiary === null ? child : null, note: note.trim() || null,
      receipt_path: path
    })
    setBusy(false)
    if (err) {
      setError(err)
      if (newReceipt && path) await deleteReceipt(path)
      return
    }
    // Borra la foto anterior si se cambió o se quitó
    const old = expense?.receipt_path
    if (old && old !== path) await deleteReceipt(old)
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={expense ? 'Editar gasto' : 'Nuevo gasto'}
        onClick={e => e.stopPropagation()}
        className="bg-bg rounded-t-3xl max-h-[92vh] overflow-y-auto w-full max-w-xl mx-auto pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <form onSubmit={submit} className="flex flex-col gap-5 p-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{expense ? 'Editar gasto' : 'Nuevo gasto'}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 -mr-2 flex items-center justify-center text-muted text-2xl">×</button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Importe</span>
            <span className="flex items-center gap-2">
              <input autoFocus={!expense} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
                className="flex-1 min-h-14 px-4 rounded-xl border border-line bg-card text-[28px] font-bold outline-none focus:border-accent" />
              <span className="text-2xl font-bold text-muted">€</span>
            </span>
          </label>

          <Field2 label="Concepto">
            <input value={description} onChange={e => setDescription(e.target.value)} maxLength={80} placeholder="Ej. Mercadona, luz, natación…"
              className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
          </Field2>

          <div className="grid grid-cols-2 gap-3">
            <Field2 label="Categoría">
              <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value || null)} className="w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[15px]">
                <option value="">Sin categoría</option>
                {categories.filter(c => !c.archived || c.id === categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field2>
            <Field2 label="Fecha">
              <input type="date" value={spentOn} onChange={e => setSpentOn(e.target.value)} required className="w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[15px]" />
            </Field2>
          </div>

          <Segmented label="¿Quién paga?" value={payer} onChange={setPayer}
            options={[{ value: null, label: 'Cuenta común' }, ...adults.map(a => ({ value: a.id, label: a.display_name, color: a.color }))]} />

          <Segmented label="¿Para quién?" value={beneficiary} onChange={v => { setBeneficiary(v); if (v !== null) setChild(null) }}
            options={[{ value: null, label: 'Familia' }, ...adults.map(a => ({ value: a.id, label: a.display_name, color: a.color }))]} />

          {beneficiary === null && kids.length > 0 && (
            <Segmented label="¿Es de algún niño? (opcional)" value={child} onChange={setChild}
              options={[{ value: null, label: 'No' }, ...kids.map(k => ({ value: k.id, label: k.display_name, color: k.color }))]} />
          )}

          {consequence && (
            <p className={`text-sm rounded-xl px-4 py-3 ${debt ? 'bg-accent-soft text-ink' : 'bg-card text-muted'}`}>{consequence}</p>
          )}

          <Field2 label="Nota (opcional)">
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px]" />
          </Field2>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Ticket (opcional)</span>
            {receiptPreview ? (
              <div className="flex items-center gap-3">
                <a href={receiptPreview} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={receiptPreview} alt="Foto del ticket" className="w-20 h-20 object-cover rounded-xl border border-line" />
                </a>
                <div className="flex flex-col gap-1">
                  <label className="min-h-10 flex items-center text-sm font-semibold text-accent cursor-pointer">
                    Cambiar foto
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => pickReceipt(e.target.files?.[0])} />
                  </label>
                  <button type="button" onClick={() => { setReceiptPath(null); setNewReceipt(null); setReceiptPreview(null) }} className="min-h-10 text-left text-sm text-danger">Quitar</button>
                </div>
              </div>
            ) : (
              <label className="min-h-12 px-4 rounded-xl border border-dashed border-line bg-card flex items-center gap-2 text-[15px] font-semibold text-accent cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg>
                Hacer o elegir foto
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => pickReceipt(e.target.files?.[0])} />
              </label>
            )}
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={busy} className="min-h-13 py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
            {busy ? 'Guardando…' : expense ? 'Guardar cambios' : 'Añadir gasto'}
          </button>

          {onDelete && (confirmDelete ? (
            <div className="flex items-center justify-between bg-card rounded-xl px-4 py-2">
              <span className="text-sm">¿Eliminar este gasto?</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-10 px-2 text-sm text-muted">No</button>
                <button type="button" onClick={onDelete} className="min-h-10 px-3 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Eliminar</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 text-danger text-sm font-semibold">Eliminar gasto</button>
          ))}
        </form>
      </div>
    </div>
  )
}

function Field2({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
