import { useEffect, useMemo, useState } from 'react'
import { isoWeekday, longDate, relativeDay, shortDate, today } from '../../lib/dates'
import { MUSCLES, fmtKg, fmtNum, minutesBetween, parseNum, volumeOf, type Exercise, type GymSet, type Gym, type Muscle, type Session } from '../../lib/gym'
import { fold } from '../../data/places'
import { Card } from '../../components/ui'
import { ConfirmDelete, Sheet, TextArea } from '../../components/Sheet'

export default function Entrenar({ g, gymDays }: { g: Gym; gymDays: number[] }) {
  const [viewing, setViewing] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ session: Session; records: { exercise: string; kg: number; reps: number }[] } | null>(null)
  const active = g.sessions.find(s => !s.ended_at)
  const shown = active ?? g.sessions.find(s => s.id === viewing)
  const routines = g.routines.filter(r => !r.archived)
  const todayIsGymDay = gymDays.includes(isoWeekday(today()))
  const finished = g.sessions.filter(s => s.ended_at)

  if (shown) {
    return <SessionView key={shown.id} g={g} s={shown} live={!shown.ended_at}
      onClose={() => setViewing(null)}
      onFinished={() => { const rec = g.recordsOf(shown.id); setSummary({ session: shown, records: rec }) }} />
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && <SummarySheet g={g} s={summary.session} records={summary.records} onClose={() => setSummary(null)} />}

      {g.exercises.length === 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm">Aún no tienes ejercicios.</p>
          <button onClick={g.seed} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg font-semibold">Cargar la lista inicial (29 ejercicios)</button>
        </Card>
      )}

      {todayIsGymDay && <p className="text-sm font-semibold text-accent">💪 Hoy te toca gimnasio</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Empezar entreno</h2>
        {routines.map(r => {
          const its = g.items.filter(i => i.routine_id === r.id)
          const last = finished.find(s => s.routine_id === r.id)
          return (
            <button key={r.id} onClick={() => g.startSession(r)} className="bg-card rounded-2xl p-4 text-left flex justify-between items-center gap-3">
              <span className="flex flex-col">
                <span className="text-[16px] font-bold">{r.name}</span>
                <span className="text-[13px] text-muted">{its.length} ejercicio{its.length === 1 ? '' : 's'}{last ? ` · última vez ${relativeDay(last.session_date).toLowerCase()}` : ''}</span>
              </span>
              <span className="min-h-10 px-4 rounded-xl bg-accent text-white dark:text-bg font-semibold flex items-center shrink-0">Empezar</span>
            </button>
          )
        })}
        <button onClick={() => g.startSession()} className="min-h-12 rounded-xl border border-line bg-card font-semibold">+ Entreno libre</button>
        {routines.length === 0 && <p className="text-xs text-muted">Crea tus rutinas (ej. «Día A: pecho y tríceps») en la pestaña Rutinas y al empezar se rellenan solas con lo que hiciste la última vez.</p>}
      </section>

      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Historial</h2>
          <Card className="py-1">
            <ul>
              {finished.slice(0, 30).map((s, i) => {
                const ss = g.sets.filter(x => x.session_id === s.id)
                const vol = volumeOf(ss)
                return (
                  <li key={s.id} className={i < Math.min(finished.length, 30) - 1 ? 'border-b border-line' : ''}>
                    <button onClick={() => setViewing(s.id)} className="w-full text-left py-3 flex justify-between gap-3">
                      <span className="flex flex-col">
                        <span className="text-[15px] font-semibold">{s.title ?? 'Entreno'}</span>
                        <span className="text-xs text-muted">{longDate(s.session_date)} · {minutesBetween(s.started_at, s.ended_at)} min</span>
                      </span>
                      <span className="text-xs text-muted text-right shrink-0">
                        {ss.length} series{vol ? <><br />{fmtNum(vol / 1000, 1)} t</> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  )
}

function SessionView({ g, s, live, onClose, onFinished }: { g: Gym; s: Session; live: boolean; onClose: () => void; onFinished: () => void }) {
  const [now, setNow] = useState(Date.now())
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null)
  const [picker, setPicker] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [notes, setNotes] = useState(s.notes ?? '')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Aviso al terminar el descanso
  useEffect(() => {
    if (rest && now >= rest.until) {
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* sin vibración */ }
      setRest(null)
    }
  }, [now, rest])

  const sets = g.sets.filter(x => x.session_id === s.id)
  const groups = useMemo(() => {
    const ids: string[] = []
    for (const x of [...sets].sort((a, b) => a.position - b.position || a.set_no - b.set_no)) if (!ids.includes(x.exercise_id)) ids.push(x.exercise_id)
    return ids.map(id => ({ ex: g.exerciseById(id), sets: sets.filter(x => x.exercise_id === id).sort((a, b) => a.set_no - b.set_no) }))
  }, [sets, g])
  const doneCount = sets.filter(x => x.done).length
  const mins = Math.floor((now - new Date(s.started_at).getTime()) / 60000)

  async function toggleDone(x: GymSet) {
    await g.updateSet(x.id, { done: !x.done })
    if (!x.done && live && x.rest_seconds > 0 && g.exerciseById(x.exercise_id)?.kind !== 'cardio') {
      setRest({ until: Date.now() + x.rest_seconds * 1000, total: x.rest_seconds })
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col">
          <h2 className="text-[20px] font-bold">{s.title ?? 'Entreno'}</h2>
          <span className="text-sm text-muted">
            {live ? `En marcha · ${mins} min · ${doneCount}/${sets.length} series` : `${longDate(s.session_date)} · ${minutesBetween(s.started_at, s.ended_at)} min`}
          </span>
        </div>
        {!live && <button onClick={onClose} className="min-h-10 px-3 rounded-xl border border-line bg-card text-sm font-semibold">Volver</button>}
      </div>

      {groups.map(({ ex, sets: xs }) => ex && (
        <ExerciseBlock key={ex.id} ex={ex} sets={xs} g={g} sessionId={s.id} onToggle={toggleDone} />
      ))}

      <button onClick={() => setPicker(true)} className="min-h-12 rounded-xl border border-dashed border-line text-accent font-semibold">+ Añadir ejercicio</button>

      {live ? (
        <button onClick={() => setFinishing(true)} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Terminar entreno</button>
      ) : (
        <ConfirmDelete label="Eliminar este entreno" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await g.deleteSession(s.id); onClose() }} />
      )}
      {live && (
        <ConfirmDelete label="Descartar entreno" confirming={confirming} setConfirming={setConfirming} onConfirm={() => g.deleteSession(s.id)} />
      )}

      {rest && (
        <div className="fixed left-0 right-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+72px)] z-20 px-4">
          <div className="max-w-xl mx-auto bg-ink text-bg rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <span className="text-[13px] opacity-80">Descanso</span>
            <span className="text-[22px] font-bold tabular-nums flex-1">
              {Math.floor(Math.max(0, rest.until - now) / 60000)}:{String(Math.floor((Math.max(0, rest.until - now) % 60000) / 1000)).padStart(2, '0')}
            </span>
            <button onClick={() => setRest(r => (r ? { ...r, until: r.until + 30000 } : r))} className="min-h-10 px-3 rounded-lg bg-bg/15 font-semibold text-sm">+30 s</button>
            <button onClick={() => setRest(null)} className="min-h-10 px-3 rounded-lg bg-bg/15 font-semibold text-sm">Saltar</button>
          </div>
        </div>
      )}

      {picker && <ExercisePicker exercises={g.exercises.filter(e => !e.archived && !groups.some(gr => gr.ex?.id === e.id))}
        onPick={async e => { setPicker(false); await g.addExercise(s.id, e.id) }} onClose={() => setPicker(false)} />}

      {finishing && (
        <Sheet title="Terminar entreno" onClose={() => setFinishing(false)}>
          <p className="text-sm text-muted -mt-3">{doneCount} series hechas en {mins} min. Las series sin marcar no se guardan.</p>
          <TextArea label="Notas (opcional)" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Cómo te has sentido, molestias, qué subir la próxima vez…" />
          <button onClick={async () => { setFinishing(false); await g.finishSession(s.id, notes); onFinished() }}
            className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar y terminar</button>
        </Sheet>
      )}
    </div>
  )
}

function ExerciseBlock({ ex, sets, g, sessionId, onToggle }: { ex: Exercise; sets: GymSet[]; g: Gym; sessionId: string; onToggle: (x: GymSet) => void }) {
  const last = g.lastSetsOf(ex.id, sessionId)
  const cardio = ex.kind === 'cardio'
  const lastText = last.sets.length
    ? cardio
      ? `${fmtNum(last.sets[0].minutes)} min${last.sets[0].km ? ` · ${fmtNum(last.sets[0].km, 2)} km` : ''}`
      : last.sets.map(x => `${x.reps ?? '?'}×${fmtNum(x.kg, 2)}`).join(' · ')
    : null
  const [confirming, setConfirming] = useState(false)

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col">
          <span className="text-[16px] font-bold">{ex.name}</span>
          {lastText && last.session && <span className="text-xs text-muted">Última vez ({shortDate(last.session.session_date)}): {lastText}</span>}
        </div>
        <span className="text-[11px] text-muted shrink-0">{MUSCLES[ex.muscle]}</span>
      </div>
      <div className={`grid ${cardio ? 'grid-cols-[28px_1fr_1fr_48px_32px]' : 'grid-cols-[28px_1fr_1fr_48px_32px]'} gap-1.5 items-center text-[11px] text-muted font-semibold`}>
        <span>#</span><span>{cardio ? 'Minutos' : 'Reps'}</span><span>{cardio ? 'Km' : 'Kg'}</span><span className="text-center">Hecha</span><span />
      </div>
      {sets.map(x => <SetRow key={x.id} x={x} cardio={cardio} g={g} onToggle={() => onToggle(x)} />)}
      <div className="flex justify-between">
        <button onClick={() => g.addSet(sessionId, ex.id)} className="min-h-10 px-1 text-sm font-semibold text-accent">+ Serie</button>
        <ConfirmDelete label="Quitar ejercicio" confirming={confirming} setConfirming={setConfirming} onConfirm={() => g.removeExercise(sessionId, ex.id)} />
      </div>
    </Card>
  )
}

