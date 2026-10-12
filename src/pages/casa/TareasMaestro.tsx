import { useMemo, useState } from 'react'
import type { Member } from '../../lib/supabase'
import { addDays, today, WEEKDAY_SHORT } from '../../lib/dates'
import { occurrencesBetween, repeatLabel, useTasks, type Repeat, type Task } from '../../lib/home'
import type { IconCategories } from '../../lib/categories'
import { fold } from '../../data/places'
import { Card } from '../../components/ui'
import { ChipRow } from '../agenda/Maestro'
import { assigneeName } from '../Casa'

type Estado = 'activas' | 'pausadas' | 'todas'

/** Maestro de tareas: todas las tareas con filtros, agrupadas por categoría, con reparto y cumplimiento */
export default function TareasMaestro({ members, cats, who, cat, onOpen }: {
  members: Member[]; cats: IconCategories; who: string; cat: string; onOpen: (t: Task) => void
}) {
  const t = today()
  const monthAgo = addDays(t, -30)
  const { tasks, completions, loading } = useTasks(monthAgo, addDays(t, 6), true)
  const [freq, setFreq] = useState<'all' | Repeat>('all')
  const [estado, setEstado] = useState<Estado>('activas')
  const [day, setDay] = useState(0)
  const [q, setQ] = useState('')
  const adults = members.filter(m => m.kind === 'adult')

  const list = useMemo(() => tasks.filter(task => {
    if (estado === 'activas' && !task.active) return false
    if (estado === 'pausadas' && task.active) return false
    if (who !== 'all' && task.assignee_id !== who && task.assignee_id !== null) return false
    if (cat !== 'all' && (cat === 'none' ? !!task.category_id : task.category_id !== cat)) return false
    if (freq !== 'all' && task.repeat !== freq) return false
    if (day && !(task.repeat === 'daily' || (task.repeat === 'weekly' && task.weekdays.includes(day)))) return false
    if (q.trim() && !fold(task.title).includes(fold(q.trim()))) return false
    return true
  }), [tasks, estado, who, cat, freq, day, q])

  const groups = useMemo(() => {
    const out = cats.categories.map(c => ({ key: c.id, label: `${c.icon} ${c.name}`, items: list.filter(x => x.category_id === c.id) }))
    out.push({ key: 'none', label: 'Sin categoría', items: list.filter(x => !x.category_id || !cats.byId(x.category_id)) })
    return out.filter(g => g.items.length)
  }, [list, cats])

  // Reparto de los próximos 7 días y cumplimiento del último mes
  const stats = useMemo(() => {
    const next = occurrencesBetween(tasks, completions, t, addDays(t, 6))
    const past = occurrencesBetween(tasks, completions, monthAgo, addDays(t, -1))
    const people = [...adults.map(a => ({ id: a.id as string | null, name: a.display_name, color: a.color })), { id: null, name: 'Cualquiera', color: '#5B6662' }]
    return people.map(p => {
      const mine = past.filter(o => o.task.assignee_id === p.id)
      const done = mine.filter(o => o.done).length
      return { ...p, week: next.filter(o => o.task.assignee_id === p.id).length, done, total: mine.length }
    })
  }, [tasks, completions, t, monthAgo, adults])

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold text-[15px]">Reparto y cumplimiento</h2>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-[14px] items-center">
          <span className="text-[12px] text-muted font-semibold">Quién</span>
          <span className="text-[12px] text-muted font-semibold text-right">Próx. 7 días</span>
          <span className="text-[12px] text-muted font-semibold text-right">Hechas último mes</span>
          {stats.map(p => (
            <FragmentRow key={p.id ?? 'any'} name={p.name} color={p.color} week={p.week} done={p.done} total={p.total} />
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tarea…" aria-label="Buscar"
          className="w-full min-h-11 px-4 rounded-xl border border-line bg-card text-[16px]" />
        <ChipRow<'all' | Repeat> value={freq} onChange={setFreq}
          options={[['all', 'Cualquier frecuencia'], ['daily', 'Diarias'], ['weekly', 'Semanales'], ['monthly', 'Mensuales'], ['none', 'Una vez']]} />
        <ChipRow<Estado> value={estado} onChange={setEstado} options={[['activas', 'Activas'], ['pausadas', 'Pausadas'], ['todas', 'Todas']]} />
        <div className="flex gap-1">
          <button onClick={() => setDay(0)} aria-pressed={day === 0} className={`h-9 px-2.5 rounded-lg text-[12px] font-semibold ${day === 0 ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>Día</button>
          {WEEKDAY_SHORT.map((w, i) => (
            <button key={w} onClick={() => setDay(day === i + 1 ? 0 : i + 1)} aria-pressed={day === i + 1}
              className={`flex-1 h-9 rounded-lg text-[12px] font-bold ${day === i + 1 ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{w}</button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-sm text-muted">Cargando…</p> : groups.length === 0 ? (
        <Card><p className="text-sm text-muted">No hay tareas con estos filtros.</p></Card>
      ) : groups.map(g => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider px-1">{g.label} · {g.items.length}</h2>
          <Card className="py-1">
            <ul>
              {g.items.map((task, i) => {
                const a = members.find(m => m.id === task.assignee_id)
                return (
                  <li key={task.id} className={i < g.items.length - 1 ? 'border-b border-line' : ''}>
                    <button onClick={() => onOpen(task)} className="w-full text-left flex items-center gap-3 min-h-14 py-2">
                      <span className="flex-1 flex flex-col">
                        <span className={`text-[15px] font-semibold ${task.active ? '' : 'text-muted'}`}>{task.title}</span>
                        <span className="text-xs text-muted">{repeatLabel(task)}{task.active ? '' : ' · Pausada'}</span>
                      </span>
                      <span className="text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 bg-bg shrink-0">
                        {a && <span className="w-2 h-2 rounded-full" style={{ background: a.color }} aria-hidden="true" />}{assigneeName(task.assignee_id, members)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function FragmentRow({ name, color, week, done, total }: { name: string; color: string; week: number; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : null
  return (
    <>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color }} />{name}</span>
      <span className="text-right font-semibold">{week}</span>
      <span className="text-right">
        {pct == null ? <span className="text-muted">—</span> : <><b className={pct >= 80 ? 'text-accent' : pct < 50 ? 'text-danger' : ''}>{pct}%</b> <span className="text-muted text-[12px]">({done}/{total})</span></>}
      </span>
    </>
  )
}
