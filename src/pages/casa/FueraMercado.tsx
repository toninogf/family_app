// «🏁 Ya no está a la venta»: marcar una casa como vendida o retirada (con fechas), ver cuánto duró y su historial de
// precio, el aviso de la búsqueda automática cuando un anuncio parece haber desaparecido y la lectura del mercado.
import { useState } from 'react'
import { price, type Home, type HomePrice } from '../../lib/mudanza'
import { daysOnMarket, dropPct, MARKET_MIN, offMarketStats, priceTrail } from '../../lib/market'
import { shortDate, today } from '../../lib/dates'
import { TextField } from '../../components/Sheet'

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const k = (c: number) => `${Math.round(c / 100000).toLocaleString('es-ES')}k`

/** ¿Qué ha pasado? Vendida o retirada, cuándo y desde cuándo estaba anunciada */
export function OffMarketPanel({ h, onSave, onCancel }: {
  h: Home; onCancel: () => void
  onSave: (v: { off_market_kind: 'vendida' | 'retirada'; off_market_on: string; listed_on: string | null }) => Promise<void>
}) {
  const [kind, setKind] = useState<'vendida' | 'retirada'>(h.off_market_kind ?? (h.off_market_suspect?.sold ? 'vendida' : 'retirada'))
  const [on, setOn] = useState(h.off_market_on ?? h.off_market_suspect?.on ?? today())
  const [listed, setListed] = useState(h.listed_on ?? '')
  const [busy, setBusy] = useState(false)
  const bad = !on || on > today() || (!!listed && listed > on)
  return (
    <div className="flex flex-col gap-3 bg-card rounded-2xl p-4">
      <span className="text-sm font-medium text-muted">¿Qué ha pasado con esta casa?</span>
      <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Qué ha pasado">
        {([['vendida', '🤝 Vendida', 'Lo dice el anuncio o la inmobiliaria'], ['retirada', '🚫 Retirada', 'El anuncio ha desaparecido; no sabemos si se vendió']] as const).map(([v, l, hint]) => (
          <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)}
            className={`min-h-11 px-3 py-2 rounded-xl text-left border flex-1 min-w-[9rem] ${kind === v ? 'bg-ink text-bg border-ink' : 'bg-bg border-line'}`}>
            <span className="block text-[14px] font-semibold">{l}</span>
            <span className={`block text-[12px] ${kind === v ? 'opacity-80' : 'text-muted'}`}>{hint}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label={kind === 'vendida' ? 'Vendida el (aprox.)' : 'Desapareció el (aprox.)'} type="date" value={on} max={today()} onChange={e => setOn(e.target.value)} required />
        <TextField label="Anuncio publicado el" type="date" value={listed} max={on || today()} onChange={e => setListed(e.target.value)} />
      </div>
      <p className="text-[12px] text-muted -mt-1">
        {listed ? 'Con las dos fechas se calcula cuánto tardó en irse.' : `Si no sabéis cuándo se publicó, se cuenta desde que la añadisteis (${shortDate(h.created_at.slice(0, 10))}): saldrá algo menos de lo real.`}
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
        <button disabled={bad || busy} onClick={async () => { setBusy(true); await onSave({ off_market_kind: kind, off_market_on: on, listed_on: listed || null }); setBusy(false) }}
          className="min-h-10 px-4 rounded-lg bg-ink text-bg text-sm font-semibold disabled:opacity-40">Guardar</button>
      </div>
    </div>
  )
}

/** Historial de precio en una línea: «690k (01/10) → 650k (20/10) · −5,8 %» */
export function PriceTrailLine({ h, prices }: { h: Home; prices: HomePrice[] }) {
  const t = priceTrail(h.id, prices)
  const d = dropPct(t)
  const dm = daysOnMarket(h, today())
  return (
    <div className="text-[13px] text-muted -mt-2 flex flex-col gap-0.5">
      {/* Cuánto lleva a la venta: desde el anuncio o, si no se sabe, desde que la añadisteis (serán algunos días más) */}
      <span>📅 {dm.exact ? `Anunciada el ${shortDate(dm.from)}` : `Añadida el ${shortDate(dm.from)} (fecha del anuncio sin poner)`} · lleva {dm.exact ? 'unos' : '≥'} <b className={dm.days >= 90 ? 'text-[#C77A12]' : ''}>{dm.days} días</b> a la venta{dm.days >= 90 ? ' · suele haber margen para negociar' : ''}</span>
      {t.length >= 2 && (
        <span>
          {d > 0 ? '📉' : '📈'} {t.slice(-4).map(p => `${k(p.price_cents)} (${ddmm(p.changed_on)})`).join(' → ')}
          {d !== 0 && <> · <b className={d > 0 ? 'text-[#1F8A4C]' : 'text-[#C8452F]'}>{d > 0 ? '−' : '+'}{Math.abs(d).toLocaleString('es-ES')} %</b></>}
        </span>
      )}
    </div>
  )
}

/** «51 d» para la tarjeta (≥ si no sabemos la fecha del anuncio) */
export function DaysChip({ h }: { h: Home }) {
  if (h.status === 'fuera' || h.status === 'descartado') return null
  const dm = daysOnMarket(h, today())
  return (
    <span title={dm.exact ? `Anunciada el ${shortDate(dm.from)}` : `Añadida el ${shortDate(dm.from)}`}
      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${dm.days >= 90 ? 'bg-[#E0A21B]/15 text-[#C77A12]' : 'text-muted'}`}>
      📅 {dm.exact ? '' : '≥'}{dm.days} d
    </span>
  )
}

/** Resumen de una casa que ya no está a la venta */
export function OffMarketInfo({ h, prices, onEdit }: { h: Home; prices: HomePrice[]; onEdit: () => void }) {
  const dm = daysOnMarket(h, today())
  const t = priceTrail(h.id, prices)
  const d = dropPct(t)
  return (
    <div className="rounded-2xl bg-card p-3 flex flex-col gap-1 text-[14px] -mt-2">
      <span className="font-semibold">{h.off_market_kind === 'vendida' ? '🤝 Vendida' : '🚫 Retirada del mercado'}{h.off_market_on ? ` el ${shortDate(h.off_market_on)}` : ''}</span>
      {h.off_market_on && <span>⏱️ Unos <b>{dm.days} días</b> a la venta{dm.exact ? ` (anuncio del ${shortDate(dm.from)})` : ` (contando desde que la añadisteis el ${shortDate(dm.from)}: fueron algunos más)`}</span>}
      {t.length > 0 && <span>💶 {t.length > 1 ? <>Salió a {price(t[0].price_cents)} y se fue a <b>{price(t[t.length - 1].price_cents)}</b>{d > 0 ? ` (bajó un ${d.toLocaleString('es-ES')} %)` : ''}</> : <>Último precio: <b>{price(t[0].price_cents)}</b> (sin bajadas que sepamos)</>}</span>}
      <button onClick={onEdit} className="self-start min-h-9 text-[13px] text-accent font-semibold">Cambiar fechas o qué pasó</button>
    </div>
  )
}

/** Aviso de la búsqueda automática: el anuncio parece haber desaparecido */
export function SuspectBanner({ h, onConfirm, onStillListed }: { h: Home; onConfirm: () => void; onStillListed: () => void }) {
  const s = h.off_market_suspect!
  return (
    <div className="rounded-2xl border border-[#E0A21B] bg-[#E0A21B]/10 p-3 flex flex-col gap-2 -mt-2" role="status">
      <p className="text-[14px] leading-snug">🤖 El {shortDate(s.on)} la búsqueda automática no encontró el anuncio{s.sold ? ' y parece vendida' : ''}.{s.note ? ` ${s.note}` : ''}</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onConfirm} className="min-h-10 px-3 rounded-xl bg-ink text-bg text-[13px] font-semibold">🏁 Ya no está a la venta</button>
        <button onClick={onStillListed} className="min-h-10 px-3 rounded-xl border border-line bg-card text-[13px] font-semibold">Sigue publicada</button>
      </div>
    </div>
  )
}

/** Lectura del mercado (Buscamos): a partir de unas cuantas casas que ya no están a la venta */
export function MarketCard({ homes, prices, onShow }: { homes: Home[]; prices: HomePrice[]; onShow: () => void }) {
  const s = offMarketStats(homes, prices)
  const suspects = homes.filter(h => h.status !== 'fuera' && h.off_market_suspect).length
  if (!s.n && !suspects) return null
  return (
    <button onClick={onShow} className="rounded-2xl bg-card px-4 py-3 text-left flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className="text-[20px]" aria-hidden="true">🏁</span>
        <span className="flex-1 text-[14px]"><b>{s.n}</b> casa{s.n === 1 ? '' : 's'} ya no está{s.n === 1 ? '' : 'n'} a la venta
          <span className="text-muted"> ({s.sold} vendida{s.sold === 1 ? '' : 's'}, {s.withdrawn} retirada{s.withdrawn === 1 ? '' : 's'})</span></span>
        <span className="text-accent font-semibold" aria-hidden="true">›</span>
      </span>
      {suspects > 0 && <span className="text-[13px] text-[#C77A12] font-semibold">🤖 {suspects} parece{suspects === 1 ? '' : 'n'} retirada{suspects === 1 ? '' : 's'}: confirmadlo en su ficha</span>}
      {s.n >= MARKET_MIN && s.avgDays != null ? (
        <span className="text-[13px] leading-snug">
          📊 Las que os interesaban duraron <b>unos {s.avgDays} días</b>{s.dropped ? <> y {s.dropped === s.n ? 'todas' : `${s.dropped} de ${s.n}`} bajaron antes de irse (media <b>{s.avgDrop.toLocaleString('es-ES')} %</b>)</> : ' sin bajar de precio'}.
          {s.exactDates < s.n ? <span className="text-muted"> Aproximado: en {s.n - s.exactDates} no sabemos cuándo se publicaron.</span> : null}
        </span>
      ) : s.n > 0 ? <span className="text-[12px] text-muted">Con {MARKET_MIN} o más os diré cuánto duran y cuánto bajan las casas que os gustan.</span> : null}
    </button>
  )
}
