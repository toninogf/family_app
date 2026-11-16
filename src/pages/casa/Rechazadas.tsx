// Propuestas rechazadas y el motivo de «No nos interesa»
import { useState } from 'react'

import { priceShort, type RejectReason, REJECT_REASONS, type Mudanza } from '../../lib/mudanza'
import { Sheet } from '../../components/Sheet'

/** ¿Por qué no nos interesa? (opcional: la búsqueda aprende del motivo) */
export function ReasonPicker({ onPick }: { onPick: (r: RejectReason | null) => void }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t border-line bg-bg rounded-b-2xl">
      <span className="text-[13px] text-muted">¿Por qué? (así la búsqueda aprende)</span>
      <span className="flex gap-1.5 flex-wrap">
        {(Object.keys(REJECT_REASONS) as RejectReason[]).map(r => (
          <button key={r} type="button" onClick={() => onPick(r)} className="min-h-10 px-3 rounded-full border border-line bg-card text-[13px] font-semibold">{REJECT_REASONS[r]}</button>
        ))}
        <button type="button" onClick={() => onPick(null)} className="min-h-10 px-3 rounded-full text-[13px] text-muted">Sin motivo</button>
      </span>
    </div>
  )
}

/** Propuestas rechazadas: para recuperar alguna si os equivocasteis */
export function RejectedSheet({ m, onClose }: { m: Mudanza; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const list = m.rejections.filter(r => !r.reproposed_at)
  return (
    <Sheet title={`Rechazadas (${list.length})`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">La búsqueda automática no las vuelve a proponer, salvo que bajen de precio un 5 % o más.</p>
        {list.length === 0 && <p className="text-sm text-muted">No hay ninguna.</p>}
        {list.map(r => (
          <div key={r.id} className="rounded-xl bg-card p-3 flex flex-col gap-1">
            <span className="text-[14px] font-semibold">{r.title ?? 'Sin título'}</span>
            <span className="text-[12px] text-muted">
              {[r.municipality, r.price_cents != null && priceShort(r.price_cents), r.size_m2 && `${Number(r.size_m2)} m²`, r.plot_m2 && `parcela ${Number(r.plot_m2)} m²`, r.reason && REJECT_REASONS[r.reason], new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
            </span>
            <span className="flex gap-1.5 flex-wrap mt-1">
              {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold flex items-center text-accent">🔗 Anuncio ↗</a>}
              <button type="button" disabled={busy === r.id} onClick={async () => { setBusy(r.id); await m.restoreRejection(r.id); setBusy(null) }}
                className="min-h-9 px-2.5 rounded-lg border border-line text-[12px] font-semibold disabled:opacity-50">↩️ Volver a proponer</button>
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
