// ⭐ Valoración de una casa por cada adulto (1–5). Se usa en la pestaña Visitas y en la ficha (grupo Visitas)
import type { Member } from '../../lib/supabase'
import type { Home, Mudanza } from '../../lib/mudanza'

export type Rate = (homeId: string, memberId: string, score: number) => Promise<unknown>

export const rateHome = (m: Mudanza, householdId: string): Rate => (homeId, memberId, score) =>
  m.write('home_ratings', { home_id: homeId, member_id: memberId, household_id: householdId, score, updated_at: new Date().toISOString() }, undefined, 'home_id,member_id')

export function Stars({ h, m, adults, rate }: { h: Home; m: Mudanza; adults: Member[]; rate: Rate }) {
  return (
    <div className="flex flex-col gap-1">
      {adults.map(a => {
        const cur = m.ratings.find(r => r.home_id === h.id && r.member_id === a.id)?.score ?? 0
        return (
          <div key={a.id} className="flex items-center gap-1">
            <span className="text-[12px] w-16 truncate" style={{ color: a.color }}>{a.display_name}</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => void rate(h.id, a.id, n)} aria-label={`${a.display_name}: ${n} de 5`}
                className={`w-9 h-9 text-[20px] leading-none ${n <= cur ? '' : 'opacity-25 grayscale'}`}>⭐</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
