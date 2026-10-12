import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../lib/household'
import type { Member } from '../lib/supabase'
import { addDays, hhmm, iso, isoWeekday, longDate, parseISO, relativeDay, shortDate, startOfWeek, today, weekdaysLabel, WEEKDAY_SHORT } from '../lib/dates'
import { agendaFor, isMapsUrl, mapsHref, useEvents, type Agenda, type EventInput, type FamilyEvent } from '../lib/kids'
import { Card } from '../components/ui'
import { Choice, ConfirmDelete, Fab, Sheet, TextField, WeekdayPicker } from '../components/Sheet'
import CalendarSheet from '../components/CalendarSheet'
import MenuCard from '../components/MenuCard'
import { useSchoolMenu } from '../lib/menu'
import { useIconCategories, type IconCategories } from '../lib/categories'
import IconCategoriesSheet from '../components/IconCategoriesSheet'
import Maestro, { ChipRow } from './agenda/Maestro'

type Mode = 'week' | 'month' | 'agenda' | 'menu' | 'master'
const MODE_KEY = 'ninos-vista'
const AGENDA_STEP = 30

function savedMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'week' || v === 'month' || v === 'agenda' || v === 'menu' || v === 'master') return v
  } catch { /* sin almacenamiento: usamos el valor por defecto */ }
  return 'agenda'
}

