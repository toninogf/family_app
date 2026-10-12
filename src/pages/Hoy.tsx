import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '../lib/household'
import { countPending } from '../lib/shopping'
import { formatEur, moneySummary, partyName, todayISO, type Debt } from '../lib/money'
import { hhmm, isoWeekday, relativeDay, today } from '../lib/dates'
import { useSchoolMenu } from '../lib/menu'
import { mudanzaSummary } from '../lib/mudanza'
import MenuCard from '../components/MenuCard'
import { occurrencesBetween, useTasks } from '../lib/home'
import { agendaFor, useEvents } from '../lib/kids'
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
  const [shopping, setShopping] = useState<{ listName: string; count: number } | null>(null)
  const [mud, setMud] = useState<Awaited<ReturnType<typeof mudanzaSummary>> | null>(null)
  const [money, setMoney] = useState<{ debts: Debt[]; spentCents: number; budgetCents: number } | null>(null)
  const t = today()
  const ev = useEvents(t, t)
  const tk = useTasks(t, t)
  const menu = useSchoolMenu(t, t)
  const schoolDay = isoWeekday(t) <= 5

  useEffect(() => {
    countPending().then(setShopping)
    moneySummary(todayISO().slice(0, 7)).then(setMoney)
    mudanzaSummary(today()).then(setMud).catch(() => setMud(null))
  }, [])

  const mainDebt = money?.debts[0]
  const agenda = agendaFor(ev.events, ev.exceptions, t)
  const occ = useMemo(() => occurrencesBetween(tk.tasks, tk.completions, t, t, true), [tk.tasks, tk.completions, t])
  const overdue = occ.filter(o => o.date < t)
  const todays = occ.filter(o => o.date === t)

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

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold">Actividades de hoy</h2>
          <Link to="/ninos" className="text-sm font-semibold text-accent min-h-10 flex items-center">Semana</Link>
        </div>
        {ev.loading ? <p className="text-sm text-muted">Cargando…</p> : agenda.length === 0
          ? <Card><p className="text-sm text-muted">Hoy no hay actividades.</p></Card>
          : <div className="flex flex-col gap-2">{agenda.map(a => <AgendaCard key={a.event.id} a={a} members={members} compact />)}</div>}
      </section>

      {schoolDay && !menu.loading && (
        <section className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold">Comedor de hoy</h2>
            <Link to="/ninos" onClick={() => { try { localStorage.setItem('ninos-vista', 'menu') } catch { /* nada */ } }} className="text-sm font-semibold text-accent min-h-10 flex items-center">Semana</Link>
          </div>
          <MenuCard m={menu.byDay(t)} date={t} compact />
        </section>
      )}

      {!tk.loading && (overdue.length > 0 || todays.length > 0 || tk.tasks.length > 0) && (
        <>
          {overdue.length > 0 && <TaskGroup title="Tareas pendientes" items={overdue} members={members} me={me} onToggle={tk.toggle} showDate />}
          <TaskGroup title="Tareas de hoy" items={todays} members={members} me={me} onToggle={tk.toggle} empty="Nada para hoy." />
        </>
      )}

      {mud && (mud.nextSale || mud.nextHome || mud.openOffers > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Mudanza</h2>
          <div className="bg-card rounded-2xl flex flex-col">
            {mud.nextSale && (
              <Link to="/casa?vista=vendemos" className="p-4 flex flex-col gap-0.5 border-b border-line last:border-0">
                <span className="text-[13px] text-muted">Próxima visita de compradores</span>
                <span className="text-[15px] font-semibold">{relativeDay(mud.nextSale.visit_date)} · {hhmm(mud.nextSale.start_time)}{mud.nextSale.contact_name ? ` · ${mud.nextSale.contact_name}` : ''}</span>
              </Link>
            )}
            {mud.nextHome && (
              <Link to="/casa?vista=buscamos" className="p-4 flex flex-col gap-0.5 border-b border-line last:border-0">
                <span className="text-[13px] text-muted">Próxima visita a un piso</span>
                <span className="text-[15px] font-semibold">{relativeDay(mud.nextHome.visit_date)} · {hhmm(mud.nextHome.start_time)} · {mud.nextHome.title}</span>
              </Link>
            )}
            {mud.openOffers > 0 && (
              <Link to="/casa?vista=vendemos" className="p-4 flex flex-col gap-0.5">
                <span className="text-[13px] text-muted">{mud.openOffers === 1 ? 'Una oferta abierta' : `${mud.openOffers} ofertas abiertas`}</span>
                <span className={`text-[15px] font-semibold ${mud.nearestDeadline && mud.nearestDeadline <= today() ? 'text-danger' : ''}`}>
                  {mud.nearestDeadline ? `Plazo más cercano: ${relativeDay(mud.nearestDeadline).toLowerCase()}` : 'Sin plazo de respuesta'}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      <Link to="/compra" className="bg-card rounded-2xl p-4 flex justify-between items-center">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Compra{shopping ? ` · ${shopping.listName}` : ''}</span>
          <span className="text-[13px] text-muted">
            {shopping == null ? 'Cargando…' : shopping.count === 0 ? 'Nada pendiente' : `${shopping.count} ${shopping.count === 1 ? 'artículo pendiente' : 'artículos pendientes'}`}
          </span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
    </div>
  )
}
