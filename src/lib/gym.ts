import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, today } from './dates'

// ---------- Tipos ----------
export type Muscle = 'pecho' | 'espalda' | 'pierna' | 'hombro' | 'brazos' | 'core' | 'cardio' | 'otro'
export type Exercise = { id: string; name: string; muscle: Muscle; kind: 'strength' | 'cardio'; archived: boolean }
export type Routine = { id: string; name: string; position: number; archived: boolean }
export type RoutineItem = {
  id: string; routine_id: string; exercise_id: string; position: number
  target_sets: number; target_reps: string | null; target_kg: number | null; rest_seconds: number
}
export type Session = { id: string; routine_id: string | null; title: string | null; session_date: string; started_at: string; ended_at: string | null; notes: string | null }
export type GymSet = {
  id: string; session_id: string; exercise_id: string; position: number; set_no: number
  reps: number | null; kg: number | null; minutes: number | null; km: number | null; rest_seconds: number; done: boolean
}
export type Body = {
  id: string; measured_on: string; weight_kg: number | null; body_fat_pct: number | null; waist_cm: number | null
  chest_cm: number | null; hip_cm: number | null; arm_cm: number | null; thigh_cm: number | null; notes: string | null
}

export const MUSCLES: Record<Muscle, string> = {
  pecho: 'Pecho', espalda: 'Espalda', pierna: 'Pierna', hombro: 'Hombro', brazos: 'Brazos', core: 'Core', cardio: 'Cardio', otro: 'Otro'
}

// ---------- Utilidades ----------
const n = (x: unknown) => (x == null ? null : Number(x))
export const fmtKg = (x: number | null | undefined) => (x == null ? '—' : `${Number(x).toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`)
export const fmtNum = (x: number | null | undefined, d = 1) => (x == null ? '—' : Number(x).toLocaleString('es-ES', { maximumFractionDigits: d }))
/** "10,5" → 10.5 */
export const parseNum = (s: string) => { const t = s.trim().replace(',', '.'); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : NaN }
/** 1RM estimado (fórmula de Epley) */
export const oneRm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30))
export const volumeOf = (sets: GymSet[]) => sets.filter(s => s.done && s.kg != null && s.reps != null).reduce((a, s) => a + Number(s.kg) * Number(s.reps), 0)
export function minutesBetween(a: string, b: string | null) {
  return Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000))
}

function cleanSet(r: Record<string, unknown>): GymSet {
  return { ...(r as GymSet), reps: n(r.reps), kg: n(r.kg), minutes: n(r.minutes), km: n(r.km) }
}

