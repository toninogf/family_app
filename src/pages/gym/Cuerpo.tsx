import { useState, type FormEvent } from 'react'
import { shortDate, today } from '../../lib/dates'
import { fmtNum, parseNum, type Body, type Gym } from '../../lib/gym'
import { Card } from '../../components/ui'
import { ConfirmDelete, Sheet, TextField } from '../../components/Sheet'
import LineChart from '../../components/LineChart'

type Field = 'weight_kg' | 'body_fat_pct' | 'waist_cm' | 'chest_cm' | 'hip_cm' | 'arm_cm' | 'thigh_cm'
const FIELDS: { key: Field; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg' }, { key: 'body_fat_pct', label: 'Grasa corporal', unit: '%' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm' }, { key: 'chest_cm', label: 'Pecho', unit: 'cm' }, { key: 'hip_cm', label: 'Cadera', unit: 'cm' },
  { key: 'arm_cm', label: 'Brazo', unit: 'cm' }, { key: 'thigh_cm', label: 'Muslo', unit: 'cm' }
]

export default function Cuerpo({ g }: { g: Gym }) {
  const [field, setField] = useState<Field>('weight_kg')
  const [sheet, setSheet] = useState<{ open: boolean; row?: Body }>({ open: false })
  const f = FIELDS.find(x => x.key === field)!
  const pts = g.body.filter(b => b[field] != null).map(b => ({ label: shortDate(b.measured_on), value: Number(b[field]) }))
  const latest = [...g.body].reverse()

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setSheet({ open: true })} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">+ Apuntar medidas de hoy</button>

      {g.body.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {FIELDS.filter(x => g.body.some(b => b[x.key] != null)).map(x => (
              <button key={x.key} onClick={() => setField(x.key)} aria-pressed={field === x.key}
                className={`min-h-9 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 ${field === x.key ? 'bg-ink text-bg' : 'bg-bg border border-line'}`}>{x.label}</button>
            ))}
          </div>
          <LineChart unit={f.unit} points={pts} />
        </Card>
      )}

      {latest.length === 0 ? <Card><p className="text-sm text-muted">Apunta tu peso y, si quieres, tus medidas. Solo tú las ves.</p></Card> : (
        <Card className="py-1">
          <ul>
            {latest.map((b, i) => {
              const prev = latest[i + 1]
              const diff = b.weight_kg != null && prev?.weight_kg != null ? b.weight_kg - prev.weight_kg : null
              return (
                <li key={b.id} className={i < latest.length - 1 ? 'border-b border-line' : ''}>
                  <button onClick={() => setSheet({ open: true, row: b })} className="w-full text-left py-3 flex justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{shortDate(b.measured_on)}</span>
                      <span className="text-xs text-muted">
                        {FIELDS.filter(x => x.key !== 'weight_kg' && b[x.key] != null).map(x => `${x.label} ${fmtNum(b[x.key])} ${x.unit}`).join(' · ')}
                      </span>
                    </span>
                    {b.weight_kg != null && (
                      <span className="text-right shrink-0">
                        <b>{fmtNum(b.weight_kg)} kg</b>
                        {diff != null && diff !== 0 && <><br /><span className="text-xs text-muted">{diff > 0 ? '+' : ''}{fmtNum(diff)} kg</span></>}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {sheet.open && <BodySheet g={g} row={sheet.row} onClose={() => setSheet({ open: false })} />}
    </div>
  )
}

function BodySheet({ g, row, onClose }: { g: Gym; row?: Body; onClose: () => void }) {
  const last = g.body[g.body.length - 1]
  const [date, setDate] = useState(row?.measured_on ?? today())
  const [vals, setVals] = useState<Record<Field, string>>(() =>
    Object.fromEntries(FIELDS.map(x => [x.key, row?.[x.key] != null ? String(row[x.key]).replace('.', ',') : ''])) as Record<Field, string>)
  const [notes, setNotes] = useState(row?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = Object.fromEntries(FIELDS.map(x => [x.key, parseNum(vals[x.key])])) as Record<Field, number | null>
    if (Object.values(parsed).some(v => Number.isNaN(v))) { setError('Revisa los números (usa coma o punto para decimales)'); return }
    if (Object.values(parsed).every(v => v == null)) { setError('Apunta al menos un dato'); return }
    const err = await g.saveBody({ measured_on: date, ...parsed, notes: notes.trim() || null }, row?.id)
    if (err) setError('Algún valor está fuera de rango'); else onClose()
  }

  return (
    <Sheet title={row ? 'Editar medidas' : 'Nuevas medidas'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Fecha" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(x => (
            <TextField key={x.key} label={`${x.label} (${x.unit})`} inputMode="decimal" value={vals[x.key]}
              onChange={e => setVals(v => ({ ...v, [x.key]: e.target.value }))}
              placeholder={!row && last?.[x.key] != null ? `Antes ${fmtNum(last[x.key])}` : ''} />
          ))}
        </div>
        <TextField label="Nota (opcional)" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="Ej. en ayunas" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Guardar</button>
        {row && <ConfirmDelete label="Eliminar" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await g.deleteBody(row.id); onClose() }} />}
      </form>
      <p className="text-xs text-muted">Consejo: pésate siempre en las mismas condiciones (por ejemplo, por la mañana en ayunas) para que la gráfica sea fiable.</p>
    </Sheet>
  )
}
