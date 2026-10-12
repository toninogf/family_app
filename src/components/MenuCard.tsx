import type { ReactNode } from 'react'
import { dinnerFor, monthName, nutrients, type MenuDay } from '../lib/menu'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-3">
    <span className="w-[68px] shrink-0 text-[12px] font-semibold text-muted pt-0.5">{label}</span>
    <span className="text-[15px] leading-snug">{children}</span>
  </div>
)

/** Menú del comedor de un día, con la sugerencia de cena del colegio */
export default function MenuCard({ m, date, compact }: { m: MenuDay | undefined; date: string; compact?: boolean }) {
  if (!m) {
    return (
      <div className="bg-card rounded-2xl p-4">
        <p className="text-sm text-muted">Menú de {monthName(date)} pendiente. Pásale el PDF del colegio a Claude para cargarlo.</p>
      </div>
    )
  }
  if (m.holiday) {
    return (
      <div className="bg-card rounded-2xl p-4">
        <p className="text-sm text-muted">{m.note ?? 'Sin comedor este día.'}</p>
      </div>
    )
  }
  const tip = dinnerFor(m)
  const nut = nutrients(m)
  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-2.5">
      {m.first_course && <Row label="Primero">{m.first_course}</Row>}
      {m.second_course && <Row label="Segundo">{m.second_course}{m.side ? <span className="text-muted"> · {m.side}</span> : null}</Row>}
      {m.dessert && <Row label="Postre">{m.dessert}{!compact && m.bread ? <span className="text-muted"> · {m.bread}</span> : null}</Row>}

      {tip && (
        <div className="mt-1 rounded-xl bg-accent-soft px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[12px] font-bold text-accent">Para cenar</span>
          <span className="text-[14px] leading-snug">
            {[tip.first && `de primero ${tip.first}`, tip.second && `de segundo ${tip.second}`, `y de postre ${tip.dessert}`].filter(Boolean).join(', ').replace(/^d/, 'D')}
          </span>
        </div>
      )}

      {!compact && (nut || m.note) && (
        <details className="text-[13px] text-muted">
          <summary className="min-h-9 flex items-center cursor-pointer select-none">Valores nutricionales</summary>
          <p>{nut ?? 'No disponibles.'}</p>
          {m.note && <p className="mt-1">{m.note}</p>}
        </details>
      )}
    </div>
  )
}
