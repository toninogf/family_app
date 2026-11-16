// «🗺️ Plan de la mudanza» (arriba de la pestaña Agenda): venta y compra en una sola línea de tiempo,
// en qué punto va cada una y los cruces que hay que vigilar. Las fechas se ponen en los pasos de Vendemos y Compramos.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Mudanza } from '../../lib/mudanza'
import type { Compra } from '../../lib/compra'
import { alerts, nextSteps, stages, timeline, type PlanInput, type Stage } from '../../lib/plan'
import { hhmm, longDate, relativeDay, today } from '../../lib/dates'

const TONE = { bad: 'border-[#C8452F] bg-[#C8452F]/10', warn: 'border-[#E0A21B] bg-[#E0A21B]/10', info: 'border-line bg-bg' } as const
const ICON = { bad: '⛔', warn: '⚠️', info: 'ℹ️' } as const

export function planInput(m: Mudanza, c: Compra): PlanInput {
  return {
    today: today(), listing: m.listing, buyerOffers: m.offers, saleSteps: m.saleSteps,
    purchase: c.purchase, purchaseSteps: c.steps, homeOffers: m.homeOffers, homes: m.homes
  }
}

function Track({ title, xs }: { title: string; xs: Stage[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-muted">{title}</span>
      <ol className="flex gap-1">
        {xs.map(s => (
          <li key={s.key} className="flex-1 min-w-0 flex flex-col gap-1" aria-current={s.current ? 'step' : undefined}>
            <span className={`h-1.5 rounded-full ${s.done ? 'bg-[#1F8A4C]' : s.current ? 'bg-accent' : 'bg-line'}`} />
            <span className={`text-[11px] leading-tight truncate ${s.current ? 'font-bold' : s.done ? '' : 'text-muted'}`}>{s.done ? '✓ ' : ''}{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function PlanCard({ m, c }: { m: Mudanza; c: Compra }) {
  const navigate = useNavigate()
  const p = planInput(m, c)
  const st = stages(p)
  const items = timeline(p)
  const warn = alerts(p)
  const next = nextSteps(p)
  const t = p.today
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('plan.open') !== '0' } catch { return true } })
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem('plan.open', v ? '1' : '0') } catch { /* nada */ } }
  const [past, setPast] = useState(false)
  const upcoming = items.filter(i => i.date >= t)
  const done = items.filter(i => i.date < t)
  const serious = warn.filter(w => w.tone !== 'info').length

  return (
    <section className="rounded-2xl bg-card p-4 flex flex-col gap-3">
      <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2 text-left">
        <span className="font-bold text-[15px] flex-1">🗺️ Plan de la mudanza</span>
        {serious > 0 && <span className="text-[12px] font-bold text-[#C8452F]">{serious} aviso{serious === 1 ? '' : 's'}</span>}
        <span className="text-muted" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <Track title="🏠 Venta de la nuestra" xs={st.venta} />
          <Track title="🔑 Compra de la nueva" xs={st.compra} />

          {warn.length > 0 && (
            <div className="flex flex-col gap-2">
              {warn.map((w, i) => (
                <p key={i} className={`rounded-xl border p-2.5 text-[13px] leading-snug ${TONE[w.tone]}`}>{ICON[w.tone]} {w.text}</p>
              ))}
            </div>
          )}

          {upcoming.length > 0 ? (
            <ol className="flex flex-col">
              {upcoming.map((it, i) => (
                <li key={i} className="flex gap-3 py-2 border-t border-line first:border-0">
                  <span className="w-20 shrink-0 text-[12px] text-muted leading-tight">{relativeDay(it.date)}{it.time ? <><br />{hhmm(it.time)}</> : null}</span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[14px]">{it.icon} {it.title} <span className={`text-[11px] font-semibold ${it.side === 'venta' ? 'text-[#1E6FB8]' : 'text-[#8A4FB8]'}`}>{it.side === 'venta' ? 'VENTA' : 'COMPRA'}</span></span>
                    <span className="text-[12px] text-muted">{longDate(it.date)}{it.detail ? ` · ${it.detail}` : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold">Lo siguiente</span>
              {next.map(n => <span key={n.side} className="text-[13px]">{n.side === 'venta' ? '🏠' : '🔑'} {n.text}</span>)}
              <span className="text-[12px] text-muted">Las fechas (reserva, arras, firma, FEIN…) se apuntan en los pasos de Vendemos y Compramos y salen aquí juntas.</span>
            </div>
          )}
          {done.length > 0 && (
            <button onClick={() => setPast(v => !v)} className="self-start text-[13px] text-muted min-h-9">{past ? 'Ocultar' : 'Ver'} lo ya pasado ({done.length})</button>
          )}
          {past && done.map((it, i) => (
            <span key={i} className="text-[13px] text-muted">{it.done ? '✓' : '·'} {longDate(it.date)} · {it.icon} {it.title}</span>
          ))}
          <div className="flex gap-2">
            <button onClick={() => navigate('/mudanza?vista=vendemos')} className="min-h-10 px-3 rounded-xl border border-line text-[13px] text-accent font-semibold">Pasos de la venta</button>
            <button onClick={() => navigate('/mudanza?vista=compramos')} className="min-h-10 px-3 rounded-xl border border-line text-[13px] text-accent font-semibold">Pasos de la compra</button>
          </div>
        </>
      )}
    </section>
  )
}
