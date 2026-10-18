import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, daysInMonth, isoWeekday, parseISO, shortDate, today as todayISO, weekdaysLabel } from './dates'

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'anytime' | 'interval'
/** «Sin fecha» y «Cada X días desde la última vez»: se marcan con la fecha real en que se hacen */
export const isFlexible = (t: Pick<Task, 'repeat'>) => t.repeat === 'anytime' || t.repeat === 'interval'
export type Task = {
  id: string
  title: string
  assignee_id: string | null
  repeat: Repeat
  weekdays: number[]
  month_day: number | null
  start_date: string
  active: boolean
  category_id: string | null
  due_date: string | null
  interval_days: number | null
  /** «Solo para mí»: solo la ve quien la creó */
  private: boolean
  created_by: string | null
}
export type Completion = { id: string; task_id: string; occurrence_date: string; done_by: string | null }
export type TaskInput = Omit<Task, 'id' | 'active' | 'created_by'>
export type Occurrence = { task: Task; date: string; done: Completion | undefined }

export function occursOn(t: Task, date: string) {
  if (!t.active || date < t.start_date) return false
  switch (t.repeat) {
    case 'none': return date === t.start_date
    case 'daily': return true
    case 'weekly': return t.weekdays.includes(isoWeekday(date))
    case 'monthly': {
      const day = parseISO(date).getDate()
      const target = Math.min(t.month_day ?? 1, daysInMonth(date))
      return day === target
    }
    default: return false // las flexibles se calculan aparte
  }
}

/** Última vez que se hizo una tarea */
export function lastDone(t: Task, completions: Completion[]) {
  let last: Completion | undefined
  for (const c of completions) if (c.task_id === t.id && (!last || c.occurrence_date > last.occurrence_date)) last = c
  return last
}

/** Cuándo vuelve a tocar una tarea «cada X días» */
export function nextDue(t: Task, completions: Completion[]) {
  const last = lastDone(t, completions)
  return last ? addDays(last.occurrence_date, t.interval_days ?? 1) : t.start_date
}

/** Tareas «Sin fecha» pendientes (y las hechas hoy, para poder desmarcarlas): primero las de fecha límite */
export function anytimeTasks(tasks: Task[], completions: Completion[], day = todayISO()): Occurrence[] {
  return tasks.filter(t => t.active && t.repeat === 'anytime').flatMap(t => {
    const done = lastDone(t, completions)
    if (done && done.occurrence_date !== day) return []
    return [{ task: t, date: t.due_date ?? '', done }]
  }).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : a.task.start_date.localeCompare(b.task.start_date)))
}

/** «Sin fecha» cuya fecha límite es hoy, mañana o ya ha pasado (para Hoy) */
export function anytimeDueSoon(tasks: Task[], completions: Completion[], day = todayISO()) {
  return anytimeTasks(tasks, completions, day).filter(o => o.date && o.date <= addDays(day, 1))
}

export function repeatLabel(t: Pick<Task, 'repeat' | 'weekdays' | 'month_day'> & Partial<Pick<Task, 'due_date' | 'interval_days'>>) {
  switch (t.repeat) {
    case 'none': return 'Una vez'
    case 'daily': return 'Cada día'
    case 'weekly': return `Cada semana, ${weekdaysLabel(t.weekdays)}`
    case 'monthly': return `Cada mes, el día ${t.month_day}`
    case 'anytime': return t.due_date ? `Sin fecha · antes del ${shortDate(t.due_date)}` : 'Sin fecha'
    case 'interval': return `Cada ${t.interval_days ?? '?'} día${t.interval_days === 1 ? '' : 's'} desde la última vez`
  }
}