const firstOfMonth = (s: string) => s.slice(0, 8) + '01'
function addMonths(s: string, n: number) {
  const d = parseISO(firstOfMonth(s))
  d.setMonth(d.getMonth() + n)
  return iso(d)
}
function monthLabel(s: string) {
  const t = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(parseISO(s))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Semana del comedor: en fin de semana, la siguiente */
const menuWeek = () => startOfWeek(isoWeekday(today()) > 5 ? addDays(today(), 7) : today())

export default function Ninos() {
  const { me, members } = useHousehold()
  const navigate = useNavigate()
  const [mode, setModeState] = useState<Mode>(savedMode)
  const [weekStart, setWeekStart] = useState(() => (savedMode() === 'menu' ? menuWeek() : startOfWeek(today())))
  const [monthStart, setMonthStart] = useState(firstOfMonth(today()))
  const [agendaDays, setAgendaDays] = useState(AGENDA_STEP)
  const [selected, setSelected] = useState(today())
  const [person, setPerson] = useState<string>('all')
  const [cat, setCat] = useState<string>('all')
  const [catsOpen, setCatsOpen] = useState(false)
  const cats = useIconCategories('event_categories')
  const [eventSheet, setEventSheet] = useState<{ open: boolean; event?: FamilyEvent }>({ open: false })
  const [occSheet, setOccSheet] = useState<Agenda | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const kids = members.filter(m => m.kind === 'child')
  const adults = members.filter(m => m.kind === 'adult')

  const weekEnd = addDays(weekStart, 6)
  const gridStart = startOfWeek(monthStart)
  const agendaStart = today()
  const menu = useSchoolMenu(weekStart, addDays(weekStart, 4))
  const [from, to] = mode === 'week' || mode === 'menu' ? [weekStart, weekEnd]
    : mode === 'month' ? [gridStart, addDays(gridStart, 41)]
    : [agendaStart, addDays(agendaStart, agendaDays - 1)]
  const ev = useEvents(from, to)

  function setMode(m: Mode) {
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* no pasa nada */ }
    if (m === 'week') setWeekStart(startOfWeek(selected))
    if (m === 'menu') setWeekStart(mode === 'agenda' ? menuWeek() : startOfWeek(selected))
    if (m === 'month') setMonthStart(firstOfMonth(selected))
  }

  /** Las visitas de la mudanza se gestionan en Casa */
  const openOcc = (a: Agenda) => (a.event.origin ? navigate(`/casa?vista=${a.event.origin === 'venta' ? 'vendemos' : 'buscamos'}`) : setOccSheet(a))
  const filterChild = (a: Agenda) =>
    (person === 'all' || (person === 'family' ? a.event.child_id === null : a.event.child_id === person)) &&
    (cat === 'all' || a.event.category_id === cat)
  const itemsOn = (d: string) => agendaFor(ev.events, ev.exceptions, d).filter(filterChild)
  const dayAgenda = itemsOn(selected)

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])
  const agendaGroups = useMemo(() => {
    if (mode !== 'agenda') return []
    const out: { date: string; items: Agenda[] }[] = []
    for (let i = 0; i < agendaDays; i++) {
      const d = addDays(agendaStart, i)
      const items = agendaFor(ev.events, ev.exceptions, d).filter(filterChild)
      if (items.length) out.push({ date: d, items })
    }
    return out
  }, [mode, agendaDays, agendaStart, ev.events, ev.exceptions, person, cat])

  function moveWeek(n: number) {
    const ws = addDays(weekStart, 7 * n)
    setWeekStart(ws)
    setSelected(addDays(ws, isoWeekday(selected) - 1))
  }

  function moveMonth(n: number) {
    const ms = addMonths(monthStart, n)
    setMonthStart(ms)
    setSelected(firstOfMonth(today()) === ms ? today() : ms)
  }

  const errorCard = ev.error && (
    <Card className="flex justify-between items-center gap-3">
      <p role="alert" className="text-danger text-sm">No se pudo guardar: {ev.error}</p>
      <button onClick={ev.clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
    </Card>
  )

  const emptyHint = 'Añade las actividades de la semana (natación, música, inglés…) con quién lleva y quién recoge.'

  const selectedDayList = (
    <>
      <h2 className="text-base font-bold">{longDate(selected)}</h2>
      {ev.loading ? <p className="text-muted text-sm">Cargando…</p> : dayAgenda.length === 0 ? (
        <Card><p className="text-sm text-muted">{ev.events.length ? 'Nada este día.' : emptyHint}</p></Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayAgenda.map(a => <AgendaCard key={a.event.id} a={a} members={members} cats={cats} onOpen={() => openOcc(a)} />)}
        </div>
      )}
    </>
  )

  function dots(items: Agenda[], isSel: boolean) {
    const active = items.filter(a => !a.cancelled)
    return (
      <span className="flex gap-0.5 h-1.5">
        {active.slice(0, 4).map(a => (
          <span key={a.event.id} className="w-1.5 h-1.5 rounded-full" style={{ background: isSel ? 'currentColor' : colorOf(a.event, members) }} />
        ))}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <header className="flex justify-between items-center">
        <h1 className="text-[26px] font-bold tracking-tight">Agenda</h1>
        <button onClick={() => setCalendarOpen(true)} className="min-h-10 px-3 rounded-xl border border-line bg-card text-accent text-[13px] font-semibold flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          A mi calendario
        </button>
      </header>
      {calendarOpen && <CalendarSheet onClose={() => setCalendarOpen(false)} />}

      <div role="tablist" aria-label="Vista" className="grid grid-cols-5 p-1 rounded-xl bg-card border border-line">
        {([['agenda', 'Agenda'], ['week', 'Semana'], ['month', 'Mes'], ['menu', 'Comedor'], ['master', 'Maestro']] as const).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`min-h-10 rounded-lg text-[12.5px] font-semibold ${mode === m ? 'bg-accent text-white dark:text-bg' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode !== 'menu' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {[{ id: 'all', name: 'Todos', color: '' }, ...kids.map(k => ({ id: k.id, name: k.display_name, color: k.color })),
              ...adults.map(a => ({ id: a.id, name: a.display_name, color: a.color })), { id: 'family', name: 'Familia', color: 'var(--app-accent)' }].map(o => (
              <button key={o.id} onClick={() => setPerson(o.id)} aria-pressed={person === o.id}
                className={`min-h-9 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${person === o.id ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>
                {o.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} aria-hidden="true" />}{o.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="flex-1 min-w-0">
              <ChipRow<string> value={cat} onChange={setCat} options={[['all', 'Todas las categorías'], ...cats.active.map(c => [c.id, `${c.icon} ${c.name}`] as [string, string])]} />
            </div>
            <button onClick={() => setCatsOpen(true)} aria-label="Editar categorías" className="w-9 h-9 shrink-0 rounded-full bg-card border border-line text-muted">⚙︎</button>
          </div>
        </div>
      )}
      {catsOpen && <IconCategoriesSheet title="Categorías de la agenda" cats={cats} onClose={() => setCatsOpen(false)} />}

      {mode === 'master' && me && (
        <Maestro members={members} cats={cats} person={person} cat={cat} householdId={me.household_id}
          onEdit={e => setEventSheet({ open: true, event: e })} />
      )}

      {errorCard}

      {mode === 'menu' && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => moveWeek(-1)} aria-label="Semana anterior" className="w-11 h-11 rounded-full bg-card border border-line">‹</button>
            <button onClick={() => { setWeekStart(menuWeek()); setSelected(today()) }} className="font-semibold min-h-11 px-2">
              Comedor · {shortDate(weekStart)} – {shortDate(addDays(weekStart, 4))}
            </button>
            <button onClick={() => moveWeek(1)} aria-label="Semana siguiente" className="w-11 h-11 rounded-full bg-card border border-line">›</button>
          </div>
          {menu.loading ? <p className="text-muted text-sm">Cargando…</p> : (
            <div className="flex flex-col gap-5">
              {weekDays.slice(0, 5).map(d => {
                const rel = relativeDay(d)
                return (
                  <section key={d} className={`flex flex-col gap-2 ${d < today() ? 'opacity-60' : ''}`}>
                    <h2 className="text-base font-bold">
                      {rel === longDate(d) ? rel : <>{rel} <span className="font-normal text-muted text-sm">· {longDate(d)}</span></>}
                    </h2>
                    <MenuCard m={menu.byDay(d)} date={d} />
                  </section>
                )
              })}
              {menu.days.find(x => x.source_url) && (
                <a href={menu.days.find(x => x.source_url)!.source_url!} target="_blank" rel="noopener noreferrer" className="text-sm text-accent font-semibold min-h-11 flex items-center justify-center">
                  Ver el PDF del colegio
                </a>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'week' && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => moveWeek(-1)} aria-label="Semana anterior" className="w-11 h-11 rounded-full bg-card border border-line">‹</button>
            <button onClick={() => { setWeekStart(startOfWeek(today())); setSelected(today()) }} className="font-semibold min-h-11 px-2">
              {shortDate(weekStart)} – {shortDate(weekEnd)}
            </button>
            <button onClick={() => moveWeek(1)} aria-label="Semana siguiente" className="w-11 h-11 rounded-full bg-card border border-line">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d, i) => {
              const items = itemsOn(d)
              const isSel = d === selected
              const isToday = d === today()
              return (
                <button key={d} onClick={() => setSelected(d)} aria-pressed={isSel} aria-label={`${longDate(d)}, ${items.filter(a => !a.cancelled).length} actividades`}
                  className={`h-16 rounded-xl flex flex-col items-center justify-center gap-1 ${isSel ? 'bg-accent text-white dark:text-bg' : 'bg-card'} ${isToday && !isSel ? 'ring-2 ring-accent' : ''}`}>
                  <span className="text-[11px] opacity-80">{WEEKDAY_SHORT[i]}</span>
                  <span className="text-base font-bold">{parseISO(d).getDate()}</span>
                  {dots(items, isSel)}
                </button>
              )
            })}
          </div>
          {selectedDayList}
        </>
      )}

      {mode === 'month' && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="w-11 h-11 rounded-full bg-card border border-line">‹</button>
            <button onClick={() => { setMonthStart(firstOfMonth(today())); setSelected(today()) }} className="font-semibold min-h-11 px-2">
              {monthLabel(monthStart)}
            </button>
            <button onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="w-11 h-11 rounded-full bg-card border border-line">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_SHORT.map(w => <span key={w} className="text-center text-[11px] font-semibold text-muted pb-0.5">{w}</span>)}
            {monthDays.map(d => {
              const inMonth = d.slice(0, 7) === monthStart.slice(0, 7)
              const items = itemsOn(d)
              const isSel = d === selected
              const isToday = d === today()
              return (
                <button key={d} onClick={() => setSelected(d)} aria-pressed={isSel} aria-label={`${longDate(d)}, ${items.filter(a => !a.cancelled).length} actividades`}
                  className={`h-12 rounded-lg flex flex-col items-center justify-center gap-1 ${isSel ? 'bg-accent text-white dark:text-bg' : 'bg-card'} ${isToday && !isSel ? 'ring-2 ring-accent' : ''} ${inMonth ? '' : 'opacity-40'}`}>
                  <span className="text-[14px] font-semibold leading-none">{parseISO(d).getDate()}</span>
                  {dots(items, isSel)}
                </button>
              )
            })}
          </div>
          {selectedDayList}
        </>
      )}

      {mode === 'agenda' && (
        ev.loading ? <p className="text-muted text-sm">Cargando…</p> : (
          <div className="flex flex-col gap-5">
            {agendaGroups.length === 0 ? (
              <Card><p className="text-sm text-muted">{ev.events.length ? `Nada en los próximos ${agendaDays} días.` : emptyHint}</p></Card>
            ) : agendaGroups.map(g => {
              const rel = relativeDay(g.date)
              return (
                <section key={g.date} className="flex flex-col gap-2">
                  <h2 className="text-base font-bold">
                    {rel === longDate(g.date) ? rel : <>{rel} <span className="font-normal text-muted text-sm">· {longDate(g.date)}</span></>}
                  </h2>
                  {g.items.map(a => <AgendaCard key={a.event.id} a={a} members={members} cats={cats} onOpen={() => openOcc(a)} />)}
                </section>
              )
            })}
            <button onClick={() => setAgendaDays(n => n + AGENDA_STEP)} className="min-h-12 rounded-xl border border-line bg-card text-accent font-semibold">
              Ver más (hasta {shortDate(addDays(agendaStart, agendaDays + AGENDA_STEP - 1))})
            </button>
          </div>
        )
      )}

      {mode !== 'menu' && <Fab label="Actividad" onClick={() => setEventSheet({ open: true })} />}

      {occSheet && (
        <OccurrenceSheet
          a={occSheet}
          adults={adults}
          members={members}
          onClose={() => setOccSheet(null)}
          onSaveException={async input => { await ev.saveException(occSheet.event.id, occSheet.date, input); setOccSheet(null) }}
          onClearException={occSheet.exception ? async () => { await ev.clearException(occSheet.exception!.id); setOccSheet(null) } : undefined}
          onEdit={() => { setEventSheet({ open: true, event: occSheet.event }); setOccSheet(null) }}
          onEndFrom={async () => { await ev.endEventFrom(occSheet.event, occSheet.date); setOccSheet(null) }}
          onDelete={async () => { await ev.removeEvent(occSheet.event.id); setOccSheet(null) }}
        />
      )}

      {eventSheet.open && me && (
        <EventSheet
          event={eventSheet.event}
          kids={kids}
          adults={adults}
          cats={cats}
          defaultDate={mode === 'agenda' || mode === 'master' ? today() : selected}
          defaultChild={person === 'family' ? null : person !== 'all' ? person : kids[0]?.id ?? null}
          defaultCategory={cat !== 'all' ? cat : cats.active.find(c => c.key === 'otros')?.id ?? null}
          onClose={() => setEventSheet({ open: false })}
          onSave={async input => { const err = await ev.saveEvent(me.household_id, input, eventSheet.event?.id); if (!err) setEventSheet({ open: false }); return err?.message }}
        />
      )}
    </div>
  )
}

