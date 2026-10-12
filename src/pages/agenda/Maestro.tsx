import { useMemo, useState, type ReactNode } from 'react'
import type { Member } from '../../lib/supabase'
import { hhmm, longDate, shortDate, today, weekdaysLabel, WEEKDAY_SHORT } from '../../lib/dates'
import { useEvents, type FamilyEvent } from '../../lib/kids'
import type { IconCategories } from '../../lib/categories'
import { fold } from '../../data/places'
import { Card } from '../../components/ui'
import { ConfirmDelete, Sheet } from '../../components/Sheet'

type Estado = 'activas' | 'pausadas' | 'terminadas' | 'todas'
type Tipo = 'fijas' | 'puntuales' | 'todas'

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
/** Duración en horas (si no hay hora de fin, cuenta 1 h) */
const hours = (e: FamilyEvent) => (e.end_time ? Math.max(0, minutes(e.end_time) - minutes(e.start_time)) / 60 : 1)
const ended = (e: FamilyEvent, t: string) => (e.repeat === 'weekly' ? !!e.until && e.until < t : e.start_date < t)
const fmtH = (h: number) => h.toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Maestro de actividades: todas las actividades con filtros, pausa, duplicar y resumen semanal */
export default function Maestro({ members, cats, person, cat, householdId, onEdit }: {
  members: Member[]; cats: IconCategories; person: string; cat: string; householdId: string; onEdit: (e: FamilyEvent) => void
}) {
  const ev = useEvents('2000-01-01', '2100-12-31')
  const [estado, setEstado] = useState<Estado>('activas')
  const [tipo, setTipo] = useState<Tipo>('fijas')
  const [day, setDay] = useState(0)
  const [driver, setDriver] = useState<string>('any')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<FamilyEvent | null>(null)
  const t = today()
  const adults = members.filter(m => m.kind === 'adult')
  const nameOf = (id: string | null) => (id ? members.find(m => m.id === id)?.display_name ?? '' : '')

  const list = useMemo(() => ev.events.filter(e => {
    if (tipo === 'fijas' && e.repeat !== 'weekly') return false
    if (tipo === 'puntuales' && e.repeat !== 'none') return false
    const isEnded = ended(e, t)
    if (estado === 'activas' && (e.paused || isEnded)) return false
    if (estado === 'pausadas' && !e.paused) return false
    if (estado === 'terminadas' && !isEnded) return false
    if (person !== 'all' && (person === 'family' ? e.child_id !== null : e.child_id !== person)) return false
    if (cat !== 'all' && e.category_id !== cat) return false
    if (day && !(e.repeat === 'weekly' ? e.weekdays.includes(day) : false)) return false
    if (driver === 'none' && (e.drop_off_id || e.pick_up_id)) return false
    if (driver !== 'any' && driver !== 'none' && e.drop_off_id !== driver && e.pick_up_id !== driver) return false
    if (q.trim() && !fold(`${e.title} ${e.location ?? ''} ${e.note ?? ''}`).includes(fold(q.trim()))) return false
    return true
  }), [ev.events, tipo, estado, person, cat, day, driver, q, t])

  // Agrupado por persona, en el orden de la familia
  const groups = useMemo(() => {
    const order = [...members.filter(m => m.kind === 'child'), ...adults]
    const out = order.map(m => ({ key: m.id, label: m.display_name, color: m.color, items: list.filter(e => e.child_id === m.id) }))
    out.push({ key: 'family', label: 'Familia', color: 'var(--app-accent)', items: list.filter(e => e.child_id === null) })
    return out.filter(g => g.items.length)
  }, [list, members, adults])

  // Resumen semanal de lo que está activo
  const summary = useMemo(() => {
    const activeWeekly = ev.events.filter(e => e.repeat === 'weekly' && !e.paused && !ended(e, t) && e.start_date <= t)
    const perPerson = [...members.filter(m => m.kind === 'child'), ...adults].map(m => ({
      m, h: activeWeekly.filter(e => e.child_id === m.id).reduce((s, e) => s + hours(e) * e.weekdays.length, 0)
    })).filter(x => x.h > 0)
    const trips = adults.map(a => ({
      a, n: activeWeekly.reduce((s, e) => s + e.weekdays.length * ((e.drop_off_id === a.id ? 1 : 0) + (e.pick_up_id === a.id ? 1 : 0)), 0)
    }))
    const unassigned = activeWeekly.reduce((s, e) => s + e.weekdays.length * ((e.drop_off_id ? 0 : 1) + (e.pick_up_id ? 0 : 1)), 0)
    return { perPerson, trips, unassigned }
  }, [ev.events, members, adults, t])

  return (
    <div className="flex flex-col gap-4">
      {(summary.perPerson.length > 0 || summary.trips.some(x => x.n > 0)) && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold text-[15px]">Cada semana</h2>
          {summary.perPerson.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {summary.perPerson.map(({ m, h }) => (
                <span key={m.id} className="text-[13px] px-2.5 py-1.5 rounded-lg bg-bg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />{m.display_name}: <b>{fmtH(h)} h</b>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">Trayectos (llevar o recoger)</span>
            <div className="flex gap-2 flex-wrap">
              {summary.trips.map(({ a, n }) => (
                <span key={a.id} className="text-[13px] px-2.5 py-1.5 rounded-lg bg-bg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />{a.display_name}: <b>{n}</b>
                </span>
              ))}
              {summary.unassigned > 0 && <span className="text-[13px] px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent">Sin asignar: <b>{summary.unassigned}</b></span>}
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar actividad, lugar…" aria-label="Buscar"
          className="w-full min-h-11 px-4 rounded-xl border border-line bg-card text-[16px]" />
        <ChipRow<Tipo> value={tipo} onChange={setTipo} options={[['fijas', 'Fijas (semanales)'], ['puntuales', 'Puntuales'], ['todas', 'Todas']]} />
        <ChipRow<Estado> value={estado} onChange={setEstado} options={[['activas', 'Activas'], ['pausadas', 'Pausadas'], ['terminadas', 'Terminadas'], ['todas', 'Todas']]} />
        {tipo !== 'puntuales' && (
          <div className="flex gap-1">
            <button onClick={() => setDay(0)} aria-pressed={day === 0} className={`h-9 px-2.5 rounded-lg text-[12px] font-semibold ${day === 0 ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>Día</button>
            {WEEKDAY_SHORT.map((w, i) => (
              <button key={w} onClick={() => setDay(day === i + 1 ? 0 : i + 1)} aria-pressed={day === i + 1}
                className={`flex-1 h-9 rounded-lg text-[12px] font-bold ${day === i + 1 ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{w}</button>
            ))}
          </div>
        )}
        <ChipRow<string> value={driver} onChange={setDriver}
          options={[['any', 'Lleva cualquiera'], ...adults.map(a => [a.id, `Lleva/recoge ${a.display_name}`] as [string, string]), ['none', 'Sin asignar']]} />
      </div>

      {ev.loading ? <p className="text-sm text-muted">Cargando…</p> : groups.length === 0 ? (
        <Card><p className="text-sm text-muted">No hay actividades con estos filtros.</p></Card>
      ) : groups.map(g => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="text-base font-bold flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />{g.label} <span className="text-sm text-muted font-normal">{g.items.length}</span></h2>
          <Card className="py-1">
            <ul>
              {g.items.slice().sort((a, b) => (a.weekdays[0] ?? 8) - (b.weekdays[0] ?? 8) || a.start_time.localeCompare(b.start_time)).map((e, i) => {
                const c = cats.byId(e.category_id)
                const isEnded = ended(e, t)
                return (
                  <li key={e.id} className={i < g.items.length - 1 ? 'border-b border-line' : ''}>
                    <button onClick={() => setOpen(e)} className="w-full text-left flex gap-3 py-3 items-start">
                      <span className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[18px]" style={{ background: `${c?.color ?? '#5B6662'}22` }} aria-hidden="true">{c?.icon ?? '📌'}</span>
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="flex justify-between gap-2">
                          <span className={`text-[15px] font-semibold ${e.paused || isEnded ? 'text-muted' : ''}`}>{e.title}</span>
                          {e.paused ? <Badge>Pausada</Badge> : isEnded ? <Badge>Terminada</Badge> : null}
                        </span>
                        <span className="text-[13px] text-muted">
                          {e.repeat === 'weekly' ? weekdaysLabel(e.weekdays) : shortDate(e.start_date)} · {hhmm(e.start_time)}{e.end_time ? `–${hhmm(e.end_time)}` : ''}
                          {e.location ? ` · ${e.location}` : ''}
                        </span>
                        {(e.drop_off_id || e.pick_up_id) && (
                          <span className="text-[12px] text-muted">
                            {e.drop_off_id && e.drop_off_id === e.pick_up_id ? `Lleva y recoge ${nameOf(e.drop_off_id)}` : [e.drop_off_id && `Lleva ${nameOf(e.drop_off_id)}`, e.pick_up_id && `recoge ${nameOf(e.pick_up_id)}`].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {e.repeat === 'weekly' && (e.until || e.start_date > t) && (
                          <span className="text-[12px] text-muted">{e.start_date > t ? `Empieza el ${shortDate(e.start_date)}` : ''}{e.until ? `${e.start_date > t ? ' · ' : ''}Hasta el ${shortDate(e.until)}` : ''}</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}

      {open && (
        <ActionsSheet e={open} members={members} onClose={() => setOpen(null)}
          hiddenDays={ev.exceptions.filter(x => x.event_id === open.id && x.hidden).map(x => ({ id: x.id, date: x.occurrence_date })).sort((a, b) => a.date.localeCompare(b.date))}
          onRestore={id => ev.clearException(id)}
          onEdit={() => { onEdit(open); setOpen(null) }}
          onPause={async () => { await ev.setPaused(open.id, !open.paused); setOpen(null) }}
          onEnd={async () => { await ev.endEventFrom(open, t); setOpen(null) }}
          onDelete={async () => { await ev.removeEvent(open.id); setOpen(null) }}
          onDuplicate={async (personId) => {
            const { id: _id, origin: _o, paused: _p, ...rest } = open
            void _id; void _o; void _p
            await ev.saveEvent(householdId, { ...rest, child_id: personId })
            setOpen(null)
          }} />
      )}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-bg text-muted shrink-0">{children}</span>
}

export function ChipRow<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-0.5" style={{ scrollbarWidth: 'none' }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`min-h-9 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 ${value === k ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{l}</button>
      ))}
    </div>
  )
}

function ActionsSheet({ e, members, hiddenDays, onRestore, onClose, onEdit, onPause, onEnd, onDelete, onDuplicate }: {
  e: FamilyEvent; members: Member[]; hiddenDays: { id: string; date: string }[]; onRestore: (id: string) => void; onClose: () => void; onEdit: () => void; onPause: () => void; onEnd: () => void
  onDelete: () => void; onDuplicate: (personId: string | null) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [dup, setDup] = useState(false)
  const t = today()
  const btn = 'py-3 rounded-xl border border-line bg-card font-semibold text-left px-4'
  return (
    <Sheet title={e.title} onClose={onClose}>
      <p className="text-sm text-muted -mt-3">{e.repeat === 'weekly' ? `Cada semana, ${weekdaysLabel(e.weekdays)}` : shortDate(e.start_date)} · {hhmm(e.start_time)}</p>
      {e.origin ? (
        <p className="text-sm">Es una visita de la mudanza: se gestiona en Casa → {e.origin === 'venta' ? 'Vendemos' : 'Buscamos'}.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <button onClick={onEdit} className={btn}>✏️ Editar</button>
          {e.repeat === 'weekly' && (
            <button onClick={onPause} className={btn}>{e.paused ? '▶️ Reanudar' : '⏸️ Pausar (vacaciones, lesión…)'}</button>
          )}
          <button onClick={() => setDup(d => !d)} className={btn} aria-expanded={dup}>📄 Duplicar para…</button>
          {dup && (
            <div className="flex gap-1.5 flex-wrap pl-2">
              {[...members.map(m => ({ id: m.id as string | null, label: m.display_name, color: m.color })), { id: null, label: 'Familia', color: '' }]
                .filter(o => o.id !== e.child_id)
                .map(o => (
                  <button key={o.id ?? 'family'} onClick={() => onDuplicate(o.id)} className="min-h-10 px-3 rounded-xl bg-card border border-line text-sm font-semibold flex items-center gap-1.5">
                    {o.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} />}{o.label}
                  </button>
                ))}
            </div>
          )}
          {e.repeat === 'weekly' && !(e.until && e.until < t) && e.start_date < t && (
            <button onClick={onEnd} className={btn}>🏁 Terminar desde hoy (se guarda el historial)</button>
          )}
          {hiddenDays.length > 0 && (
            <section className="flex flex-col gap-1 bg-card rounded-xl px-4 py-2">
              <h3 className="text-sm font-bold">Días quitados</h3>
              {hiddenDays.map(d => (
                <div key={d.id} className="flex justify-between items-center min-h-10">
                  <span className="text-sm">{longDate(d.date)}</span>
                  <button onClick={() => onRestore(d.id)} className="min-h-10 px-2 text-sm text-accent font-semibold">Recuperar</button>
                </div>
              ))}
            </section>
          )}
          <ConfirmDelete label="Eliminar por completo" confirming={confirming} setConfirming={setConfirming} onConfirm={onDelete} />
        </div>
      )}
    </Sheet>
  )
}
