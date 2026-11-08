import { useEffect, useState, type FormEvent } from 'react'
import { shortDate } from '../../lib/dates'
import { COOLING, FEATURES, HEATING, parsePrice, perM2, photoUrl, price, priceInput, type Cooling, type HeatingType, type Listing, type Mudanza, type SalePhoto } from '../../lib/mudanza'
import { MUNICIPALITIES, MADRID_DISTRICTS } from '../../data/places'
import type { ListingData } from '../../lib/listingParse'
import { Choice, MultiChips, Sheet, TextArea, TextField } from '../../components/Sheet'
import Combobox from '../../components/Combobox'
import ListingImport, { knownForAi, merger } from '../../components/ListingImport'

const TOWNS = (MUNICIPALITIES['28'] ?? []).map(p => p.name)
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')))
const m2Input = (v: number | null | undefined) => (v == null ? '' : String(Number(v)).replace('.', ','))

/** Resumen de la ficha para la tarjeta del anuncio: «Chalet · 337 m² · 4 hab. · 3 baños · Galapagar» */
export function fichaLine(l: Listing | null) {
  if (!l) return ''
  return [l.property_type, l.size_m2 && `${Number(l.size_m2)} m²`, l.rooms != null && `${l.rooms} hab.`, l.baths != null && `${l.baths} baños`, [l.zone, l.municipality].filter(Boolean).join(' · ')]
    .filter(Boolean).join(' · ')
}

