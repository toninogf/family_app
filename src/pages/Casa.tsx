import { useMemo, useState, type FormEvent } from 'react'
import TareasMaestro from './casa/TareasMaestro'
import { ChipRow } from './agenda/Maestro'
import { useIconCategories, type IconCategories } from '../lib/categories'
import IconCategoriesSheet from '../components/IconCategoriesSheet'
import { useHousehold } from '../lib/household'
import type { Member } from '../lib/supabase'
import { addDays, parseISO, relativeDay, shortDate, today } from '../lib/dates'
import { anytimeTasks, lastDone, occurrencesBetween, repeatLabel, useTasks, type Occurrence, type Repeat, type Task, type TaskInput } from '../lib/home'
import { Card } from '../components/ui'
import { Choice, ConfirmDelete, Fab, Sheet, TextField, WeekdayPicker } from '../components/Sheet'

/** Pestaña «Tareas» (antes «Casa») */
export default function TareasPage() {
  return (
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="text-[26px] font-bold tracking-tight">Tareas</h1>
      <Tareas />
    </div>
  )
}

function Tareas() {
  const { me, members } = useHousehold()
  const t = today()
  const end = addDays(t, 6)
  const { tasks, completions, loading, error, toggle, save, remove, setActive, clearError } = useTasks(t, end)
  const cats = useIconCategories('task_categories')
  const [view, setViewState] = useState<'pendientes' | 'maestro'>(() => {
    try { return localStorage.getItem('tareas-vista') === 'maestro' ? 'maestro' : 'pendientes' } catch { return 'pendientes' }
  })
  const [who, setWho] = useState<string>('all')
  const [cat, setCat] = useState<string>('all')
  const [catsOpen, setCatsOpen] = useState(false)
  const [sheet, setSheet] = useState<{ open: boolean; task?: Task }>({ open: false })
  const adults = members.filter(m => m.kind === 'adult')

  const setView = (v: 'pendientes' | 'maestro') => { setViewState(v); try { localStorage.setItem('tareas-vista', v) } catch { /* nada */ } }
  const visible = (o: Occurrence) =>
    (who === 'all' || o.task.assignee_id === who || o.task.assignee_id === null) &&
    (cat === 'all' || (cat === 'none' ? !o.task.category_id : o.task.category_id === cat))
  const occ = useMemo(() => occurrencesBetween(tasks, completions, t, end, true), [tasks, completions, t, end])
  const overdue = occ.filter(o => o.date < t && visible(o))
  const todays = occ.filter(o => o.date === t && visible(o))
  const upcoming = occ.filter(o => o.date > t && visible(o))
  const anytime = useMemo(() => anytimeTasks(tasks, completions, t), [tasks, completions, t]).filter(visible)
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of upcoming) m.set(o.date, [...(m.get(o.date) ?? []), o])
    return [...m.entries()]
  }, [upcoming])

  return (
    <>
      <div className="flex gap-1.5">
        {([['pendientes', 'Pendientes'], ['maestro', 'Maestro']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
            className={`flex-1 min-h-10 rounded-xl text-[14px] font-semibold border ${view === k ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <ChipRow<string> value={who} onChange={setWho} options={[['all', 'Todos'], ...adults.map(a => [a.id, a.display_name] as [string, string])]} />
        <div className="flex gap-1.5 items-center">
          <div className="flex-1 min-w-0">
            <ChipRow<string> value={cat} onChange={setCat}
              options={[['all', 'Todas las categorías'], ...cats.active.map(c => [c.id, `${c.icon} ${c.name}`] as [string, string]), ['none', 'Sin categoría']]} />
          </div>
          <button onClick={() => setCatsOpen(true)} aria-label="Editar categorías" className="w-9 h-9 shrink-0 rounded-full bg-card border border-line text-muted">⚙︎</button>
        </div>
      </div>
      {catsOpen && <IconCategoriesSheet title="Categorías de tareas" cats={cats} onClose={() => setCatsOpen(false)} />}

      {error && (
        <Card className="flex justify-between items-center gap-3">
          <p role="alert" className="text-danger text-sm">No se pudo guardar: {error}</p>
          <button onClick={clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
        </Card>
      )}

      {view === 'maestro' ? (
        <TareasMaestro members={members} cats={cats} who={who} cat={cat} onOpen={task => setSheet({ open: true, task })} />
      ) : loading ? <p className="text-muted text-sm">Cargando…</p> : tasks.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Aún no hay tareas</p>
          <p className="text-sm text-muted">Añade las de siempre (basura, lavadora, regar…) con su día, categoría y quién se encarga.</p>
        </Card>
      ) : (
        <>
          {overdue.length > 0 && <TaskGroup title="Pendientes de otros días" items={overdue} members={members} me={me} cats={cats} onToggle={toggle} showDate />}
          <TaskGroup title="Hoy" items={todays} members={members} me={me} cats={cats} onToggle={toggle} empty="Nada para hoy." />
          {anytime.length > 0 && <TaskGroup title="Sin fecha" items={anytime} members={members} me={me} cats={cats} onToggle={toggle} onOpen={task => setSheet({ open: true, task })} />}
          {byDay.map(([day, items]) => (
            <TaskGroup key={day} title={relativeDay(day)} items={items} members={members} me={me} cats={cats} onToggle={toggle} />
          ))}
        </>
      )}

      <Fab label="Tarea" onClick={() => setSheet({ open: true })} />

      {sheet.open && me && (
        <TaskSheet
          task={sheet.task}
          adults={adults}
          cats={cats}
          defaultCategory={cat !== 'all' && cat !== 'none' ? cat : null}
          lastDoneDate={sheet.task ? lastDone(sheet.task, completions)?.occurrence_date : undefined}
          meId={me.id}
          onClose={() => setSheet({ open: false })}
          onSave={async input => { const err = await save(me.household_id, input, sheet.task?.id); if (!err) setSheet({ open: false }); return err?.message }}
          onToggleActive={sheet.task ? async () => { await setActive(sheet.task!.id, !sheet.task!.active); setSheet({ open: false }) } : undefined}
          onDelete={sheet.task ? async () => { await remove(sheet.task!.id); setSheet({ open: false }) } : undefined}
        />
      )}
    </>
  )
}

export function assigneeName(id: string | null, members: Member[]) {
  return id ? members.find(m => m.id === id)?.display_name ?? '¿?' : 'Cualquiera'
}

/** Texto bajo la tarea: cuándo tocaba, quién la hizo o su frecuencia */
function taskSubtitle(o: Occurrence, showDate?: boolean) {
  const t = today()
  if (o.task.repeat === 'anytime') {
    if (!o.date) return 'Sin fecha'
    return o.date < t ? `Vencida · era para ${relativeDay(o.date).toLowerCase()}` : o.date === t ? 'Vence hoy' : `Antes del ${shortDate(o.date)}`
  }
  const when = o.task.repeat === 'interval' && !o.done && o.date < t ? `Tocaba ${relativeDay(o.date).toLowerCase()} · ` : showDate ? `${relativeDay(o.date)} · ` : ''
  return when + (o.task.repeat !== 'none' ? repeatLabel(o.task) : 'Una vez')
}

export function TaskGroup({ title, items, members, me, cats, onToggle, empty, showDate, onOpen }: {
  title: string; items: Occurrence[]; members: Member[]; me: Member | null; cats?: IconCategories; onToggle: (o: Occurrence) => void; empty?: string; showDate?: boolean
  onOpen?: (t: Task) => void
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
              const late = !o.done && !!o.date && o.date < today() && (o.task.repeat === 'anytime' || o.task.repeat === 'interval')
              return (
                <li key={`${o.task.id}-${o.date}`} className={idx < items.length - 1 ? 'border-b border-line' : ''}>
                  <label className="flex items-center gap-3 min-h-13 py-2">
                    <input type="checkbox" checked={!!o.done} onChange={() => onToggle(o)} className="w-5 h-5 accent-[var(--app-accent)]" />
                    <span className="flex-1 flex flex-col">
                      <span className={`text-[15px] ${o.done ? 'line-through text-muted' : ''}`}>{o.task.private ? '🔒 ' : ''}{cats?.byId(o.task.category_id)?.icon ? `${cats.byId(o.task.category_id)!.icon} ` : ''}{o.task.title}</span>
                      <span className={`text-xs ${late ? 'text-danger font-semibold' : 'text-muted'}`}>
                        {doneBy ? `Hecha por ${doneBy}` : taskSubtitle(o, showDate)}
                      </span>
                    </span>
                    {onOpen && (
                      <button type="button" onClick={e => { e.preventDefault(); onOpen(o.task) }} aria-label={`Editar ${o.task.title}`} className="w-8 h-10 text-muted text-lg shrink-0">⋯</button>
                    )}
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

function TaskSheet({ task, adults, cats, defaultCategory, lastDoneDate, meId, onClose, onSave, onToggleActive, onDelete }: {
  task?: Task; adults: Member[]; cats: IconCategories; defaultCategory: string | null; lastDoneDate?: string; meId: string; onClose: () => void
  onSave: (input: TaskInput) => Promise<string | undefined>; onToggleActive?: () => Promise<void>; onDelete?: () => Promise<void>
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(task ? task.category_id : defaultCategory)
  const [assignee, setAssignee] = useState<string | null>(task?.assignee_id ?? null)
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? 'weekly')
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays?.length ? task.weekdays : [])
  const [startDate, setStartDate] = useState(task?.start_date ?? today())
  const [monthDay, setMonthDay] = useState(String(task?.month_day ?? parseISO(today()).getDate()))
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [isPrivate, setIsPrivate] = useState(task?.private ?? false)
  // Solo quien creó la tarea puede hacerla privada
  const canPrivate = !task || task.created_by === meId
  const [every, setEvery] = useState(String(task?.interval_days ?? 7))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Escribe qué hay que hacer'); return }
    if (repeat === 'weekly' && !weekdays.length) { setError('Elige al menos un día'); return }
    const md = parseInt(monthDay, 10)
    if (repeat === 'monthly' && !(md >= 1 && md <= 31)) { setError('Día del mes entre 1 y 31'); return }
    const n = parseInt(every, 10)
    if (repeat === 'interval' && !(n >= 1 && n <= 365)) { setError('Cada cuántos días: entre 1 y 365'); return }
    setBusy(true); setError('')
    const err = await onSave({
      title: title.trim(), category_id: categoryId, assignee_id: isPrivate ? meId : assignee, private: isPrivate, repeat, weekdays, month_day: repeat === 'monthly' ? md : null,
      start_date: repeat === 'anytime' ? (task?.start_date ?? today()) : startDate,
      due_date: repeat === 'anytime' && dueDate ? dueDate : null, interval_days: repeat === 'interval' ? n : null
    })
    setBusy(false)
    if (err) setError(err)
  }

  /** Pasa una tarea «Sin fecha» a un día concreto */
  async function planFor(day: string) {
    setBusy(true); setError('')
    const err = await onSave({ title: title.trim() || task!.title, category_id: categoryId, assignee_id: isPrivate ? meId : assignee, private: isPrivate, repeat: 'none', weekdays: [], month_day: null, start_date: day, due_date: null, interval_days: null })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Tarea" autoFocus={!task} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Sacar la basura" />
        <Choice<string | null> label="Categoría" value={categoryId} onChange={setCategoryId}
          options={[...cats.categories.filter(c => !c.archived || c.id === categoryId).map(c => ({ value: c.id as string | null, label: `${c.icon} ${c.name}` })), { value: null, label: 'Sin categoría' }]} />
        {canPrivate && (
          <div className="flex flex-col gap-1.5">
            <Choice<'shared' | 'private'> label="¿Quién la ve?" value={isPrivate ? 'private' : 'shared'} onChange={v => setIsPrivate(v === 'private')}
              options={[{ value: 'shared', label: '👪 Compartida' }, { value: 'private', label: '🔒 Solo para mí' }]} />
            {isPrivate && <p className="text-xs text-muted">Solo la verás tú, en la app y en tus avisos. Se te asigna a ti.</p>}
          </div>
        )}
        {!isPrivate && (
          <Choice label="¿Quién se encarga?" value={assignee} onChange={setAssignee}
            options={[{ value: null, label: 'Cualquiera' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
        )}
        <Choice<Repeat> label="¿Cuándo?" value={repeat} onChange={setRepeat}
          options={[{ value: 'none', label: 'Una vez' }, { value: 'daily', label: 'Cada día' }, { value: 'weekly', label: 'Cada semana' }, { value: 'monthly', label: 'Cada mes' },
            { value: 'anytime', label: 'Sin fecha' }, { value: 'interval', label: 'Cada X días' }]} />
        {repeat === 'weekly' && <WeekdayPicker value={weekdays} onChange={setWeekdays} />}
        {repeat === 'monthly' && <TextField label="Día del mes" inputMode="numeric" value={monthDay} onChange={e => setMonthDay(e.target.value)} />}
        {repeat === 'anytime' ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <div className="flex-1"><TextField label="Fecha límite (opcional)" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              {dueDate && <button type="button" onClick={() => setDueDate('')} className="min-h-12 px-3 text-sm text-muted">Quitar</button>}
            </div>
            <p className="text-xs text-muted">Sale en «Sin fecha» hasta que la hagáis. En Hoy solo aparece cuando vence hoy o mañana, o si ya ha vencido.</p>
          </div>
        ) : (
          <>
            {repeat === 'interval' && (
              <div className="flex flex-col gap-1.5">
                <TextField label="¿Cada cuántos días?" inputMode="numeric" value={every} onChange={e => setEvery(e.target.value.replace(/\D/g, ''))} />
                <p className="text-xs text-muted">Vuelve a tocar {every || 'X'} días después de la última vez que se hizo{lastDoneDate ? ` (última: ${relativeDay(lastDoneDate).toLowerCase()})` : ''}.</p>
              </div>
            )}
            <TextField label={repeat === 'none' ? 'Fecha' : repeat === 'interval' ? (lastDoneDate ? 'Empezó el' : 'Primera vez') : 'A partir de'} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : task ? 'Guardar cambios' : 'Añadir tarea'}
        </button>
        {task?.repeat === 'anytime' && repeat === 'anytime' && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => planFor(today())} className="flex-1 py-3 rounded-xl border border-line bg-card font-semibold text-sm">📌 Hacerla hoy</button>
            <button type="button" disabled={busy} onClick={() => planFor(addDays(today(), 1))} className="flex-1 py-3 rounded-xl border border-line bg-card font-semibold text-sm">Mañana</button>
          </div>
        )}
        {task && onToggleActive && (
          <button type="button" onClick={onToggleActive} className="py-3 rounded-xl border border-line bg-card font-semibold">
            {task.active ? '⏸️ Pausar tarea (deja de salir hasta que la reanudes)' : '▶️ Reanudar tarea'}
          </button>
        )}
        {onDelete && <ConfirmDelete label="Eliminar tarea" onConfirm={onDelete} confirming={confirming} setConfirming={setConfirming} />}
      </form>
    </Sheet>
  )
}