function colorOf(e: FamilyEvent, members: Member[]) {
  return members.find(m => m.id === e.child_id)?.color ?? 'var(--app-accent)'
}

function nameOf(id: string | null, members: Member[]) {
  return id ? members.find(m => m.id === id)?.display_name ?? '¿?' : null
}

export function AgendaCard({ a, members, cats, onOpen, compact }: { a: Agenda; members: Member[]; cats?: IconCategories; onOpen?: () => void; compact?: boolean }) {
  const icon = cats?.byId(a.event.category_id)?.icon
  const childName = a.event.origin === 'venta' ? 'Venta de casa' : a.event.origin === 'compra' ? 'Buscando casa' : nameOf(a.event.child_id, members) ?? 'Familia'
  const drop = nameOf(a.dropOff, members)
  const pick = nameOf(a.pickUp, members)
  const visitWho = a.event.origin === 'venta' ? (drop ? `Atiende: ${drop}` : 'Sin decidir quién atiende') : a.event.origin === 'compra' ? (drop ? `Va: ${drop}` : 'Vais los dos') : null
  const content = (
    <span className="flex gap-3 items-start w-full">
      <span className="w-1 self-stretch rounded-full" style={{ background: colorOf(a.event, members) }} aria-hidden="true" />
      <span className="flex-1 flex flex-col gap-1.5 min-w-0">
        <span className="flex justify-between items-baseline gap-2">
          <span className={`text-[16px] font-bold ${a.cancelled ? 'line-through text-muted' : ''}`}>{icon ? `${icon} ` : ''}{a.event.title}</span>
          <span className="text-sm font-semibold shrink-0">{hhmm(a.start)}{a.end ? `–${hhmm(a.end)}` : ''}</span>
        </span>
        <span className="text-[13px] text-muted">
          {childName}{a.event.location ? ` · ${a.event.location}` : ''}
          {a.cancelled ? ' · Cancelada este día' : a.changed ? ' · Cambiada este día' : ''}
        </span>
        {visitWho && !a.cancelled && (
          <span className="flex gap-1.5 flex-wrap">
            <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-accent-soft text-accent">🏠 {visitWho}</span>
          </span>
        )}
        {!visitWho && !a.cancelled && !compact && (drop || pick) && (
          <span className="flex gap-1.5 flex-wrap">
            {drop && pick && drop === pick
              ? <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-accent-soft text-accent">Lleva y recoge: {drop}</span>
              : <>
                  {drop && <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-accent-soft text-accent">Lleva: {drop}</span>}
                  {pick && <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-bg">Recoge: {pick}</span>}
                </>}
          </span>
        )}
        {!visitWho && compact && !a.cancelled && (drop || pick) && (
          <span className="text-xs text-muted">{drop && pick && drop === pick ? `Lleva y recoge ${drop}` : [drop && `Lleva ${drop}`, pick && `recoge ${pick}`].filter(Boolean).join(' · ')}</span>
        )}
        {a.note && !compact && <span className="text-xs text-muted">{a.note}</span>}
      </span>
    </span>
  )
  const maps = !a.cancelled ? mapsHref(a.event) : null
  const mapsLink = maps && (
    <a href={maps} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 min-h-11 px-4 border-t border-line text-accent text-[13px] font-semibold">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
      Cómo llegar{a.event.location ? ` · ${a.event.location}` : ''}
    </a>
  )
  return (
    <div className="bg-card rounded-2xl flex flex-col overflow-hidden">
      {onOpen
        ? <button onClick={onOpen} className="p-4 text-left">{content}</button>
        : <div className="p-4">{content}</div>}
      {mapsLink}
    </div>
  )
}

function OccurrenceSheet({ a, adults, members, onClose, onSaveException, onClearException, onEdit, onEndFrom, onDelete }: {
  a: Agenda; adults: Member[]; members: Member[]; onClose: () => void
  onSaveException: (input: { cancelled: boolean; hidden?: boolean; start_time: string | null; end_time: string | null; override_drivers: boolean; drop_off_id: string | null; pick_up_id: string | null; note: string | null }) => Promise<void>
  onClearException?: () => Promise<void>
  onEdit: () => void; onEndFrom: () => Promise<void>; onDelete: () => Promise<void>
}) {
  const [start, setStart] = useState(hhmm(a.start))
  const [end, setEnd] = useState(hhmm(a.end))
  const [drop, setDrop] = useState<string | null>(a.dropOff)
  const [pick, setPick] = useState<string | null>(a.pickUp)
  const [note, setNote] = useState(a.exception?.note ?? '')
  const [confirming, setConfirming] = useState(false)
  const weekly = a.event.repeat === 'weekly'

  const driverOptions = [{ value: null as string | null, label: 'Nadie' }, ...adults.map(x => ({ value: x.id as string | null, label: x.display_name, color: x.color }))]

  async function saveChanges(e: FormEvent) {
    e.preventDefault()
    const timeChanged = start !== hhmm(a.event.start_time) || end !== hhmm(a.event.end_time)
    await onSaveException({
      cancelled: false,
      start_time: timeChanged ? start : null,
      end_time: timeChanged ? (end || null) : null,
      override_drivers: drop !== a.event.drop_off_id || pick !== a.event.pick_up_id,
      drop_off_id: drop,
      pick_up_id: pick,
      note: note.trim() || null
    })
  }

  return (
    <Sheet title={`${a.event.title} · ${nameOf(a.event.child_id, members) ?? 'Familia'}`} onClose={onClose}>
      <p className="text-sm text-muted -mt-3">{longDate(a.date)}{weekly ? ` · se repite ${weekdaysLabel(a.event.weekdays)}` : ''}</p>

      {weekly && (
        a.cancelled ? (
          <div className="flex flex-col gap-2">
            <button onClick={onClearException} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold">Recuperar este día</button>
            <button onClick={() => onSaveException({ cancelled: true, hidden: true, start_time: null, end_time: null, override_drivers: false, drop_off_id: null, pick_up_id: null, note: null })}
              className="py-3 rounded-xl border border-line bg-card font-semibold">Quitarla del todo (que no salga tachada)</button>
          </div>
        ) : (
          <form onSubmit={saveChanges} className="flex flex-col gap-4 bg-card rounded-2xl p-4">
            <h3 className="font-bold text-[15px]">Solo este día</h3>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Empieza" type="time" value={start} onChange={e => setStart(e.target.value)} required />
              <TextField label="Termina" type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <Choice label="Lleva" value={drop} onChange={setDrop} options={driverOptions} />
            <Choice label="Recoge" value={pick} onChange={setPick} options={driverOptions} />
            <TextField label="Nota para este día" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Ej. llevar el chándal" />
            <button type="submit" className="py-3 rounded-xl bg-accent text-white dark:text-bg font-bold">Guardar cambios de este día</button>
            <div className="flex justify-between">
              <button type="button" onClick={() => onSaveException({ cancelled: true, start_time: null, end_time: null, override_drivers: false, drop_off_id: null, pick_up_id: null, note: null })}
                className="min-h-11 text-danger text-sm font-semibold">Cancelar este día</button>
              {onClearException && <button type="button" onClick={onClearException} className="min-h-11 text-sm text-muted">Deshacer cambios</button>}
            </div>
            <button type="button" onClick={() => onSaveException({ cancelled: true, hidden: true, start_time: null, end_time: null, override_drivers: false, drop_off_id: null, pick_up_id: null, note: null })}
              className="min-h-11 rounded-xl border border-line text-sm font-semibold">Quitar este día (no aparecerá en la agenda)</button>
            <p className="text-xs text-muted -mt-2">«Cancelar» la deja tachada para que sepáis que ese día no hay; «Quitar» la hace desaparecer. Los días quitados se recuperan desde Maestro.</p>
          </form>
        )
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-[15px]">{weekly ? 'Toda la actividad' : 'Actividad'}</h3>
        <button onClick={onEdit} className="py-3 rounded-xl border border-line bg-card font-semibold">Editar {weekly ? 'todas las semanas' : ''}</button>
        {weekly && a.date > a.event.start_date && (
          <button onClick={onEndFrom} className="py-3 rounded-xl border border-line bg-card font-semibold">Terminar a partir de este día</button>
        )}
        <ConfirmDelete label="Eliminar actividad por completo" onConfirm={onDelete} confirming={confirming} setConfirming={setConfirming} />
      </div>
    </Sheet>
  )
}

function EventSheet({ event, kids, adults, cats, defaultDate, defaultChild, defaultCategory, onClose, onSave }: {
  event?: FamilyEvent; kids: Member[]; adults: Member[]; cats: IconCategories; defaultDate: string; defaultChild: string | null; defaultCategory: string | null
  onClose: () => void; onSave: (input: EventInput) => Promise<string | undefined>
}) {
  const [childId, setChildId] = useState<string | null>(event ? event.child_id : defaultChild)
  const [title, setTitle] = useState(event?.title ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(event ? event.category_id : defaultCategory)
  const [location, setLocation] = useState(event?.location ?? '')
  const [mapsUrl, setMapsUrl] = useState(event?.maps_url ?? '')
  const [repeat, setRepeat] = useState<'weekly' | 'none'>(event?.repeat ?? 'weekly')
  const [weekdays, setWeekdays] = useState<number[]>(event?.weekdays?.length ? event.weekdays : [isoWeekday(defaultDate)])
  const [startDate, setStartDate] = useState(event?.start_date ?? defaultDate)
  const [until, setUntil] = useState(event?.until ?? '')
  const [start, setStart] = useState(hhmm(event?.start_time) || '17:00')
  const [end, setEnd] = useState(hhmm(event?.end_time) || '18:00')
  const [drop, setDrop] = useState<string | null>(event?.drop_off_id ?? null)
  const [pick, setPick] = useState<string | null>(event?.pick_up_id ?? null)
  const [note, setNote] = useState(event?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const driverOptions = [{ value: null as string | null, label: 'Sin asignar' }, ...adults.map(x => ({ value: x.id as string | null, label: x.display_name, color: x.color }))]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Escribe el nombre de la actividad'); return }
    if (repeat === 'weekly' && !weekdays.length) { setError('Elige al menos un día'); return }
    if (end && end <= start) { setError('La hora de fin debe ser posterior a la de inicio'); return }
    if (until && until < startDate) { setError('La fecha de fin debe ser posterior al inicio'); return }
    if (mapsUrl.trim() && !isMapsUrl(mapsUrl.trim())) { setError('El enlace debe ser de Google Maps (en Maps: Compartir → Copiar enlace)'); return }
    setBusy(true); setError('')
    const err = await onSave({
      child_id: childId, category_id: categoryId, title: title.trim(), location: location.trim() || null, maps_url: mapsUrl.trim() || null, start_time: start, end_time: end || null,
      repeat, weekdays, start_date: startDate, until: until || null, drop_off_id: drop, pick_up_id: pick, note: note.trim() || null
    })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet title={event ? 'Editar actividad' : 'Nueva actividad'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Choice label="¿De quién?" value={childId} onChange={setChildId}
          options={[...kids.map(k => ({ value: k.id as string | null, label: k.display_name, color: k.color })),
            ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color })), { value: null, label: 'Familia' }]} />
        <Choice<string | null> label="Categoría" value={categoryId} onChange={setCategoryId}
          options={cats.categories.filter(c => !c.archived || c.id === categoryId).map(c => ({ value: c.id as string | null, label: `${c.icon} ${c.name}` }))} />
        <TextField label="Actividad" autoFocus={!event} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Natación" />
        <TextField label="Lugar (opcional)" value={location} onChange={e => setLocation(e.target.value)} maxLength={80} placeholder="Ej. Polideportivo" />
        <div className="flex flex-col gap-1.5">
          <TextField label="Enlace de Google Maps (opcional)" type="url" inputMode="url" value={mapsUrl} onChange={e => setMapsUrl(e.target.value)} maxLength={500} placeholder="https://maps.app.goo.gl/…" />
          <p className="text-xs text-muted">En Google Maps, busca el sitio → Compartir → Copiar enlace, y pégalo aquí. Si lo dejas vacío, «Cómo llegar» buscará el lugar por su nombre.</p>
        </div>
        <Choice<'weekly' | 'none'> label="¿Se repite?" value={repeat} onChange={setRepeat}
          options={[{ value: 'weekly', label: 'Cada semana' }, { value: 'none', label: 'Solo un día' }]} />
        {repeat === 'weekly' && <WeekdayPicker value={weekdays} onChange={setWeekdays} />}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Empieza" type="time" value={start} onChange={e => setStart(e.target.value)} required />
          <TextField label="Termina" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label={repeat === 'weekly' ? 'Desde' : 'Fecha'} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          {repeat === 'weekly' && <TextField label="Hasta (opcional)" type="date" value={until} onChange={e => setUntil(e.target.value)} />}
        </div>
        <Choice label="¿Quién lleva?" value={drop} onChange={setDrop} options={driverOptions} />
        <Choice label="¿Quién recoge?" value={pick} onChange={setPick} options={driverOptions} />
        <TextField label="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Ej. llevar gorro y gafas" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : event ? 'Guardar cambios' : 'Añadir actividad'}
        </button>
      </form>
    </Sheet>
  )
}