/** Ficha completa de nuestro anuncio: datos, enlaces, y relleno desde el anuncio (IA, texto o capturas) */
export function VentaFichaSheet({ m, householdId, onClose }: { m: Mudanza; householdId: string; onClose: () => void }) {
  const l = m.listing
  const firstLink = l?.links[0]?.url ?? ''
  const [url, setUrl] = useState(firstLink)
  const [shots, setShots] = useState<File[]>([])
  const [adPhotos, setAdPhotos] = useState<File[]>([])
  const [amount, setAmount] = useState(priceInput(l?.price_cents))
  const [published, setPublished] = useState(l?.published_on ?? '')
  const [title, setTitle] = useState(l?.title ?? '')
  const [type, setType] = useState(l?.property_type ?? '')
  const [address, setAddress] = useState(l?.address ?? '')
  const [zone, setZone] = useState(l?.zone ?? '')
  const [municipality, setMunicipality] = useState<string | null>(l?.municipality ?? null)
  const [m2, setM2] = useState(m2Input(l?.size_m2))
  const [useful, setUseful] = useState(m2Input(l?.useful_m2))
  const [plot, setPlot] = useState(m2Input(l?.plot_m2))
  const [rooms, setRooms] = useState(l?.rooms?.toString() ?? '')
  const [baths, setBaths] = useState(l?.baths?.toString() ?? '')
  const [floor, setFloor] = useState(l?.floor ?? '')
  const [features, setFeatures] = useState<string[]>(l?.features ?? [])
  const [energy, setEnergy] = useState<string | null>(l?.energy ?? null)
  const [heatType, setHeatType] = useState<HeatingType | null>(l?.heating_type ?? null)
  const [cooling, setCooling] = useState<Cooling | null>(l?.cooling ?? null)
  const [fee, setFee] = useState(priceInput(l?.community_fee_cents))
  const [ibi, setIbi] = useState(priceInput(l?.ibi_cents))
  const [power, setPower] = useState(priceInput(l?.electricity_cents))
  const [water, setWater] = useState(priceInput(l?.water_cents))
  const [heating, setHeating] = useState(priceInput(l?.heating_cents))
  const [year, setYear] = useState(l?.year_built?.toString() ?? '')
  const [ref, setRef] = useState(l?.listing_ref ?? '')
  const [description, setDescription] = useState(l?.description ?? '')
  const [notes, setNotes] = useState(l?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  /** Rellena solo lo vacío; lo que ya tenía otro valor se ofrece aparte (no se machaca) */
  function apply(d: ListingData) {
    const f = merger()
    const eur = (v?: number) => (v ? priceInput(Math.round(v * 100)) : null)
    f.put('precio', amount, eur(d.price_eur), setAmount)
    f.put('tipo', type, d.property_type, setType)
    f.put('título', title, d.title, setTitle, { diff: false })
    f.put('dirección', address, d.address?.slice(0, 120), setAddress)
    f.put('zona', zone, d.zone?.slice(0, 60), setZone)
    f.put('localidad', municipality, d.municipality, setMunicipality)
    f.put('m²', m2, d.size_m2 ? m2Input(d.size_m2) : null, setM2)
    f.put('m² útiles', useful, d.useful_m2 ? m2Input(d.useful_m2) : null, setUseful)
    f.put('parcela', plot, d.plot_m2 ? m2Input(d.plot_m2) : null, setPlot)
    f.put('habitaciones', rooms, d.rooms != null ? String(d.rooms) : null, setRooms)
    f.put('baños', baths, d.baths != null ? String(d.baths) : null, setBaths)
    f.put('planta', floor, d.floor?.slice(0, 20), setFloor)
    f.put('certificado', energy, d.energy, setEnergy)
    f.put('tipo de calefacción', heatType ? HEATING[heatType] : null, d.heating_type ? HEATING[d.heating_type] : null, () => setHeatType(d.heating_type!))
    f.put('aire', cooling ? COOLING[cooling] : null, d.cooling ? COOLING[d.cooling] : null, () => setCooling(d.cooling!))
    f.put('comunidad', fee, eur(d.community_eur), setFee)
    f.put('IBI', ibi, eur(d.ibi_eur), setIbi)
    f.put('luz', power, eur(d.power_eur), setPower)
    f.put('agua', water, eur(d.water_eur), setWater)
    f.put('calefacción', heating, eur(d.heating_eur), setHeating)
    f.put('año', year, d.year_built ? String(d.year_built) : null, setYear)
    f.put('referencia', ref, d.ref?.slice(0, 60), setRef)
    f.put('descripción', description, d.summary?.slice(0, 5000), setDescription, { diff: false })
    // Las características solo se añaden (nunca se quita ninguna)
    const newF = (d.features ?? []).filter(x => !features.includes(x))
    if (newF.length) { setFeatures([...features, ...newF]); f.filled.push('características') }
    return { filled: f.filled, diffs: f.diffs }
  }


  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = amount.trim() ? parsePrice(amount) : null
    if (amount.trim() && !cents) { setError('El precio no es válido'); return }
    const ints = [rooms, baths, year].map(x => (x.trim() ? parseInt(x, 10) : null))
    if (ints.some(x => x != null && (isNaN(x) || x < 0))) { setError('Revisa habitaciones, baños y año'); return }
    const sizes = [m2, useful, plot].map(num)
    if (sizes.some(x => x != null && (isNaN(x) || x <= 0))) { setError('Revisa los metros'); return }
    // El enlace del anuncio queda como el primero de «Dónde está anunciado»
    const links = [...(l?.links ?? [])]
    const clean = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : ''
    if (clean && !links.some(x => x.url === clean)) links.unshift({ label: '', url: clean })
    setBusy('Guardando…'); setError('')
    const err = await m.write('sale_listing', {
      household_id: householdId, price_cents: cents, published_on: published || null, links: links.slice(0, 10),
      title: title.trim() || null, property_type: type.trim() || null, address: address.trim() || null, zone: zone.trim() || null,
      municipality, province: municipality ? 'Madrid' : null, size_m2: sizes[0], useful_m2: sizes[1], plot_m2: sizes[2],
      rooms: ints[0], baths: ints[1], floor: floor.trim() || null, features, energy, heating_type: heatType, cooling,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, ibi_cents: ibi.trim() ? parsePrice(ibi) : null,
      electricity_cents: power.trim() ? parsePrice(power) : null, water_cents: water.trim() ? parsePrice(water) : null, heating_cents: heating.trim() ? parsePrice(heating) : null,
      year_built: ints[2], listing_ref: ref.trim() || null, description: description.trim() || null,
      notes: notes.trim() || null
    }, undefined, 'household_id')
    if (!err && shots.length) {
      for (let i = 0; i < shots.length; i++) {
        setBusy(`Guardando capturas… ${i + 1} de ${shots.length}`)
        await m.addSalePhoto(householdId, shots[i], 'anuncio')
      }
    }
    if (!err && adPhotos.length) {
      for (let i = 0; i < adPhotos.length; i++) {
        setBusy(`Guardando fotos… ${i + 1} de ${adPhotos.length}`)
        await m.addSalePhoto(householdId, adPhotos[i], 'foto')
      }
    }
    setBusy(null)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title="Ficha de nuestro anuncio" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <ListingImport url={url} onUrl={setUrl} onApply={apply} shots={shots} onShots={setShots} adPhotos={adPhotos} onAdPhotos={setAdPhotos}
          known={knownForAi({
            'Precio': amount && `${amount} €`, 'Título': title, 'Tipo': type, 'Dirección': address, 'Zona': zone, 'Localidad': municipality,
            'Metros construidos': m2, 'Metros útiles': useful, 'Parcela (m²)': plot, 'Habitaciones': rooms, 'Baños': baths, 'Planta': floor,
            'Año de construcción': year, 'Extras': features.map(f => FEATURES[f] ?? f).join(', '), 'Certificado energético': energy,
            'Calefacción': heatType && HEATING[heatType], 'Aire acondicionado': cooling && COOLING[cooling],
            'Comunidad (€/mes)': fee, 'IBI (€/año)': ibi, 'Luz (€/mes)': power, 'Agua (€/mes)': water, 'Calefacción (€/mes)': heating, 'Referencia': ref
          })} />
        <TextField label="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Ej. Chalet con piscina en Las Cuestas" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Precio publicado (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="285.000" />
          <TextField label="Publicado desde" type="date" value={published} onChange={e => setPublished(e.target.value)} />
        </div>
        <p className="text-xs text-muted -mt-3">Cada cambio de precio queda guardado en el historial.</p>
        <TextField label="Tipo" value={type} onChange={e => setType(e.target.value)} maxLength={60} placeholder="Piso, chalet independiente, ático…" />
        <Combobox label="Localidad" value={municipality} onChange={setMunicipality} options={TOWNS} placeholder="Escribe: Galap…" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona o barrio'}</span>
          <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'venta-distritos' : undefined}
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
          {municipality === 'Madrid' && <datalist id="venta-distritos">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
        </label>
        <TextField label="Dirección" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} />
        <div className="grid grid-cols-3 gap-3">
          <TextField label="m² constr." inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} />
          <TextField label="m² útiles" inputMode="decimal" value={useful} onChange={e => setUseful(e.target.value)} />
          <TextField label="Parcela m²" inputMode="decimal" value={plot} onChange={e => setPlot(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Habitaciones" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <TextField label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} />
          <TextField label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} />
        </div>
        <MultiChips label="Tiene" value={features} onChange={setFeatures} options={Object.entries(FEATURES).filter(([k]) => k !== 'cerca_cole').map(([value, label]) => ({ value, label }))} />
        <Choice<string | null> label="Certificado energético" value={energy} onChange={setEnergy}
          options={[...'ABCDEFG'.split('').map(x => ({ value: x as string | null, label: x })), { value: null, label: '?' }]} />
        <Choice<HeatingType | null> label="Calefacción" value={heatType} onChange={setHeatType}
          options={[...(Object.keys(HEATING) as HeatingType[]).map(k => ({ value: k as HeatingType | null, label: HEATING[k] })), { value: null, label: '?' }]} />
        <Choice<Cooling | null> label="Aire acondicionado" value={cooling} onChange={setCooling}
          options={[...(['splits', 'conductos', 'aerotermia', 'si', 'no'] as Cooling[]).map(k => ({ value: k as Cooling | null, label: COOLING[k] })), { value: null, label: '?' }]} />
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Comunidad €/mes" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} />
          <TextField label="IBI €/año" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} />
          <TextField label="Año constr." inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Luz €/mes" inputMode="decimal" value={power} onChange={e => setPower(e.target.value)} />
          <TextField label="Agua €/mes" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} />
          <TextField label="Calefacción €/mes" inputMode="decimal" value={heating} onChange={e => setHeating(e.target.value)} />
        </div>
        <p className="text-xs text-muted -mt-3">Gasto medio al mes de vuestras facturas: a los compradores les interesa y sale en el dossier.</p>
        <TextField label="Referencia del anuncio" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} />
        <TextArea label="Descripción del anuncio" value={description} onChange={e => setDescription(e.target.value)} maxLength={5000}
          placeholder="El texto que tenéis publicado (sirve también para el dossier)" />
        <TextArea label="Notas privadas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Precio mínimo que aceptaríamos, qué incluye… (no sale en el dossier)" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted">{busy}</p>}
        <button type="submit" disabled={!!busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">Guardar</button>
      </form>
      {m.prices.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-bold text-[15px]">Historial de precios</h3>
          {m.prices.slice().reverse().map(p => (
            <p key={p.id} className="text-sm flex justify-between"><span className="text-muted">{shortDate(p.changed_on)}</span><span>{price(p.price_cents)}</span></p>
          ))}
        </section>
      )}
    </Sheet>
  )
}

