import { useState } from 'react'
import { price, type Home, type Mudanza } from '../../lib/mudanza'
import { comparables, recommend, zoneLine } from '../../lib/pricing'

/** «Precio recomendado»: oferta inicial y tope razonable, con el porqué, la zona y los pisos parecidos */
export function HomePrice({ h, m, compact }: { h: Home; m: Mudanza; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const r = recommend(h, m.homes)
  if (!r) return null
  const zone = zoneLine(h)
  const comps = comparables(h, m.homes)
  const conf = r.confidence === 'alta' ? 'text-accent' : r.confidence === 'media' ? 'text-[#C77A12]' : 'text-danger'

  if (compact) {
    return (
      <span className="text-[13px] opacity-90">
        💡 Oferta inicial ~{price(r.open)} · tope ~{price(r.max)} <span className="opacity-75">(fiabilidad {r.confidence})</span>
      </span>
    )
  }

  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex justify-between items-baseline gap-2">
        <span className="font-bold text-[15px]">💡 Precio recomendado</span>
        <span className={`text-[12px] font-semibold ${conf}`}>Fiabilidad {r.confidence}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-bg p-2 flex flex-col">
          <span className="text-[11px] text-muted">Oferta inicial</span>
          <span className="text-[16px] font-bold text-accent">{price(r.open)}</span>
        </div>
        <div className="rounded-xl bg-bg p-2 flex flex-col">
          <span className="text-[11px] text-muted">Tope razonable</span>
          <span className="text-[16px] font-bold">{price(r.max)}</span>
        </div>
        <div className="rounded-xl bg-bg p-2 flex flex-col">
          <span className="text-[11px] text-muted">Piden</span>
          <span className="text-[16px] font-bold">{price(r.asking)}</span>
        </div>
      </div>
      {r.reform + r.fee > 0 && (
        <p className="text-[13px] rounded-xl bg-bg px-3 py-2 flex justify-between gap-2">
          <span className="text-muted">Para entrar a vivir: {price(r.asking)}{r.reform ? ` + reforma ~${price(r.reform)}` : ''}{r.fee ? ` + honorarios ${price(r.fee)}` : ''}</span>
          <b className="shrink-0">{price(r.asking + r.reform + r.fee)}</b>
        </p>
      )}
      {r.fair != null && <p className="text-[13px]">Valor de referencia estimado: <b>{price(r.fair)}</b>{r.reform > 0 && r.fairReady != null ? <span className="text-muted"> (reformado ~{price(r.fairReady)})</span> : null}</p>}
      {zone && <p className="text-[13px] text-muted">📍 {zone}</p>}
      {r.warnings.map((w, i) => <p key={i} className="text-[13px] text-danger">⚠️ {w}</p>)}
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="self-start min-h-10 text-sm font-semibold text-accent">{open ? 'Ocultar el porqué' : '¿Por qué este precio?'}</button>
      {open && (
        <div className="flex flex-col gap-2">
          <ul className="text-[13px] flex flex-col gap-1 list-disc pl-5">
            {r.reasons.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
          {comps.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-muted">Parecidos que habéis guardado en {h.municipality} (€/m² para entrar a vivir)</span>
              {comps.slice(0, 5).map(c => (
                <span key={c.home.id} className="text-[13px] flex justify-between gap-2">
                  <span className="truncate">{c.home.title}</span>
                  <span className="shrink-0 text-muted">{Math.round(c.m2Price).toLocaleString('es-ES')} €/m²{c.home.plot_m2 ? ` · parcela ${Number(c.home.plot_m2)}` : ''}</span>
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">Es una orientación hecha con los datos que tenéis (zona, pisos parecidos, Catastro y riesgos). No sustituye a una tasación: el banco la pedirá igualmente.</p>
        </div>
      )}
    </section>
  )
}
