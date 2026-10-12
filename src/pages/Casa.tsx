import { useMemo, useState, type FormEvent } from 'react'
import { useHousehold } from '../lib/household'
import type { Member } from '../lib/supabase'
import { addDays, parseISO, relativeDay, today } from '../lib/dates'
import { occurrencesBetween, repeatLabel, useTasks, type Occurrence, type Repeat, type Task, type TaskInput } from '../lib/home'
import { Card } from '../components/ui'
import { Choice, ConfirmDelete, Fab, Sheet, TextField, WeekdayPicker } from '../components/Sheet'

export default function Casa() {
  const { me, members } = useHousehold()
  const t = today()
  const end = addDays(t, 6)
  const { tasks, completions, loading, error, toggle, save, remove, clearError } = useTasks(t, end)
  const [who, setWho] = useState<string>('all')
  const [sheet, setSheet] = useState<{ open: boolean; task?: Task }>({ open: false })
  const [showAll, setShowAll] = useState(false)
  const adults = members.filter(m => m.kind === 'adult')

  const visible = (o: Occurrence) => who === 'all' || o.task.assignee_id === who || o.task.assignee_id === null
  const occ = useMemo(() => occurrencesBetween(tasks, completions, t, end, true), [tasks, completions, t, end])
  const overdue = occ.filter(o => o.date < t && visible(o))
  const todays = occ.filter(o => o.date === t && visible(o))
  const upcoming = occ.filter(o => o.date > t && visible(o))
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of upcoming) m.set(o.date, [...(m.get(o.date) ?? []), o])
    return [...m.entries()]
  }, [upcoming])

  return (
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="text-[26px] font-bold tracking-tight">Casa</h1>

      <div className="flex gap-1.5">
        {[['all', 'Todas'], ...adults.map(a => [a.id, a.display_name])].map(([k, l]) => (
          <button key={k} onClick={() => setWho(k)} aria-pressed={who === k}
            className={`min-h-9 px-3 rounded-full text-[13px] font-semibold ${who === k ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{l}</button>
        ))}
      </div>

      {error && (
        <Card className="flex justify-between items-center gap-3">
          <p role="alert" className="text-danger text-sm">No se pudo guardar: {error}</p>
          <button onClick={clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
        </Card>
      )}

      {loading ? <p className="text-muted text-sm">Cargando…</p> : tasks.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Aún no hay tareas</p>
          <p className="text-sm text-muted">Añade las de siempre (basura, lavadora, regar…) con su día y quién se encarga.</p>
        </Card>
      ) : (
        <>
          {overdue.length > 0 && <TaskGroup title="Pendientes de otros días" items={overdue} members={members} me={me} onToggle={toggle} showDate />}
          <TaskGroup title="Hoy" items={todays} members={members} me={me} onToggle={toggle} empty="Nada para hoy." />
          {byDay.map(([day, items]) => (
            <TaskGroup key={day} title={relativeDay(day)} items={items} members={members} me={me} onToggle={toggle} />
          ))}
        </>
      )}

      {tasks.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setShowAll(s => !s)} aria-expanded={showAll} className="min-h-10 text-sm font-semibold text-muted self-start">
            Todas las tareas ({tasks.length}) {showAll ? '▾' : '▸'}
          </button>
          {showAll && (
            <Card className="py-1">
              <ul>
                {tasks.map((task, idx) => (
                  <li key={task.id} className={idx < tasks.length - 1 ? 'border-b border-line' : ''}>
                    <button onClick={() => setSheet({ open: true, task })} className="w-full text-left flex flex-col min-h-14 py-2 justify-center">
                      <span className="text-[15px] font-semibold">{task.title}</span>
                      <span className="text-xs text-muted">{repeatLabel(task)} · {assigneeName(task.assignee_id, members)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      <Fab label="Tarea" onClick={() => setSheet({ open: true })} />

      {sheet.open && me && (
        <TaskSheet
          task={sheet.task}
          adults={adults}
          onClose={() => setSheet({ open: false })}
          onSave={async input => { const err = await save(me.household_id, input, sheet.task?.id); if (!err) setSheet({ open: false }); return err?.message }}
          onDelete={sheet.task ? async () => { await remove(sheet.task!.id); setSheet({ open: false }) } : undefined}
        />
      )}
    </div>
  )
}

function assigneeName(id: string | null, members: Member[]) {
  return id ? members.find(m => m.id === id)?.display_name ?? '¿?' : 'Cualquiera'
}

export function TaskGroup({ title, items, members, me, onToggle, empty, showDate }: {
  title: string; items: Occurrence[]; members: Member[]; me: Member | null; onToggle: (o: Occurrence) => void; empty?: string; showDate?: boolean
}) {
  if (!items.length && !empty) return null
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">{title}</h2>
      <Card className="py-1">
        {!items.length ? <p className="text-sm text-muted py-2">{empty}</p> : (
          <ul>
            {items.map((o, idx) => {
              const assignee = o.task.assignee_id ? members.find(m => m.id === o.task.assignee_id) : null
              const doneBy = o.done?.done_by && o.done.done_by !== me?.id ? members.find(m => m.id === o.done!.done_by)?.display_name : null
              return (
                <li key={`${o.task.id}-${o.date}`} className={idx < items.length - 1 ? 'border-b border-line' : ''}>
                  <label className="flex items-center gap-3 min-h-13 py-2">
                    <input type="checkbox" checked={!!o.done} onChange={() => onToggle(o)} className="w-5 h-5 accent-[var(--app-accent)]" />
                    <span className="flex-1 flex flex-col">
                      <span className={`text-[15px] ${o.done ? 'line-through text-muted' : ''}`}>{o.task.title}</span>
                      <span className="text-xs text-muted">
                        {showDate ? `${relativeDay(o.date)} · ` : ''}
                        {doneBy ? `Hecha por ${doneBy}` : o.task.repeat !== 'none' ? repeatLabel(o.task) : 'Una vez'}
                      </span>
                    </span>
                    {assignee ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 bg-bg">
                        <span className="w-2 h-2 rounded-full" style={{ background: assignee.color }} aria-hidden="true" />{assignee.display_name}
                      </span>
                    ) : <span className="text-xs text-muted">Cualquiera</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </section>
  )
}

function TaskSheet({ task, adults, onClose, onSave, onDelete }: {
  task?: Task; adults: Member[]; onClose: () => void; onSave: (input: TaskInput) => Promise<string | undefined>; onDelete?: () => Promise<void>
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [assignee, setAssignee] = useState<string | null>(task?.assignee_id ?? null)
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? 'weekly')
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays?.length ? task.weekdays : [])
  const [startDate, setStartDate] = useState(task?.start_date ?? today())
  const [monthDay, setMonthDay] = useState(String(task?.month_day ?? parseISO(today()).getDate()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Escribe qué hay que hacer'); return }
    if (repeat === 'weekly' && !weekdays.length) { setError('Elige al menos un día'); return }
    const md = parseInt(monthDay, 10)
    if (repeat === 'monthly' && !(md >= 1 && md <= 31)) { setError('Día del mes entre 1 y 31'); return }
    setBusy(true); setError('')
    const err = await onSave({ title: title.trim(), assignee_id: assignee, repeat, weekdays, month_day: repeat === 'monthly' ? md : null, start_date: startDate })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Tarea" autoFocus={!task} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Sacar la basura" />
        <Choice label="¿Quién se encarga?" value={assignee} onChange={setAssignee}
          options={[{ value: null, label: 'Cualquiera' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
        <Choice<Repeat> label="¿Cuándo?" value={repeat} onChange={setRepeat}
          options={[{ value: 'none', label: 'Una vez' }, { value: 'daily', label: 'Cada día' }, { value: 'weekly', label: 'Cada semana' }, { value: 'monthly', label: 'Cada mes' }]} />
        {repeat === 'weekly' && <WeekdayPicker value={weekdays} onChange={setWeekdays} />}
        {repeat === 'monthly' && <TextField label="Día del mes" inputMode="numeric" value={monthDay} onChange={e => setMonthDay(e.target.value)} />}
        <TextField label={repeat === 'none' ? 'Fecha' : 'A partir de'} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : task ? 'Guardar cambios' : 'Añadir tarea'}
        </button>
        {onDelete && <ConfirmDelete label="Eliminar tarea" onConfirm={onDelete} confirming={confirming} setConfirming={setConfirming} />}
      </form>
    </Sheet>
  )
}
