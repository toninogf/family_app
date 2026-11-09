import { useEffect, useState } from 'react'
import { COOLING, FEATURES, HEATING, photoUrls, price, type Mudanza } from '../../lib/mudanza'
import { FEATURE_ICON } from '../../components/FormKit'

/** Fotos de nuestra casa, deslizables (bucket house-photos, carpeta <hogar>/venta/) */
export function SaleGallery({ m, onAdd }: { m: Mudanza; onAdd: () => void }) {
  const fotos = m.salePhotos.filter(p => p.kind === 'foto')
  const list = fotos.length ? fotos : m.salePhotos.slice(0, 1)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [big, setBig] = useState<string | null>(null)
  const key = list.map(p => p.path).join()
  useEffect(() => {
    if (!list.length) return
    let alive = true
    photoUrls(list.map(p => p.path)).then(u => { if (alive) setUrls(u) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!list.length) {
    return <button onClick={onAdd} className="w-full aspect-[16/7] rounded-2xl border border-dashed border-line text-sm font-semibold text-accent">🖼️ Añadir fotos de la casa</button>
  }
  return (
    <>
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {list.map((p, i) => (
          <button key={p.id} onClick={() => setBig(urls[p.path] ?? null)} aria-label={`Foto ${i + 1} de ${list.length}`}
            className={`relative shrink-0 snap-center rounded-2xl overflow-hidden bg-card aspect-[4/3] ${list.length > 1 ? 'w-[86%]' : 'w-full'}`}>
            {urls[p.path] && <img src={urls[p.path]} alt="" loading={i ? 'lazy' : 'eager'} className={`w-full h-full object-cover ${p.kind === 'anuncio' ? 'object-top' : ''}`} />}
            {i === 0 && list.length > 1 && <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold">1/{list.length} ⇢</span>}
          </button>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-40 bg-black/95 flex flex-col" onClick={() => setBig(null)}>
          <div className="flex justify-end px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
            <button onClick={() => setBig(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 pb-[max(env(safe-area-inset-bottom),8px)]">
            <img src={big} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      )}
    </>
  )
}

/** Nuestra casa de un vistazo: datos con iconos, extras y dónde está (los gastos al mes van en «¿Cuánto nos queda?») */
export function SaleFacts({ m, onEdit }: { m: Mudanza; onEdit: () => void }) {
  const l = m.listing
  if (!l) return null
  const facts = ([
    l.size_m2 && ['🏠', `${Number(l.size_m2)} m²${l.useful_m2 ? ` (${Number(l.useful_m2)} útiles)` : ''}`],
    l.plot_m2 && ['🌳', `parcela ${Number(l.plot_m2)} m²`],
    l.rooms != null && ['🛏', `${l.rooms} hab.`],
    l.baths != null && ['🛁', `${l.baths} baños`],
    l.floor && ['🏢', l.floor.length > 18 ? `${l.floor.slice(0, 18)}…` : l.floor],
    l.year_built && ['🏗', `de ${l.year_built}`],
    l.energy && ['⚡', `certif. ${l.energy}`],
    l.heating_type && ['🔥', HEATING[l.heating_type]],
    l.cooling && ['❄️', `aire: ${COOLING[l.cooling]}`]
  ].filter(Boolean) as [string, string][])
  const extras = (l.features ?? []).filter(f => !(f === 'calefaccion' && l.heating_type) && !(f === 'aire' && l.cooling))
  const place = [l.address, l.zone, l.municipality].filter(Boolean).join(' · ')
  return (
    <section className="bg-card rounded-2xl p-3 flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">De un vistazo</h3>
        <button onClick={onEdit} aria-label="Editar la ficha" className="min-h-9 px-2 text-sm">✏️</button>
      </div>
      {facts.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {facts.map(([i, t]) => <span key={i + t} className="text-[13px] flex gap-1.5 min-w-0"><span aria-hidden="true">{i}</span><span className="truncate">{t}</span></span>)}
        </div>
      ) : <p className="text-sm text-muted">Rellena la ficha desde vuestro anuncio con «✏️».</p>}
      {extras.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {extras.map(f => <span key={f} className="px-2 py-0.5 rounded-lg bg-bg text-[12px]">{FEATURE_ICON[f] ?? '•'} {FEATURES[f] ?? f}</span>)}
        </span>
      )}
      {place && <span className="text-[13px] border-t border-line pt-2">📍 {place}</span>}
    </section>
  )
}

/** «📆 Gastos al mes» de nuestra casa (lo que verá el comprador; sale en el dossier) */
export function SaleMonthly({ m, onEdit }: { m: Mudanza; onEdit: () => void }) {
  const l = m.listing
  const rows: [string, number][] = ([
    l?.community_fee_cents != null && ['Comunidad', l.community_fee_cents],
    l?.ibi_cents != null && ['IBI (anual / 12)', Math.round(l.ibi_cents / 12)],
    l?.electricity_cents != null && ['Luz', l.electricity_cents],
    l?.water_cents != null && ['Agua', l.water_cents],
    l?.heating_cents != null && ['Calefacción', l.heating_cents]
  ].filter(Boolean) as [string, number][])
  const monthly = rows.length ? rows.reduce((s, [, v]) => s + v, 0) : null
  return (
    <button onClick={onEdit} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1">
      <span className="flex justify-between items-center gap-2">
        <span className="font-bold text-[15px]">📆 Gastos al mes</span>
        <span className="text-[14px] font-semibold">{monthly != null ? `~${price(monthly)}` : <span className="text-sm" aria-hidden="true">✏️</span>}</span>
      </span>
      <span className="text-[12px] text-muted">Lo que verá el comprador (sale en el dossier)</span>
      {rows.length ? (
        <span className="grid grid-cols-2 gap-x-3 text-[12px] text-muted">
          {rows.map(([lb, v]) => <span key={lb}>{lb} {price(v)}</span>)}
        </span>
      ) : <span className="text-[13px] text-muted">+ Añadir comunidad, IBI y suministros</span>}
    </button>
  )
}

