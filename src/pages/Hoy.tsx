import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '../lib/household'
import { pendingByList, type ListPending } from '../lib/shopping'
import { formatEur, moneySummary, partyName, todayISO, type Debt } from '../lib/money'
import { hhmm, isoWeekday, relativeDay, today } from '../lib/dates'
import { useSchoolMenu } from '../lib/menu'
import { mudanzaSummary } from '../lib/mudanza'
import { gymSummary } from '../lib/gym'
import { usePrefs, type SectionKey } from '../lib/prefs'
import MenuCard from '../components/MenuCard'
import { anytimeDueSoon, occurrencesBetween, useTasks } from '../lib/home'
import { agendaFor, useEvents } from '../lib/kids'
import { useIconCategories } from '../lib/categories'
import { Card } from '../components/ui'
import { TaskGroup } from './Casa'
import { AgendaCard } from './Ninos'

function todayLabel() {
  const s = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function greeting() {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

export default function Hoy() {
  const { members, me, loading, error } = useHousehold()
  const [shopping, setShopping] = useState<ListPending[] | null>(null)
  const { prefs } = usePrefs()
  const [gym, setGym] = useState<Awaited<ReturnType<typeof gymSummary>> | null>(null)
  const [mud, setMud] = useState<Awaited<ReturnType<typeof mudanzaSummary>> | null>(null)
  const [money, setMoney] = useState<{ debts: Debt[]; spentCents: number; budgetCents: number } | null>(null)
  const t = today()
  const ev = useEvents(t, t)
  const tk = useTasks(t, t)
  const menu = useSchoolMenu(t, t)
  const evCats = useIconCategories('event_categories')
  const schoolDay = isoWeekday(t) <= 5

  useEffect(() => {
    pendingByList().then(setShopping).catch(() => setShopping([]))
    moneySummary(todayISO().slice(0, 7)).then(setMoney)
    mudanzaSummary(today()).then(setMud).catch(() => setMud(null))
    gymSummary().then(setGym).catch(() => setGym(null))
  }, [])

  const mainDebt = money?.debts[0]
  const agenda = agendaFor(ev.events, ev.exceptions, t)
  const occ = useMemo(() => occurrencesBetween(tk.tasks, tk.completions, t, t, true), [tk.tasks, tk.completions, t])
  const overdue = occ.filter(o => o.date < t)
  const todays = occ.filter(o => o.date === t)
  const dueSoon = useMemo(() => anytimeDueSoon(tk.tasks, tk.completions, t), [tk.tasks, tk.completions, t])

  const sections: Record<SectionKey, ReactNode> = {
    saldo: (
    <>
      <Link to="/dinero" className="bg-accent text-white dark:text-bg rounded-2xl p-4 flex flex-col gap-1">
        <span className="text-[13px] opacity-85">{mainDebt ? 'Saldo pendiente' : 'Saldos'}</span>
        <span className="text-[19px] font-bold leading-snug">
          {money == null ? 'Cargando…' : mainDebt
            ? `${partyName(mainDebt.debtor, members, 'subject')} debe ${formatEur(mainDebt.cents)} a ${partyName(mainDebt.creditor, members).replace('Cuenta común', 'la cuenta común')}`
            : 'Todo en orden'}
        </span>
        {money && money.debts.length > 1 && <span className="text-[13px] opacity-85">y {money.debts.length - 1} saldo{money.debts.length > 2 ? 's' : ''} más</span>}
        {money && (
          <span className="text-[13px] opacity-85">
            Este mes: {formatEur(money.spentCents)}{money.budgetCents > 0 ? ` de ${formatEur(money.budgetCents)}` : ''}
          </span>
        )}
      </Link>
    </>
  ),
    agenda: (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold">Agenda de hoy</h2>
          <Link to="/agenda" className="text-sm font-semibold text-accent min-h-10 flex items-center">Semana</Link>
        </div>
        {ev.loading ? <p className="text-sm text-muted">Cargando…</p> : agenda.length === 0
          ? <Card><p className="text-sm text-muted">Hoy no hay actividades.</p></Card>
          : <div className="flex flex-col gap-2">{agenda.map(a => <AgendaCard key={a.event.id} a={a} members={members} cats={evCats} compact />)}</div>}
      </section>
    </>
  ),
    comedor: (
    <>
      {schoolDay && !menu.loading && (
        <section className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold">Comedor de hoy</h2>
            <Link to="/agenda" onClick={() => { try { localStorage.setItem('ninos-vista', 'menu') } catch { /* nada */ } }} className="text-sm font-semibold text-accent min-h-10 flex items-center">Semana</Link>
          </div>
          <MenuCard m={menu.byDay(t)} date={t} compact />
        </section>
      )}
    </>
  ),
    tareas: (
    <>
      {!tk.loading && (overdue.length > 0 || todays.length > 0 || tk.tasks.length > 0) && (
        <>
          {overdue.length > 0 && <TaskGroup title="Tareas pendientes" items={overdue} members={members} me={me} onToggle={tk.toggle} showDate />}
          <TaskGroup title="Tareas de hoy" items={todays} members={members} me={me} onToggle={tk.toggle} empty="Nada para hoy." />
          {dueSoon.length > 0 && <TaskGroup title="Sin fecha · vencen ya" items={dueSoon} members={members} me={me} onToggle={tk.toggle} />}
        </>
      )}
    </>
  ),
    mudanza: (
    <>
      {mud && (mud.nextSale || mud.nextHome || mud.openOffers > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Mudanza</h2>
          <div className="bg-card rounded-2xl flex flex-col">
            {mud.nextSale && (
              <Link to="/mudanza?vista=vendemos" className="p-4 flex flex-col gap-0.5 border-b border-line last:border-0">
                <span className="text-[13px] text-muted">Próxima visita de compradores</span>
                <span className="text-[15px] font-semibold">{relativeDay(mud.nextSale.visit_date)} · {hhmm(mud.nextSale.start_time)}{mud.nextSale.contact_name ? ` · ${mud.nextSale.contact_name}` : ''}</span>
              </Link>
            )}
            {mud.nextHome && (
              <Link to="/mudanza?vista=buscamos" className="p-4 flex flex-col gap-0.5 border-b border-line last:border-0">
                <span className="text-[13px] text-muted">Próxima visita a un piso</span>
                <span className="text-[15px] font-semibold">{relativeDay(mud.nextHome.visit_date)} · {hhmm(mud.nextHome.start_time)} · {mud.nextHome.title}</span>
              </Link>
            )}
            {mud.openOffers > 0 && (
              <Link to="/mudanza?vista=vendemos" className="p-4 flex flex-col gap-0.5">
                <span className="text-[13px] text-muted">{mud.openOffers === 1 ? 'Una oferta abierta' : `${mud.openOffers} ofertas abiertas`}</span>
                <span className={`text-[15px] font-semibold ${mud.nearestDeadline && mud.nearestDeadline <= today() ? 'text-danger' : ''}`}>
                  {mud.nearestDeadline ? `Plazo más cercano: ${relativeDay(mud.nearestDeadline).toLowerCase()}` : 'Sin plazo de respuesta'}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  ),
    compra: (
    <>
      {(() => {
        // Solo las listas elegidas en Personalizar (todas si no se ha elegido) y con algo pendiente
        const chosen = (shopping ?? []).filter(l => !prefs.home_lists || prefs.home_lists.includes(l.id))
        const pending = chosen.filter(l => l.count > 0)
        if (shopping == null || !pending.length) {
          return (
            <Link to="/compra" className="bg-card rounded-2xl p-4 flex justify-between items-center">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">🛒 Compra</span>
                <span className="text-[13px] text-muted">{shopping == null ? 'Cargando…' : 'Nada pendiente'}</span>
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          )
        }
        return (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-base font-bold">🛒 Compra</h2>
            <div className="bg-card rounded-2xl">
              {pending.map((l, i) => (
                <Link key={l.id} to={`/compra?lista=${l.id}`} className={`p-4 flex justify-between items-center gap-3 ${i < pending.length - 1 ? 'border-b border-line' : ''}`}>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[15px] font-semibold">{l.name} · {l.count}</span>
                    <span className="text-[13px] text-muted truncate">{l.names.slice(0, 4).join(', ')}{l.count > 4 ? '…' : ''}</span>
                  </span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </Link>
              ))}
            </div>
          </section>
        )
      })()}
    </>
  ),
    gym: (
    <>
      {gym && (gym.active || gym.last || prefs.gym_days.length > 0) && (
        <Link to="/gym" className="bg-card rounded-2xl p-4 flex justify-between items-center gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">
              {gym.active ? '🏋️ Entreno en marcha' : prefs.gym_days.includes(isoWeekday(t)) ? '💪 Hoy toca gimnasio' : '🏋️ Gimnasio'}
            </span>
            <span className="text-[13px] text-muted">
              {gym.active ? `${gym.active.title ?? 'Entreno'} · toca para seguir`
                : gym.last ? `Último: ${relativeDay(gym.last.session_date).toLowerCase()} · ${gym.last.title ?? 'Entreno'}` : 'Aún no has entrenado'}
            </span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      )}
    </>
  )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{todayLabel()}</p>
          <h1 className="text-[26px] font-bold tracking-tight">{greeting()}{me ? `, ${me.display_name}` : ''}</h1>
        </div>
        <Link to="/perfil" aria-label="Perfil" className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: me?.color ?? 'var(--app-accent)' }}>
          {me?.display_name.charAt(0) ?? '·'}
        </Link>
      </header>

      {error && <Card><p role="alert" className="text-danger text-sm">No se pudieron cargar los datos: {error}</p></Card>}

      {!loading && !me && !error && (
        <Card><p className="text-sm">Tu cuenta no está vinculada a ningún miembro del hogar.</p></Card>
      )}

      {prefs.home_sections.map(k => <Fragment key={k}>{sections[k]}</Fragment>)}
    </div>
  )
}
