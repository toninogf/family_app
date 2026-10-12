import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, isoWeekday } from './dates'

export type FamilyEvent = {
  id: string
  child_id: string | null
  title: string
  location: string | null
  start_time: string
  end_time: string | null
  repeat: 'none' | 'weekly'
  weekdays: number[]
  start_date: string
  until: string | null
  drop_off_id: string | null
  pick_up_id: string | null
  note: string | null
}
export type EventException = {
  id: string
  event_id: string
  occurrence_date: string
  cancelled: boolean
  start_time: string | null
  end_time: string | null
  override_drivers: boolean
  drop_off_id: string | null
  pick_up_id: string | null
  note: string | null
}
export type EventInput = Omit<FamilyEvent, 'id'>
export type ExceptionInput = Omit<EventException, 'id' | 'event_id' | 'occurrence_date'>

/** Una actividad concreta en un día, ya con los cambios puntuales aplicados */
export type Agenda = {
  event: FamilyEvent
  date: string
  start: string
  end: string | null
  dropOff: string | null
  pickUp: string | null
  cancelled: boolean
  changed: boolean
  note: string | null
  exception: EventException | undefined
}

export function eventOccursOn(e: FamilyEvent, date: string) {
  if (date < e.start_date) return false
  if (e.until && date > e.until) return false
  if (e.repeat === 'none') return date === e.start_date
  return e.weekdays.includes(isoWeekday(date))
}

export function agendaFor(events: FamilyEvent[], exceptions: EventException[], date: string): Agenda[] {
  const exc = new Map(exceptions.filter(x => x.occurrence_date === date).map(x => [x.event_id, x]))
  return events
    .filter(e => eventOccursOn(e, date))
    .map(e => {
      const x = exc.get(e.id)
      return {
        event: e,
        date,
        start: x?.start_time ?? e.start_time,
        end: x?.end_time ?? e.end_time,
        dropOff: x?.override_drivers ? x.drop_off_id : e.drop_off_id,
        pickUp: x?.override_drivers ? x.pick_up_id : e.pick_up_id,
        cancelled: x?.cancelled ?? false,
        changed: !!x && !x.cancelled,
        note: x?.note ?? e.note,
        exception: x
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function useEvents(from: string, to: string) {
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [exceptions, setExceptions] = useState<EventException[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [e, x] = await Promise.all([
      supabase.from('events')
        .select('id, child_id, title, location, start_time, end_time, repeat, weekdays, start_date, until, drop_off_id, pick_up_id, note')
        .lte('start_date', to)
        .or(`until.is.null,until.gte.${from}`)
        .order('start_time'),
      supabase.from('event_exceptions')
        .select('id, event_id, occurrence_date, cancelled, start_time, end_time, override_drivers, drop_off_id, pick_up_id, note')
        .gte('occurrence_date', from).lte('occurrence_date', to)
    ])
    if (e.error) setError(e.error.message)
    setEvents((e.data ?? []) as FamilyEvent[])
    setExceptions((x.data ?? []) as EventException[])
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    load()
    const channel = supabase.channel(`events:${from}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_exceptions' }, () => load())
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [from, load])

  async function saveEvent(householdId: string, input: EventInput, id?: string) {
    const clean = { ...input, weekdays: input.repeat === 'weekly' ? input.weekdays : [], until: input.repeat === 'weekly' ? input.until : null }
    const { error } = id
      ? await supabase.from('events').update(clean).eq('id', id)
      : await supabase.from('events').insert({ ...clean, household_id: householdId })
    if (error) setError(error.message)
    await load()
    return error
  }

  async function removeEvent(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id))
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { setError(error.message); await load() }
  }

  /** Termina una actividad semanal a partir de una fecha (conserva el historial anterior) */
  async function endEventFrom(e: FamilyEvent, date: string) {
    if (date <= e.start_date) return removeEvent(e.id)
    const { error } = await supabase.from('events').update({ until: addDays(date, -1) }).eq('id', e.id)
    if (error) setError(error.message)
    await load()
  }

  async function saveException(eventId: string, date: string, input: ExceptionInput) {
    const { error } = await supabase.from('event_exceptions').upsert(
      { event_id: eventId, occurrence_date: date, ...input },
      { onConflict: 'event_id,occurrence_date' }
    )
    if (error) setError(error.message)
    await load()
    return error
  }

  async function clearException(id: string) {
    const { error } = await supabase.from('event_exceptions').delete().eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  return { events, exceptions, loading, error, saveEvent, removeEvent, endEventFrom, saveException, clearException, clearError: () => setError('') }
}
