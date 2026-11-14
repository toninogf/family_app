// ⭐ Valoración de una casa por cada adulto (1–10, como la nota de la casa). Se usa en la pestaña Visitas y en la ficha (grupo Visitas)
import type { Member } from '../../lib/supabase'
import type { Home, Mudanza } from '../../lib/mudanza'

export type Rate = (homeId: string, memberId: string, score: number) => Promise<unknown>

export const rateHome = (m: Mudanza, householdId: string): Rate => (homeId, memberId, score) =>
  m.write('home_ratings', { home_id: homeId, member_id: memberId, household_id: householdId, score, updated_at: new Date().toISOString() }, undefined, 'home_id,member_id')

/** Mismos colores que la nota 0–10 */
const tone = (s: number) => (s >= 8 ? 'bg-[#1F8A4C]' : s >= 6 ? 'bg-[#7BAE3F]' : s >= 5 ? 'bg-[#E0A21B]' : 'bg-[#C8452F]')

export function Stars({ h, m, adults, rate }: { h: Home; m: Mudanza; adults: Member[]; rate: Rate }) {
  return (
    <div className="flex flex-col gap-1">
      {adults.map(a => {
        const cur = m.ratings.find(r => r.home_id === h.id && r.member_id === a.id)?.score ?? 0
        return (
          <div key={a.id} className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold" style={{ color: a.color }}>{a.display_name}{cur ? <span className="text-muted font-normal"> · {cur} de 10</span> : null}</span>
            <div className="grid grid-cols-10 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button key={n} onClick={() => void rate(h.id, a.id, n)} aria-label={`${a.display_name}: ${n} de 10`} aria-pressed={n === cur}
                  className={`h-9 rounded-lg text-[13px] font-bold ${n <= cur ? `${tone(cur)} text-white` : 'bg-bg text-muted'}`}>{n}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
