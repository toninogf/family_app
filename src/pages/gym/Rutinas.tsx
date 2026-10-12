import { useState, type FormEvent } from 'react'
import { MUSCLES, parseNum, type Exercise, type Gym, type Muscle, type Routine, type RoutineItem } from '../../lib/gym'
import { usePrefs } from '../../lib/prefs'
import { hhmm, weekdaysLabel } from '../../lib/dates'
import { Card } from '../../components/ui'
import { Choice, ConfirmDelete, Sheet, TextField, WeekdayPicker } from '../../components/Sheet'
import { ExercisePicker } from './Entrenar'

type Draft = Omit<RoutineItem, 'id' | 'routine_id'>

export default function Rutinas({ g }: { g: Gym }) {
  const [edit, setEdit] = useState<{ open: boolean; routine?: Routine }>({ open: false })
  const [exOpen, setExOpen] = useState(false)
  const routines = g.routines.filter(r => !r.archived)

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold">Mis rutinas</h2>
          <button onClick={() => setEdit({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Rutina</button>
        </div>
        {routines.length === 0 ? <Card><p className="text-sm text-muted">Crea una rutina por día de entreno, por ejemplo «Día A: pecho y tríceps», con sus ejercicios, series y repeticiones.</p></Card>
          : routines.map(r => {
            const its = g.items.filter(i => i.routine_id === r.id)
            return (
              <button key={r.id} onClick={() => setEdit({ open: true, routine: r })} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1">
                <span className="text-[16px] font-bold">{r.name}</span>
                <span className="text-[13px] text-muted">{its.map(i => g.exerciseById(i.exercise_id)?.name).filter(Boolean).join(' · ') || 'Sin ejercicios'}</span>
              </button>
            )
          })}
      </section>

      <button onClick={() => setExOpen(true)} className="min-h-12 rounded-xl border border-line bg-card font-semibold">Mis ejercicios ({g.exercises.filter(e => !e.archived).length})</button>

      <ShareCard />

      {edit.open && <RoutineSheet g={g} routine={edit.routine} onClose={() => setEdit({ open: false })} />}
      {exOpen && <ExercisesSheet g={g} onClose={() => setExOpen(false)} />}
    </div>
  )
}

function RoutineSheet({ g, routine, onClose }: { g: Gym; routine?: Routine; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [items, setItems] = useState<Draft[]>(() => g.items.filter(i => i.routine_id === routine?.id).sort((a, b) => a.position - b.position)
    .map(({ exercise_id, position, target_sets, target_reps, target_kg, rest_seconds }) => ({ exercise_id, position, target_sets, target_reps, target_kg, rest_seconds })))
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const patch = (k: number, p: Partial<Draft>) => setItems(xs => xs.map((x, i) => (i === k ? { ...x, ...p } : x)))
  const move = (k: number, d: -1 | 1) => setItems(xs => {
    const j = k + d
    if (j < 0 || j >= xs.length) return xs
    const out = xs.slice(); [out[k], out[j]] = [out[j], out[k]]; return out
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Ponle nombre a la rutina'); return }
    const err = await g.saveRoutine(name.trim(), items, routine?.id)
    if (err) setError('Revisa series, kilos y descanso'); else onClose()
  }

  return (
    <Sheet title={routine ? 'Editar rutina' : 'Nueva rutina'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Nombre" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Ej. Día A: pecho y tríceps" autoFocus={!routine} />
        {items.map((it, k) => {
          const ex = g.exerciseById(it.exercise_id)
          const cardio = ex?.kind === 'cardio'
          return (
            <div key={`${it.exercise_id}-${k}`} className="bg-card rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="flex-1 text-[15px] font-bold">{k + 1}. {ex?.name}</span>
                <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label="Subir" className="w-9 h-10 text-muted disabled:opacity-30">↑</button>
                <button type="button" onClick={() => move(k, 1)} disabled={k === items.length - 1} aria-label="Bajar" className="w-9 h-10 text-muted disabled:opacity-30">↓</button>
                <button type="button" onClick={() => setItems(xs => xs.filter((_, i) => i !== k))} aria-label="Quitar" className="w-9 h-10 text-muted text-xl">×</button>
              </div>
              {!cardio && (
                <div className="grid grid-cols-4 gap-2">
                  <Mini label="Series" value={String(it.target_sets)} onChange={v => { const x = parseInt(v, 10); patch(k, { target_sets: Number.isFinite(x) ? Math.min(20, Math.max(1, x)) : 1 }) }} />
                  <Mini label="Reps" value={it.target_reps ?? ''} onChange={v => patch(k, { target_reps: v.slice(0, 10) || null })} placeholder="8-10" text />
                  <Mini label="Kg" value={it.target_kg != null ? String(it.target_kg).replace('.', ',') : ''} onChange={v => { const x = parseNum(v); patch(k, { target_kg: x == null || Number.isNaN(x) ? null : x }) }} />
                  <Mini label="Desc. (s)" value={String(it.rest_seconds)} onChange={v => { const x = parseInt(v, 10); patch(k, { rest_seconds: Number.isFinite(x) ? Math.min(900, Math.max(0, x)) : 0 }) }} />
                </div>
              )}
              {cardio && <p className="text-xs text-muted">Cardio: al entrenar apuntas minutos y kilómetros.</p>}
            </div>
          )
        })}
        <button type="button" onClick={() => setPicker(true)} className="min-h-12 rounded-xl border border-dashed border-line text-accent font-semibold">+ Añadir ejercicio</button>
        <p className="text-xs text-muted -mt-2">Los kilos son orientativos: al entrenar se rellena con lo que hiciste la última vez.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Guardar rutina</button>
        {routine && <ConfirmDelete label="Eliminar rutina (el historial se conserva)" confirming={confirming} setConfirming={setConfirming}
          onConfirm={async () => { await g.deleteRoutine(routine.id); onClose() }} />}
      </form>
      {picker && <ExercisePicker exercises={g.exercises.filter(e => !e.archived)} onClose={() => setPicker(false)}
        onPick={e => { setItems(xs => [...xs, { exercise_id: e.id, position: xs.length, target_sets: e.kind === 'cardio' ? 1 : 3, target_reps: e.kind === 'cardio' ? null : '10', target_kg: null, rest_seconds: e.kind === 'cardio' ? 0 : 90 }]); setPicker(false) }} />}
    </Sheet>
  )
}

function Mini({ label, value, onChange, placeholder, text }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; text?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted font-semibold">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={text ? 'text' : 'decimal'}
        className="w-full min-h-10 px-2 rounded-lg border border-line bg-bg text-[16px] text-center" />
    </label>
  )
}

function ExercisesSheet({ g, onClose }: { g: Gym; onClose: () => void }) {
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const list = g.exercises.filter(e => showHidden || !e.archived)
  const groups = (Object.keys(MUSCLES) as Muscle[]).map(m => ({ m, items: list.filter(e => e.muscle === m) })).filter(x => x.items.length)

  if (editing) return <ExerciseEdit g={g} ex={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />

  return (
    <Sheet title="Mis ejercicios" onClose={onClose}>
      <button onClick={() => setEditing('new')} className="min-h-12 rounded-xl bg-accent text-white dark:text-bg font-semibold">+ Nuevo ejercicio</button>
      {g.exercises.length === 0 && <button onClick={g.seed} className="min-h-11 rounded-xl border border-line bg-card font-semibold">Cargar la lista inicial</button>}
      {groups.map(gr => (
        <section key={gr.m} className="flex flex-col gap-1">
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{MUSCLES[gr.m]}</h3>
          <ul className="bg-card rounded-2xl px-4">
            {gr.items.map((e, i) => (
              <li key={e.id} className={i < gr.items.length - 1 ? 'border-b border-line' : ''}>
                <button onClick={() => setEditing(e)} className={`w-full text-left min-h-11 text-[15px] ${e.archived ? 'text-muted' : ''}`}>{e.name}{e.archived ? ' (oculto)' : ''}</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {g.exercises.some(e => e.archived) && (
        <button onClick={() => setShowHidden(s => !s)} className="min-h-10 text-sm text-muted self-start">{showHidden ? 'Ocultar los ocultos' : 'Ver ocultos'}</button>
      )}
    </Sheet>
  )
}

function ExerciseEdit({ g, ex, onClose }: { g: Gym; ex?: Exercise; onClose: () => void }) {
  const [name, setName] = useState(ex?.name ?? '')
  const [muscle, setMuscle] = useState<Muscle>(ex?.muscle ?? 'pecho')
  const [kind, setKind] = useState<'strength' | 'cardio'>(ex?.kind ?? 'strength')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Escribe el nombre'); return }
    const err = await g.saveExercise({ name: name.trim(), muscle, kind }, ex?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={ex ? 'Editar ejercicio' : 'Nuevo ejercicio'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Nombre" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus={!ex} placeholder="Ej. Press Arnold" />
        <Choice<Muscle> label="Grupo muscular" value={muscle} onChange={m => { setMuscle(m); if (m === 'cardio') setKind('cardio') }}
          options={(Object.keys(MUSCLES) as Muscle[]).map(m => ({ value: m, label: MUSCLES[m] }))} />
        <Choice<'strength' | 'cardio'> label="Cómo se apunta" value={kind} onChange={setKind}
          options={[{ value: 'strength', label: 'Series × reps × kg' }, { value: 'cardio', label: 'Minutos y km' }]} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Guardar</button>
        {ex && (
          <button type="button" onClick={async () => { await g.saveExercise({ name: ex.name, muscle: ex.muscle, kind: ex.kind, archived: !ex.archived }, ex.id); onClose() }}
            className="min-h-11 text-sm text-muted">{ex.archived ? 'Volver a mostrar' : 'Ocultar (se conserva el historial)'}</button>
        )}
      </form>
    </Sheet>
  )
}

/** Compartir en la Agenda familiar solo «Gimnasio» (sin detalles). Apagado por defecto. */
function ShareCard() {
  const { prefs, save } = usePrefs()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<number[]>(prefs.gym_days)
  const [start, setStart] = useState(hhmm(prefs.gym_start) || '19:00')
  const [end, setEnd] = useState(hhmm(prefs.gym_end) || '20:30')
  const [share, setShare] = useState(prefs.gym_share)
  const [msg, setMsg] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (share && !days.length) { setMsg('Elige qué días vas'); return }
    if (end && end <= start) { setMsg('La hora de fin debe ser posterior'); return }
    const err = await save({ gym_share: share, gym_days: days, gym_start: start, gym_end: end || null })
    setMsg(err ? 'No se pudo guardar' : 'Guardado')
  }

  return (
    <Card className="flex flex-col gap-3">
      <button onClick={() => {
        if (!open) { setDays(prefs.gym_days); setStart(hhmm(prefs.gym_start) || '19:00'); setEnd(hhmm(prefs.gym_end) || '20:30'); setShare(prefs.gym_share); setMsg('') }
        setOpen(o => !o)
      }} aria-expanded={open} className="flex justify-between items-center text-left">
        <span className="flex flex-col">
          <span className="font-bold text-[15px]">Mis días de gimnasio</span>
          <span className="text-xs text-muted">
            {prefs.gym_days.length ? `${weekdaysLabel(prefs.gym_days)} · ${hhmm(prefs.gym_start)}` : 'Sin configurar'} · {prefs.gym_share ? 'Se ve en la Agenda familiar' : 'No se comparte'}
          </span>
        </span>
        <span className="text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <WeekdayPicker value={days} onChange={setDays} label="Qué días vas" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Desde" type="time" value={start} onChange={e => setStart(e.target.value)} />
            <TextField label="Hasta" type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[var(--app-accent)]" />
            <span className="text-[15px]">Mostrar «Gimnasio» en la Agenda familiar
              <span className="block text-xs text-muted">Solo el bloque de horario, sin ningún detalle de tus entrenos. Así se sabe que esas tardes no puedes llevar o recoger.</span>
            </span>
          </label>
          <button type="submit" className="py-3 rounded-xl bg-accent text-white dark:text-bg font-bold">Guardar</button>
          {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
        </form>
      )}
    </Card>
  )
}