/** Nuestro precio por m² frente al de los pisos guardados en Buscamos de la misma localidad */
export function MarketCompare({ m }: { m: Mudanza }) {
  const l = m.listing
  const ours = l?.price_cents && l.size_m2 ? Math.round(l.price_cents / Number(l.size_m2)) : null
  if (!ours || !l?.municipality) return null
  const peers = m.homes.filter(h => h.municipality === l.municipality && h.status !== 'descartado' && perM2(h) != null)
  if (!peers.length) {
    return <p className="text-xs text-muted">Guarda en Buscamos pisos de {l.municipality} para comparar vuestro precio por m² con la zona.</p>
  }
  const values = peers.map(h => perM2(h)!).sort((a, b) => a - b)
  const mid = values.length % 2 ? values[(values.length - 1) / 2] : Math.round((values[values.length / 2 - 1] + values[values.length / 2]) / 2)
  const diff = Math.round(((ours - mid) / mid) * 100)
  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted">Precio por m² frente a la zona</span>
      <span className="text-[15px]">Vuestro piso: <b>{price(ours)}/m²</b> · mediana de {peers.length} piso{peers.length > 1 ? 's' : ''} en {l.municipality}: <b>{price(mid)}/m²</b></span>
      <span className={`text-[13px] font-semibold ${Math.abs(diff) <= 5 ? 'text-accent' : diff > 0 ? 'text-danger' : 'text-accent'}`}>
        {Math.abs(diff) <= 5 ? 'En línea con la zona' : diff > 0 ? `Un ${diff} % por encima` : `Un ${-diff} % por debajo`}
      </span>
      <span className="text-[11px] text-muted">Con los pisos que habéis guardado en Buscamos (precios de anuncio, no de venta). Tamaños y estados distintos influyen.</span>
    </div>
  )
}

