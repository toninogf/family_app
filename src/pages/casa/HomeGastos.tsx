import { useState } from 'react'
import { price, type Home } from '../../lib/mudanza'
import { purchaseCosts } from '../../lib/gastos'
import { buyerFee, feeLabel } from '../../lib/reforma'

/**
 * «🧾 Impuestos y gastos de la compra»: ITP, notaría, registro, gestoría, tasación y honorarios, calculado solo.
 * Solo consulta: el valor de referencia y «obra nueva» se cambian en Editar → El dinero.
 */
export function HomeGastos({ h, onEdit }: { h: Home; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const t = purchaseCosts(h)
  if (!t) return null
  const fee = buyerFee(h)
  const total = t.mid + (fee ?? 0)

  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex justify-between items-center gap-2 text-left">
        <span className="font-bold text-[15px]">🧾 Impuestos y gastos</span>
        <span className="text-[14px] font-semibold">~{price(total)} <span className="text-muted">{open ? '▾' : '▸'}</span></span>
      </button>
      {!open && <span className="text-[12px] text-muted -mt-1">ITP 6 %, notaría, registro, gestoría y tasación{fee ? ', honorarios' : ''}. No los financia el banco.</span>}
      {open && (
        <div className="flex flex-col gap-1.5">
          {t.lines.map(l => (
            <div key={l.k} className="flex flex-col">
              <span className="flex justify-between gap-2 text-[13px]">
                <span className={l.zero ? 'text-muted' : ''}>{l.label}</span>
                <span className={`shrink-0 ${l.zero ? 'text-muted' : 'font-semibold'}`}>{l.zero ? '0 €' : l.lo === l.hi ? price(l.lo) : `${price(l.lo)}–${price(l.hi)}`}</span>
              </span>
              {l.note && <span className="text-[11px] text-muted">{l.note}</span>}
            </div>
          ))}
          {h.advertiser !== 'particular' && (
            <span className="flex justify-between gap-2 text-[13px]">
              <span>Honorarios inmobiliaria{h.buyer_fee_kind ? ` (${feeLabel(h)})` : ''}</span>
              <span className={`shrink-0 font-semibold ${h.buyer_fee_kind ? '' : 'text-[#C77A12]'}`}>{fee == null ? 'sin preguntar' : price(fee)}</span>
            </span>
          )}
          <span className="flex justify-between gap-2 text-[15px] font-bold border-t border-line pt-1.5"><span>Total estimado</span><span>{price(total)}</span></span>

          <button onClick={onEdit} className="flex justify-between items-center gap-2 text-left text-[13px] rounded-xl bg-bg px-3 py-2 mt-1">
            <span className="flex flex-col">
              <span>Valor de referencia del Catastro: <b>{h.ref_value_cents != null ? price(h.ref_value_cents) : 'sin poner'}</b></span>
              <span className="text-muted">{h.new_build ? 'Obra nueva (IVA 10 % + AJD)' : 'Segunda mano (ITP 6 %)'}</span>
            </span>
            <span aria-hidden="true">✏️</span>
          </button>
          <p className="text-[11px] text-muted">Orientativo para la Comunidad de Madrid (2026), sin familia numerosa. La notaría y el registro de la hipoteca los paga el banco. La plusvalía y el certificado energético son del vendedor.</p>
        </div>
      )}
    </section>
  )
}
