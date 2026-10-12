import { useEffect, useMemo, useState } from 'react'
import { supabase, type Member } from '../lib/supabase'
import { formatEur, type Category } from '../lib/money'
import { guessCategoryName, guessColumns, parseCsv, readText, toMovements, type ColumnGuess } from '../lib/csvImport'
import { shortDate } from '../lib/dates'
import { Choice, Sheet } from './Sheet'

type Row = { key: string; date: string; description: string; cents: number; categoryId: string | null; selected: boolean; duplicate: boolean }

export default function ImportSheet({ householdId, categories, adults, onClose, onDone }: {
  householdId: string; categories: Category[]; adults: Member[]; onClose: () => void; onDone: (count: number) => void
}) {
  const [table, setTable] = useState<string[][] | null>(null)
  const [cols, setCols] = useState<ColumnGuess | null>(null)
  const [onlyCharges, setOnlyCharges] = useState(true)
  const [payer, setPayer] = useState<string | null>(null)
  const [beneficiary, setBeneficiary] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    const text = await readText(file)
    const parsed = parseCsv(text)
    const g = guessColumns(parsed.rows)
    if (!g) { setError('No reconozco el formato. Exporta los movimientos del banco en CSV (no Excel) y vuelve a probar.'); return }
    setTable(parsed.rows)
    setCols(g)
  }

  const movements = useMemo(() => (table && cols ? toMovements(table, cols) : []), [table, cols])

  // Prepara filas: categoría sugerida y posibles duplicados (misma fecha e importe ya registrados)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = movements.filter(m => (onlyCharges ? m.cents < 0 : true))
      if (!list.length) { setRows([]); return }
      const dates = list.map(m => m.date).sort()
      const { data } = await supabase.from('expenses').select('spent_on, amount_cents').gte('spent_on', dates[0]).lte('spent_on', dates.at(-1)!)
      const existing = new Set((data ?? []).map(e => `${e.spent_on}|${e.amount_cents}`))
      if (cancelled) return
      setRows(list.map((m, i) => {
        const cents = Math.abs(m.cents)
        const duplicate = existing.has(`${m.date}|${cents}`)
        const catName = guessCategoryName(m.description)
        return {
          key: `${i}-${m.date}-${m.cents}`, date: m.date, description: m.description, cents,
          categoryId: categories.find(c => c.name === catName)?.id ?? null, selected: !duplicate, duplicate
        }
      }))
    })()
    return () => { cancelled = true }
  }, [movements, onlyCharges, categories])

  const header = table && cols ? table[Math.max(0, cols.headerRow - 1)] : []
  const width = table ? Math.max(...table.map(r => r.length)) : 0
  const colLabel = (i: number) => (cols && cols.headerRow > 0 && header[i] ? header[i] : `Columna ${i + 1}`)
  const selected = rows.filter(r => r.selected)
  const total = selected.reduce((s, r) => s + r.cents, 0)

  async function doImport() {
    if (!selected.length) return
    setBusy(true); setError('')
    const payload = selected.map(r => ({
      household_id: householdId, amount_cents: r.cents, description: r.description, category_id: r.categoryId,
      spent_on: r.date, payer_id: payer, beneficiary_id: beneficiary, note: 'Importado del banco'
    }))
    const { error } = await supabase.from('expenses').insert(payload)
    setBusy(false)
    if (error) setError(error.message)
    else onDone(payload.length)
  }

  return (
    <Sheet title="Importar del banco" onClose={onClose}>
      {!table ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Descarga los movimientos desde la web o app de tu banco en formato <b>CSV</b> y elígelo aquí. El archivo no se sube a ningún sitio: se lee en tu móvil y solo se guardan los gastos que marques.
          </p>
          <label className="min-h-14 px-4 rounded-xl border border-dashed border-line bg-card flex items-center justify-center gap-2 text-[15px] font-semibold text-accent cursor-pointer">
            Elegir archivo CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={e => pick(e.target.files?.[0])} />
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <details className="bg-card rounded-xl px-4 py-2">
            <summary className="min-h-10 flex items-center text-sm font-semibold cursor-pointer">Columnas detectadas (cambiar si no cuadran)</summary>
            <div className="flex flex-col gap-2 pb-2">
              {(['date', 'description', 'amount'] as const).map(k => (
                <label key={k} className="flex items-center justify-between gap-2 text-sm">
                  <span>{k === 'date' ? 'Fecha' : k === 'description' ? 'Concepto' : 'Importe'}</span>
                  <select value={cols![k]} onChange={e => setCols(c => c && { ...c, [k]: Number(e.target.value) })} className="min-h-10 px-2 rounded-lg border border-line bg-bg max-w-[60%]">
                    {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>

          <label className="flex items-center gap-3 min-h-11">
            <input type="checkbox" checked={onlyCharges} onChange={e => setOnlyCharges(e.target.checked)} className="w-5 h-5 accent-[var(--app-accent)]" />
            <span className="text-sm">Solo cargos (ignorar ingresos como nóminas)</span>
          </label>

          <Choice label="¿Desde qué cuenta?" value={payer} onChange={setPayer}
            options={[{ value: null as string | null, label: 'Cuenta común' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
          <Choice label="¿Para quién?" value={beneficiary} onChange={setBeneficiary}
            options={[{ value: null as string | null, label: 'Familia' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />

          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">{rows.length} movimientos</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setRows(r => r.map(x => ({ ...x, selected: true })))} className="min-h-10 px-2 text-sm text-accent font-semibold">Todos</button>
              <button type="button" onClick={() => setRows(r => r.map(x => ({ ...x, selected: false })))} className="min-h-10 px-2 text-sm text-muted">Ninguno</button>
            </span>
          </div>

          <ul className="flex flex-col bg-card rounded-2xl px-4">
            {rows.map((r, idx) => (
              <li key={r.key} className={`flex flex-col gap-1.5 py-2.5 ${idx < rows.length - 1 ? 'border-b border-line' : ''}`}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={r.selected} onChange={e => setRows(rs => rs.map(x => x.key === r.key ? { ...x, selected: e.target.checked } : x))} className="w-5 h-5 mt-0.5 accent-[var(--app-accent)]" />
                  <span className="flex-1 flex flex-col min-w-0">
                    <span className="text-[14px] font-semibold break-words">{r.description}</span>
                    <span className="text-xs text-muted">{shortDate(r.date)}{r.duplicate ? ' · posible duplicado' : ''}</span>
                  </span>
                  <span className="text-[14px] font-bold shrink-0">{formatEur(r.cents)}</span>
                </label>
                {r.selected && (
                  <label className="pl-8">
                    <span className="sr-only">Categoría</span>
                    <select value={r.categoryId ?? ''} onChange={e => setRows(rs => rs.map(x => x.key === r.key ? { ...x, categoryId: e.target.value || null } : x))}
                      className="w-full min-h-10 px-2 rounded-lg border border-line bg-bg text-sm">
                      <option value="">Sin categoría</option>
                      {categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
              </li>
            ))}
            {!rows.length && <li className="py-3 text-sm text-muted">No hay movimientos que importar.</li>}
          </ul>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="button" onClick={doImport} disabled={busy || !selected.length}
            className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50 sticky bottom-0">
            {busy ? 'Importando…' : `Importar ${selected.length} gasto${selected.length === 1 ? '' : 's'} · ${formatEur(total)}`}
          </button>
          <button type="button" onClick={() => { setTable(null); setCols(null); setRows([]) }} className="min-h-11 text-sm text-muted">Elegir otro archivo</button>
        </div>
      )}
    </Sheet>
  )
}
