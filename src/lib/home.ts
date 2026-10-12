import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, daysInMonth, isoWeekday, parseISO, weekdaysLabel } from './dates'

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'
export type Task = {
  id: string
  title: string
  assignee_id: string | null
  repeat: Repeat
  weekdays: number[]
  month_day: number | null
  start_date: string
  active: boolean
}
export type Completion = { id: string; task_id: string; occurrence_date: string; done_by: string | null }
export type TaskInput = Omit<Task, 'id' | 'active'>
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
  }
}

export function repeatLabel(t: Pick<Task, 'repeat' | 'weekdays' | 'month_day'>) {
  switch (t.repeat) {
    case 'none': return 'Una vez'
    case 'daily': return 'Cada día'
    case 'weekly': return `Cada semana, ${weekdaysLabel(t.weekdays)}`
    case 'monthly': return `Cada mes, el día ${t.month_day}`
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
  return out
}

export function useTasks(from: string, to: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([
      supabase.from('tasks').select('id, title, assignee_id, repeat, weekdays, month_day, start_date, active').eq('active', true).order('created_at'),
      // Incluye un margen hacia atrás para saber qué puntuales vencidas están hechas
      supabase.from('task_completions').select('id, task_id, occurrence_date, done_by').gte('occurrence_date', addDays(from, -120)).lte('occurrence_date', to)
    ])
    if (t.error) setError(t.error.message)
    setTasks((t.data ?? []) as Task[])
    setCompletions((c.data ?? []) as Completion[])
    setLoading(false)
  }, [from, to])

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
      const temp: Completion = { id: `tmp-${o.task.id}-${o.date}`, task_id: o.task.id, occurrence_date: o.date, done_by: null }
      setCompletions(prev => [...prev, temp])
      const { error } = await supabase.from('task_completions').insert({ task_id: o.task.id, occurrence_date: o.date })
      if (error) setError(error.message)
    }
    await load()
  }

  async function save(householdId: string, input: TaskInput, id?: string) {
    const clean = {
      ...input,
      weekdays: input.repeat === 'weekly' ? input.weekdays : [],
      month_day: input.repeat === 'monthly' ? input.month_day : null
    }
    const { error } = id
      ? await supabase.from('tasks').update(clean).eq('id', id)
      : await supabase.from('tasks').insert({ ...clean, household_id: householdId })
    if (error) setError(error.message)
    await load()
    return error
  }

  async function remove(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { setError(error.message); await load() }
  }

  return { tasks, completions, loading, error, toggle, save, remove, clearError: () => setError('') }
}