// ---------- Datos ----------
export function useGym() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [items, setItems] = useState<RoutineItem[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [sets, setSets] = useState<GymSet[]>([])
  const [body, setBody] = useState<Body[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const since = addDays(today(), -400)
    const [e, r, i, s, b] = await Promise.all([
      supabase.from('gym_exercises').select('id, name, muscle, kind, archived').order('name'),
      supabase.from('gym_routines').select('id, name, position, archived').order('position').order('created_at'),
      supabase.from('gym_routine_items').select('id, routine_id, exercise_id, position, target_sets, target_reps, target_kg, rest_seconds').order('position'),
      supabase.from('gym_sessions').select('id, routine_id, title, session_date, started_at, ended_at, notes').gte('session_date', since).order('started_at', { ascending: false }),
      supabase.from('gym_body').select('id, measured_on, weight_kg, body_fat_pct, waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm, notes').order('measured_on')
    ])
    const err = [e, r, i, s, b].find(x => x.error)?.error
    if (err) setError(err.message)
    const sess = (s.data ?? []) as Session[]
    let allSets: GymSet[] = []
    if (sess.length) {
      const ids = sess.map(x => x.id)
      // En bloques para no hacer URLs enormes
      for (let k = 0; k < ids.length; k += 150) {
        const { data } = await supabase.from('gym_sets')
          .select('id, session_id, exercise_id, position, set_no, reps, kg, minutes, km, rest_seconds, done')
          .in('session_id', ids.slice(k, k + 150)).order('position').order('set_no')
        allSets = allSets.concat(((data ?? []) as Record<string, unknown>[]).map(cleanSet))
      }
    }
    setExercises((e.data ?? []) as Exercise[])
    setRoutines((r.data ?? []) as Routine[])
    setItems(((i.data ?? []) as Record<string, unknown>[]).map(x => ({ ...(x as RoutineItem), target_kg: n(x.target_kg) })))
    setSessions(sess)
    setSets(allSets)
    setBody(((b.data ?? []) as Record<string, unknown>[]).map(x => ({
      ...(x as Body), weight_kg: n(x.weight_kg), body_fat_pct: n(x.body_fat_pct), waist_cm: n(x.waist_cm), chest_cm: n(x.chest_cm),
      hip_cm: n(x.hip_cm), arm_cm: n(x.arm_cm), thigh_cm: n(x.thigh_cm)
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function run<T>(p: PromiseLike<{ error: { message: string } | null; data?: T }>) {
    const { error, data } = await p
    if (error) { setError(error.message); return { error: error.message, data: undefined } }
    return { error: undefined, data }
  }

  const exerciseById = (id: string) => exercises.find(x => x.id === id)

  /** Series hechas de un ejercicio en el último entreno terminado donde aparece (para rellenar) */
  function lastSetsOf(exerciseId: string, exceptSession?: string) {
    const prev = sessions.filter(s => s.ended_at && s.id !== exceptSession)
      .find(s => sets.some(x => x.session_id === s.id && x.exercise_id === exerciseId && x.done))
    if (!prev) return { session: undefined, sets: [] as GymSet[] }
    return { session: prev, sets: sets.filter(x => x.session_id === prev.id && x.exercise_id === exerciseId && x.done).sort((a, b) => a.set_no - b.set_no) }
  }

  function prefillSets(exerciseId: string, position: number, item?: RoutineItem) {
    const ex = exerciseById(exerciseId)
    const last = lastSetsOf(exerciseId).sets
    const count = item?.target_sets ?? (last.length || (ex?.kind === 'cardio' ? 1 : 3))
    const targetReps = item?.target_reps ? parseInt(item.target_reps, 10) : NaN
    return Array.from({ length: count }, (_, k) => {
      const prev = last[k] ?? last[last.length - 1]
      return {
        exercise_id: exerciseId, position, set_no: k + 1,
        reps: ex?.kind === 'cardio' ? null : (prev?.reps ?? (Number.isFinite(targetReps) ? targetReps : null)),
        kg: ex?.kind === 'cardio' ? null : (prev?.kg ?? item?.target_kg ?? null),
        minutes: ex?.kind === 'cardio' ? (prev?.minutes ?? null) : null,
        km: ex?.kind === 'cardio' ? (prev?.km ?? null) : null,
        rest_seconds: item?.rest_seconds ?? 90
      }
    })
  }

  async function startSession(routine?: Routine) {
    const { data, error } = await supabase.from('gym_sessions')
      .insert({ routine_id: routine?.id ?? null, title: routine?.name ?? 'Entreno libre', session_date: today() })
      .select('id').single()
    if (error || !data) { setError(error?.message ?? 'No se pudo empezar'); return }
    if (routine) {
      const its = items.filter(i => i.routine_id === routine.id).sort((a, b) => a.position - b.position)
      const rows = its.flatMap((it, idx) => prefillSets(it.exercise_id, idx, it)).map(r => ({ ...r, session_id: data.id }))
      if (rows.length) await run(supabase.from('gym_sets').insert(rows))
    }
    await load()
    return data.id as string
  }

  async function addExercise(sessionId: string, exerciseId: string) {
    const pos = Math.max(-1, ...sets.filter(s => s.session_id === sessionId).map(s => s.position)) + 1
    const rows = prefillSets(exerciseId, pos).map(r => ({ ...r, session_id: sessionId }))
    await run(supabase.from('gym_sets').insert(rows))
    await load()
  }

  async function removeExercise(sessionId: string, exerciseId: string) {
    await run(supabase.from('gym_sets').delete().eq('session_id', sessionId).eq('exercise_id', exerciseId))
    await load()
  }

  async function addSet(sessionId: string, exerciseId: string) {
    const mine = sets.filter(s => s.session_id === sessionId && s.exercise_id === exerciseId).sort((a, b) => a.set_no - b.set_no)
    const last = mine[mine.length - 1]
    await run(supabase.from('gym_sets').insert({
      session_id: sessionId, exercise_id: exerciseId, position: last?.position ?? 0, set_no: (last?.set_no ?? 0) + 1,
      reps: last?.reps ?? null, kg: last?.kg ?? null, minutes: last?.minutes ?? null, km: last?.km ?? null, rest_seconds: last?.rest_seconds ?? 90
    }))
    await load()
  }

  async function updateSet(id: string, patch: Partial<Pick<GymSet, 'reps' | 'kg' | 'minutes' | 'km' | 'done'>>) {
    setSets(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
    const { error } = await supabase.from('gym_sets').update(patch).eq('id', id)
    if (error) { setError(error.message); await load() }
  }

  async function removeSet(id: string) {
    setSets(prev => prev.filter(s => s.id !== id))
    await run(supabase.from('gym_sets').delete().eq('id', id))
  }

  /** Récords batidos en una sesión: mejor peso levantado por ejercicio frente a todo lo anterior */
  function recordsOf(sessionId: string) {
    const sess = sessions.find(s => s.id === sessionId)
    if (!sess) return [] as { exercise: string; kg: number; reps: number }[]
    const before = new Set(sessions.filter(s => s.started_at < sess.started_at).map(s => s.id))
    const out: { exercise: string; kg: number; reps: number }[] = []
    const mine = sets.filter(s => s.session_id === sessionId && s.done && s.kg != null && s.kg > 0)
    for (const exId of [...new Set(mine.map(s => s.exercise_id))]) {
      const best = mine.filter(s => s.exercise_id === exId).sort((a, b) => Number(b.kg) - Number(a.kg))[0]
      const prevBest = Math.max(0, ...sets.filter(s => before.has(s.session_id) && s.exercise_id === exId && s.done && s.kg != null).map(s => Number(s.kg)))
      if (prevBest > 0 && Number(best.kg) > prevBest) out.push({ exercise: exerciseById(exId)?.name ?? '', kg: Number(best.kg), reps: Number(best.reps ?? 0) })
    }
    return out
  }

  async function finishSession(id: string, notes?: string) {
    await run(supabase.from('gym_sessions').update({ ended_at: new Date().toISOString(), notes: notes?.trim() || null }).eq('id', id))
    // Las series sin marcar no cuentan
    await run(supabase.from('gym_sets').delete().eq('session_id', id).eq('done', false))
    await load()
  }

  async function deleteSession(id: string) {
    await run(supabase.from('gym_sessions').delete().eq('id', id))
    await load()
  }

  async function seed() {
    await run(supabase.rpc('gym_seed'))
    await load()
  }

  async function saveExercise(data: Pick<Exercise, 'name' | 'muscle' | 'kind'> & { archived?: boolean }, id?: string) {
    const r = id ? await run(supabase.from('gym_exercises').update(data).eq('id', id)) : await run(supabase.from('gym_exercises').insert(data))
    await load()
    return r.error
  }

  async function saveRoutine(name: string, its: Omit<RoutineItem, 'id' | 'routine_id'>[], id?: string) {
    let routineId = id
    if (id) {
      const r = await run(supabase.from('gym_routines').update({ name }).eq('id', id))
      if (r.error) return r.error
      await run(supabase.from('gym_routine_items').delete().eq('routine_id', id))
    } else {
      const pos = Math.max(-1, ...routines.map(x => x.position)) + 1
      const { data, error } = await supabase.from('gym_routines').insert({ name, position: pos }).select('id').single()
      if (error || !data) { setError(error?.message ?? 'Error'); return error?.message }
      routineId = data.id
    }
    if (its.length) {
      const r = await run(supabase.from('gym_routine_items').insert(its.map((x, k) => ({ ...x, position: k, routine_id: routineId }))))
      if (r.error) return r.error
    }
    await load()
  }

  async function deleteRoutine(id: string) {
    await run(supabase.from('gym_routines').delete().eq('id', id))
    await load()
  }

  async function saveBody(data: Omit<Body, 'id'>, id?: string) {
    const r = id ? await run(supabase.from('gym_body').update(data).eq('id', id)) : await run(supabase.from('gym_body').insert(data))
    await load()
    return r.error
  }

  async function deleteBody(id: string) {
    await run(supabase.from('gym_body').delete().eq('id', id))
    await load()
  }

  return {
    exercises, routines, items, sessions, sets, body, loading, error, clearError: () => setError(''), reload: load,
    exerciseById, lastSetsOf, startSession, addExercise, removeExercise, addSet, updateSet, removeSet, finishSession, deleteSession,
    recordsOf, seed, saveExercise, saveRoutine, deleteRoutine, saveBody, deleteBody
  }
}
export type Gym = ReturnType<typeof useGym>

/** Resumen ligero para Hoy */
export async function gymSummary() {
  const { data } = await supabase.from('gym_sessions').select('id, title, session_date, started_at, ended_at').order('started_at', { ascending: false }).limit(1)
  const last = (data ?? [])[0] as Pick<Session, 'id' | 'title' | 'session_date' | 'started_at' | 'ended_at'> | undefined
  return { active: last && !last.ended_at ? last : null, last: last && last.ended_at ? last : null }
}