function SetRow({ x, cardio, g, onToggle }: { x: GymSet; cardio: boolean; g: Gym; onToggle: () => void }) {
  const [a, setA] = useState(String((cardio ? x.minutes : x.reps) ?? '').replace('.', ','))
  const [b, setB] = useState(String((cardio ? x.km : x.kg) ?? '').replace('.', ','))

  function commit() {
    const va = parseNum(a), vb = parseNum(b)
    if (Number.isNaN(va) || Number.isNaN(vb)) return
    const patch = cardio ? { minutes: va, km: vb } : { reps: va == null ? null : Math.round(va), kg: vb }
    const cur = cardio ? { minutes: x.minutes, km: x.km } : { reps: x.reps, kg: x.kg }
    if (JSON.stringify(patch) !== JSON.stringify(cur)) g.updateSet(x.id, patch)
  }

  const input = 'w-full min-h-11 px-2 rounded-lg border border-line bg-bg text-[16px] text-center tabular-nums'
  return (
    <div className={`grid grid-cols-[28px_1fr_1fr_48px_32px] gap-1.5 items-center ${x.done ? 'opacity-70' : ''}`}>
      <span className="text-sm font-semibold text-muted">{x.set_no}</span>
      <input value={a} onChange={e => setA(e.target.value)} onBlur={commit} inputMode={cardio ? 'decimal' : 'numeric'} aria-label={cardio ? 'Minutos' : 'Repeticiones'} className={input} />
      <input value={b} onChange={e => setB(e.target.value)} onBlur={commit} inputMode="decimal" aria-label={cardio ? 'Kilómetros' : 'Kilos'} className={input} />
      <button onClick={() => { commit(); onToggle() }} aria-pressed={x.done} aria-label={x.done ? 'Desmarcar serie' : 'Marcar serie hecha'}
        className={`h-11 rounded-lg font-bold text-lg ${x.done ? 'bg-accent text-white dark:text-bg' : 'bg-bg border border-line text-muted'}`}>✓</button>
      <button onClick={() => g.removeSet(x.id)} aria-label="Borrar serie" className="h-11 text-muted text-lg">×</button>
    </div>
  )
}

