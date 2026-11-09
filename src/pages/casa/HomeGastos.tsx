import { useState } from 'react'
import { parsePrice, price, priceInput, type Home, type Mudanza } from '../../lib/mudanza'
import { purchaseCosts } from '../../lib/gastos'
import { buyerFee, feeLabel } from '../../lib/reforma'

/** «🧾 Impuestos y gastos de la compra»: ITP, notaría, registro, gestoría, tasación y honorarios, calculado solo */
export function HomeGastos({ h, m }: { h: Home; m: Mudanza }) {
  const [open, setOpen] = useState(false)
  const [ref, setRef] = useState(priceInput(h.ref_value_cents))
  const [error, setError] = useState('')
  const t = purchaseCosts(h)
  if (!t) return null
  const fee = buyerFee(h)
  const total = t.mid + (fee ?? 0)

  async function saveRef() {
    const v = ref.trim() ? parsePrice(ref) : null
    if (ref.trim() && v == null) { setError('Importe no válido'); return }
    if (v === h.ref_value_cents) return
    const err = await m.write('homes', { ref_value_cents: v }, h.id)
    setError(err ?? '')
  }

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

          <label className="flex flex-col gap-1 mt-2">
            <span className="text-[13px] font-medium text-muted">Valor de referencia del Catastro (€)</span>
            <input inputMode="decimal" value={ref} onChange={e => setRef(e.target.value)} onBlur={saveRef} placeholder="Opcional"
              className="min-h-11 px-3 rounded-xl border border-line bg-bg text-[16px]" />
            <span className="text-[11px] text-muted">El ITP se paga sobre el mayor entre el precio y este valor. Lo consultas con la referencia catastral en la Sede del Catastro («Valor de referencia»).</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] min-h-10">
            <input type="checkbox" checked={h.new_build} onChange={e => void m.write('homes', { new_build: e.target.checked }, h.id)} className="w-5 h-5" />
            <span>Obra nueva (IVA 10 % + AJD en lugar de ITP)</span>
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <p className="text-[11px] text-muted">Orientativo para la Comunidad de Madrid (2026), sin familia numerosa. La notaría y el registro de la hipoteca los paga el banco. La plusvalía y el certificado energético son del vendedor.</p>
        </div>
      )}
    </section>
  )
}