/** Fotos y capturas de nuestro anuncio */
export function VentaPhotos({ m, householdId, kind }: { m: Mudanza; householdId: string; kind: 'foto' | 'anuncio' }) {
  const photos = m.salePhotos.filter(p => p.kind === kind)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<SalePhoto | null>(null)
  const ad = kind === 'anuncio'
  useEffect(() => {
    let alive = true
    Promise.all(photos.filter(p => !urls[p.id]).map(async p => [p.id, await photoUrl(p.path)] as const)).then(pairs => {
      if (!alive || !pairs.length) return
      setUrls(u => ({ ...u, ...Object.fromEntries(pairs.filter(([, x]) => x) as [string, string][]) }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map(p => p.id).join()])

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    for (const f of Array.from(files).slice(0, 20)) await m.addSalePhoto(householdId, f, kind)
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">{ad ? '📸 Capturas del anuncio' : '🖼️ Fotos del piso'}</h3>
        <label className="min-h-10 px-2 text-sm font-semibold text-accent flex items-center cursor-pointer">
          {busy ? 'Subiendo…' : ad ? '+ Capturas' : '+ Fotos'}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={e => { void add(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {photos.length === 0 ? <p className="text-sm text-muted">{ad
        ? 'Guarda capturas de vuestro anuncio publicado: copia de cómo está y de lo que dice.'
        : 'Las fotos del anuncio: para reutilizarlas en otros portales y para el dossier.'}</p> : (
        <div className={`grid ${ad ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5`}>
          {photos.map(p => (
            <button key={p.id} onClick={() => setView(p)} className={`${ad ? 'aspect-[9/16]' : 'aspect-square'} rounded-lg overflow-hidden bg-bg`}>
              {urls[p.id] && <img src={urls[p.id]} alt="" className={`w-full h-full object-cover ${ad ? 'object-top' : ''}`} loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col" onClick={() => setView(null)}>
          <div className="flex justify-between p-3" onClick={e => e.stopPropagation()}>
            <div className="flex gap-1">
              <button onClick={async () => { await m.removeSalePhoto(view); setView(null) }} className="min-h-11 px-3 text-sm font-semibold text-white">Borrar</button>
              {urls[view.id] && <a href={urls[view.id]} download target="_blank" rel="noopener noreferrer" className="min-h-11 px-3 text-sm font-semibold text-white flex items-center">Descargar</a>}
            </div>
            <button onClick={() => setView(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
          </div>
          <div className={`flex-1 p-2 ${ad ? 'overflow-y-auto' : 'flex items-center justify-center'}`}>
            {urls[view.id] && <img src={urls[view.id]} alt="" className={ad ? 'w-full h-auto' : 'max-w-full max-h-full object-contain'} />}
          </div>
        </div>
      )}
    </section>
  )
}