export function ExercisePicker({ exercises, onPick, onClose }: { exercises: Exercise[]; onPick: (e: Exercise) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const list = exercises.filter(e => (muscle === 'all' || e.muscle === muscle) && (!q.trim() || fold(e.name).includes(fold(q.trim()))))
  return (
    <Sheet title="Añadir ejercicio" onClose={onClose}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar ejercicio" autoFocus
        className="w-full min-h-11 px-4 rounded-xl border border-line bg-card text-[16px]" />
      <div className="flex gap-1.5 flex-wrap">
        {(['all', ...Object.keys(MUSCLES)] as (Muscle | 'all')[]).map(m => (
          <button key={m} onClick={() => setMuscle(m)} aria-pressed={muscle === m}
            className={`min-h-9 px-3 rounded-full text-[13px] font-semibold ${muscle === m ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{m === 'all' ? 'Todos' : MUSCLES[m]}</button>
        ))}
      </div>
      <ul className="flex flex-col bg-card rounded-2xl px-4">
        {list.map((e, i) => (
          <li key={e.id} className={i < list.length - 1 ? 'border-b border-line' : ''}>
            <button onClick={() => onPick(e)} className="w-full text-left min-h-12 flex justify-between items-center">
              <span className="text-[15px]">{e.name}</span><span className="text-xs text-muted">{MUSCLES[e.muscle]}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-muted">Nada. Puedes crear ejercicios en Rutinas → Ejercicios.</li>}
      </ul>
    </Sheet>
  )
}

function SummarySheet({ g, s, records, onClose }: { g: Gym; s: Session; records: { exercise: string; kg: number; reps: number }[]; onClose: () => void }) {
  const fresh = g.sessions.find(x => x.id === s.id) ?? s
  const sets = g.sets.filter(x => x.session_id === s.id)
  return (
    <Sheet title="¡Entreno guardado!" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-card rounded-xl p-3"><b className="text-[20px]">{minutesBetween(fresh.started_at, fresh.ended_at)}</b><br /><span className="text-xs text-muted">minutos</span></div>
        <div className="bg-card rounded-xl p-3"><b className="text-[20px]">{sets.length}</b><br /><span className="text-xs text-muted">series</span></div>
        <div className="bg-card rounded-xl p-3"><b className="text-[20px]">{fmtNum(volumeOf(sets) / 1000, 1)}</b><br /><span className="text-xs text-muted">toneladas</span></div>
      </div>
      {records.length > 0 && (
        <div className="flex flex-col gap-1 bg-accent-soft rounded-2xl p-4">
          <h3 className="font-bold text-accent">🏆 Nuevos récords</h3>
          {records.map(r => <p key={r.exercise} className="text-sm">{r.exercise}: <b>{fmtKg(r.kg)}</b> × {r.reps}</p>)}
        </div>
      )}
      <button onClick={onClose} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Hecho</button>
    </Sheet>
  )
}