/** Ocurrencias entre dos fechas (incluidas) + tareas puntuales vencidas sin hacer */
export function occurrencesBetween(tasks: Task[], completions: Completion[], from: string, to: string, includeOverdue = false): Occurrence[] {
  const done = new Map(completions.map(c => [`${c.task_id}|${c.occurrence_date}`, c]))
  const out: Occurrence[] = []
  if (includeOverdue) {
    for (const t of tasks) {
      if (t.active && t.repeat === 'none' && t.start_date < from && !done.has(`${t.id}|${t.start_date}`)) {
        out.push({ task: t, date: t.start_date, done: undefined })
      }
    }
  }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const t of tasks) {
      if (occursOn(t, d)) out.push({ task: t, date: d, done: done.get(`${t.id}|${d}`) })
    }
  }
  // «Cada X días»: sale el día que vuelve a tocar (o como pendiente si ya ha pasado); hecha hoy, sale tachada hoy
  const day = todayISO()
  for (const t of tasks) {
    if (!t.active || t.repeat !== 'interval') continue
    const last = lastDone(t, completions)
    if (last && last.occurrence_date === day && day >= from && day <= to) { out.push({ task: t, date: day, done: last }); continue }
    const due = nextDue(t, completions)
    if ((due >= from && due <= to) || (includeOverdue && due < from)) out.push({ task: t, date: due, done: undefined })
  }
  return out
}

export function useTasks(from: string, to: string, includePaused = false) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const cols = 'id, title, assignee_id, repeat, weekdays, month_day, start_date, active, category_id, due_date, interval_days, private, created_by'
    const [t, c] = await Promise.all([
      includePaused
        ? supabase.from('tasks').select(cols).order('created_at')
        : supabase.from('tasks').select(cols).eq('active', true).order('created_at'),
      // Incluye un margen hacia atrás para saber qué puntuales vencidas están hechas
      supabase.from('task_completions').select('id, task_id, occurrence_date, done_by').gte('occurrence_date', addDays(from, -120)).lte('occurrence_date', to)
    ])
    if (t.error) setError(t.error.message)
    const list = (t.data ?? []) as Task[]
    let comps = (c.data ?? []) as Completion[]
    // Las flexibles necesitan su última vez aunque sea antigua
    const flex = list.filter(isFlexible).map(x => x.id)
    if (flex.length) {
      const { data } = await supabase.from('task_completions').select('id, task_id, occurrence_date, done_by').in('task_id', flex)
      const seen = new Set(comps.map(x => x.id))
      comps = [...comps, ...((data ?? []) as Completion[]).filter(x => !seen.has(x.id))]
    }
    setTasks(list)
    setCompletions(comps)
    setLoading(false)
  }, [from, to, includePaused])

  useEffect(() => {
    load()
    const channel = supabase.channel(`tasks:${from}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => load())
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [from, load])

  async function toggle(o: Occurrence) {
    if (o.done) {
      setCompletions(prev => prev.filter(c => c.id !== o.done!.id))
      const { error } = await supabase.from('task_completions').delete().eq('id', o.done.id)
      if (error) setError(error.message)
    } else {
      // Las flexibles se apuntan el día en que se hacen de verdad
      const date = isFlexible(o.task) ? todayISO() : o.date
      const temp: Completion = { id: `tmp-${o.task.id}-${date}`, task_id: o.task.id, occurrence_date: date, done_by: null }
      setCompletions(prev => [...prev, temp])
      const { error } = await supabase.from('task_completions').insert({ task_id: o.task.id, occurrence_date: date })
      if (error) setError(error.message)
    }
    await load()
  }

  async function save(householdId: string, input: TaskInput, id?: string) {
    const clean = {
      ...input,
      weekdays: input.repeat === 'weekly' ? input.weekdays : [],
      month_day: input.repeat === 'monthly' ? input.month_day : null,
      due_date: input.repeat === 'anytime' ? input.due_date : null,
      interval_days: input.repeat === 'interval' ? input.interval_days : null
    }
    const { error } = id
      ? await supabase.from('tasks').update(clean).eq('id', id)
      : await supabase.from('tasks').insert({ ...clean, household_id: householdId })
    if (error) setError(error.message)
    await load()
    return error
  }

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from('tasks').update({ active }).eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  async function remove(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { setError(error.message); await load() }
  }

  return { tasks, completions, loading, error, toggle, save, remove, setActive, clearError: () => setError('') }
}
