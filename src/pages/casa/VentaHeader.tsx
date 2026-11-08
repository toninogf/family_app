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

/** Nuestra casa de un vistazo: datos con iconos, extras y gastos al mes */
export function SaleFacts({ m, onEdit }: { m: Mudanza; onEdit: () => void }) {
  const l = m.listing
  const [costsOpen, setCostsOpen] = useState(false)
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
  const parts = [l.community_fee_cents, l.ibi_cents == null ? null : Math.round(l.ibi_cents / 12), l.electricity_cents, l.water_cents, l.heating_cents]
  const monthly = parts.every(x => x == null) ? null : parts.reduce<number>((s, x) => s + (x ?? 0), 0)
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
      <button onClick={() => (monthly != null ? setCostsOpen(!costsOpen) : onEdit())} className="flex justify-between items-center text-left border-t border-line pt-2">
        <span className="text-[13px] text-muted">💶 Gastos al mes (lo que verá el comprador)</span>
        <span className="text-[14px] font-semibold">{monthly != null ? `~${price(monthly)}` : 'Añadir'}{monthly != null && <span className="text-muted"> {costsOpen ? '▾' : '▸'}</span>}</span>
      </button>
      {costsOpen && monthly != null && (
        <div className="text-[12px] text-muted grid grid-cols-2 gap-x-3 -mt-1">
          {l.community_fee_cents != null && <span>Comunidad {price(l.community_fee_cents)}</span>}
          {l.ibi_cents != null && <span>IBI {price(Math.round(l.ibi_cents / 12))}/mes</span>}
          {l.electricity_cents != null && <span>Luz {price(l.electricity_cents)}</span>}
          {l.water_cents != null && <span>Agua {price(l.water_cents)}</span>}
          {l.heating_cents != null && <span>Calefacción {price(l.heating_cents)}</span>}
        </div>
      )}
    </section>
  )
}

