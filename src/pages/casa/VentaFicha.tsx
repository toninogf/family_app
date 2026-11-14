import { useEffect, useState, type FormEvent } from 'react'
import { shortDate } from '../../lib/dates'
import { COOLING, COST_TEMPLATE, FEATURE_GROUPS, HOUSE_ONE_OF, FEATURES, HEATING, mergeLinks, parsePrice, portalName, perM2, photoUrl, price, priceInput, type Cooling, type HeatingType, type Link, type Listing, type Mudanza, type SalePhoto, BUILDING_LABEL, LIGHT_LABEL, NOISE_LABEL, type BuildingState, type Light, type Noise
} from '../../lib/mudanza'
import { MUNICIPALITIES, MADRID_DISTRICTS } from '../../data/places'
import type { ListingData } from '../../lib/listingParse'
import { Sheet, TextArea } from '../../components/Sheet'
import Combobox from '../../components/Combobox'
import ListingImport, { knownForAi, merger } from '../../components/ListingImport'
import { EditSection, Field, GroupedChips, ImportSummary, SaveBar, SelectField, SubHead, thousands, useDirty, useFlash, useSections } from '../../components/FormKit'

const VSECTIONS = [
  { id: 'casa', title: 'Nuestra casa' }, { id: 'cuentas', title: '¿Cuánto nos queda?' }, { id: 'texto', title: 'Descripción' }
]

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
export type VentaFocus = 'casa' | 'valor' | 'precio' | 'cuentas' | 'mes' | 'texto' | 'anuncio' | 'enlaces'

export function VentaFichaSheet({ m, householdId, onClose, focus }: { m: Mudanza; householdId: string; onClose: () => void; focus?: VentaFocus }) {
  const l = m.listing
  const firstLink = l?.links[0]?.url ?? ''
  const [url, setUrl] = useState(firstLink)
  const [shots, setShots] = useState<File[]>([])
  const [adPhotos, setAdPhotos] = useState<File[]>([])
  const [extraLinks, setExtraLinks] = useState<Link[]>([])
  // Dónde está anunciada: se pueden corregir o quitar (el primero es el anuncio principal)
  const [links, setLinks] = useState<Link[]>(l?.links ?? [])
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
  const [reformYear, setReformYear] = useState(l?.reform_year?.toString() ?? '')
  const [buildingRehab, setBuildingRehab] = useState(l?.building_reform_year?.toString() ?? '')
  const [orientation, setOrientation] = useState<string | null>(l?.orientation ?? null)
  const [building, setBuilding] = useState<BuildingState | null>(l?.building_state ?? null)
  const [derrama, setDerrama] = useState(priceInput(l?.derrama_cents))
  const [noise, setNoise] = useState<Noise | null>(l?.noise ?? null)
  const [light, setLight] = useState<Light | null>(l?.light ?? null)
  const [ref, setRef] = useState(l?.listing_ref ?? '')
  const [description, setDescription] = useState(l?.description ?? '')
  const [notes, setNotes] = useState(l?.notes ?? '')
  const [mortgage, setMortgage] = useState(priceInput(l?.mortgage_cents))
  const [costs, setCosts] = useState<{ label: string; amount: string }[]>(
    l?.costs?.length ? l.costs.map(c => ({ label: c.label, amount: priceInput(c.cents) })) : COST_TEMPLATE.map(label => ({ label, amount: '' })))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // Mismos bloques que la ficha; el ✏️ de cada tarjeta abre el suyo y baja a su apartado
  const target = focus ? ({ casa: ['casa', 'casa'], valor: ['casa', 'casa-valor'], precio: ['cuentas', 'cuentas-precio'], cuentas: ['cuentas', 'cuentas-venta'],
    mes: ['cuentas', 'cuentas-mes'], texto: ['texto', 'texto'], anuncio: ['anuncio', 'anuncio'], enlaces: ['enlaces', 'enlaces'] } as const)[focus] : null
  const anchor = target?.[1] ?? null
  const sections = useSections(target ? [target[0]] : l ? [] : ['anuncio', 'casa'])
  useEffect(() => {
    if (!anchor) return
    const t = setTimeout(() => document.getElementById(`edit-${anchor}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [anchor])
  const { flash, show: showFlash } = useFlash()
  const [summary, setSummary] = useState<{ filled: number; diffs: number } | null>(null)
  const [leaving, setLeaving] = useState(false)

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
    const touched = [...f.filled, ...f.diffs.map(x => x.label)]
    showFlash(f.filled, f.diffs.map(x => x.label))
    sections.reveal(VSECTIONS.filter(sec => fieldsOf(sec.id).some(([k]) => touched.includes(k))).map(sec => sec.id))
    if (touched.length) setSummary({ filled: f.filled.length, diffs: f.diffs.length })
    return { filled: f.filled, diffs: f.diffs }
  }

  // Qué datos tiene cada bloque (contador, resumen y «pedir solo lo que falta»)
  function fieldsOf(id: string): [string, string][] {
    switch (id) {
      case 'casa': return [['tipo', type], ['m²', m2], ['m² útiles', useful], ['parcela', plot], ['habitaciones', rooms], ['baños', baths], ['planta', floor], ['año', year],
        ['características', features.length ? 'x' : ''], ['certificado', energy ?? ''], ['tipo de calefacción', heatType ?? ''], ['aire', cooling ?? ''],
        ['localidad', municipality ?? ''], ['zona', zone], ['dirección', address]]
      case 'cuentas': return [['precio', amount], ['hipoteca', mortgage], ['comunidad', fee], ['IBI', ibi], ['luz', power], ['agua', water], ['calefacción', heating]]
      case 'texto': return [['descripción', description], ['referencia', ref]]
      default: return []
    }
  }
  const cnt = (id: string) => { const f = fieldsOf(id); return { filled: f.filter(([, v]) => v.trim()).length, total: f.length } }
  const flashedIn = (id: string) => fieldsOf(id).some(([k]) => flash[k])
  const missingForAi = VSECTIONS.flatMap(sec => fieldsOf(sec.id)).filter(([k, v]) => !v.trim() && k !== 'hipoteca').map(([k]) => k)
  const fl = (k: string) => flash[k]
  const dirty = useDirty({ url, amount, published, title, type, address, zone, municipality, m2, useful, plot, rooms, baths, floor, reformYear, buildingRehab, orientation, building, derrama, noise, light, features, energy, heatType, cooling,
    fee, ibi, power, water, heating, year, ref, description, notes, mortgage, costs, shots: shots.length, ad: adPhotos.length, extraLinks, links })
  const requestClose = () => { if (dirty && !busy) setLeaving(true); else onClose() }


  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = amount.trim() ? parsePrice(amount) : null
    if (amount.trim() && !cents) { setError('El precio no es válido'); return }
    const ints = [rooms, baths, year].map(x => (x.trim() ? parseInt(x, 10) : null))
    if (ints.some(x => x != null && (isNaN(x) || x < 0))) { setError('Revisa habitaciones, baños y año'); return }
    const sizes = [m2, useful, plot].map(num)
    if (sizes.some(x => x != null && (isNaN(x) || x <= 0))) { setError('Revisa los metros'); return }
    // El enlace del anuncio queda como el primero de «Dónde está anunciado»
    const norm = (u: string) => (/^https?:\/\//i.test(u) ? u.replace(/^http:/i, 'https:') : `https://${u}`)
    const edited = links.filter(x => x.url.trim()).map(x => ({ ...x, label: x.label.trim(), url: norm(x.url.trim()) }))
    const clean = url.trim() ? norm(url.trim()) : ''
    // El del recuadro del anuncio se añade si es nuevo (si lo habéis quitado de la lista y no lo tocáis, no vuelve)
    if (clean && clean !== firstLink && !edited.some(x => x.url === clean)) edited.unshift({ label: '', url: clean })
    const allLinks = mergeLinks(edited, extraLinks)
    const mortgageCents = mortgage.trim() ? parsePrice(mortgage) : null
    if (mortgage.trim() && mortgageCents == null) { setError('La hipoteca pendiente no es válida'); return }
    const costList = costs.filter(c => c.label.trim()).map(c => ({ label: c.label.trim().slice(0, 60), cents: c.amount.trim() ? parsePrice(c.amount) ?? 0 : 0 }))
    setBusy('Guardando…'); setError('')
    const err = await m.write('sale_listing', {
      household_id: householdId, price_cents: cents, published_on: published || null, links: allLinks.slice(0, 10),
      title: title.trim() || null, property_type: type.trim() || null, address: address.trim() || null, zone: zone.trim() || null,
      municipality, province: municipality ? 'Madrid' : null, size_m2: sizes[0], useful_m2: sizes[1], plot_m2: sizes[2],
      rooms: ints[0], baths: ints[1], floor: floor.trim() || null, features, energy, heating_type: heatType, cooling,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, ibi_cents: ibi.trim() ? parsePrice(ibi) : null,
      electricity_cents: power.trim() ? parsePrice(power) : null, water_cents: water.trim() ? parsePrice(water) : null, heating_cents: heating.trim() ? parsePrice(heating) : null,
      year_built: ints[2], reform_year: /^\d{4}$/.test(reformYear.trim()) ? Number(reformYear.trim()) : null, building_reform_year: /^\d{4}$/.test(buildingRehab.trim()) ? Number(buildingRehab.trim()) : null, orientation, building_state: building, derrama_cents: derrama.trim() ? parsePrice(derrama) : null, noise, light, listing_ref: ref.trim() || null, description: description.trim() || null,
      notes: notes.trim() || null, mortgage_cents: mortgageCents, costs: costList
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
    <Sheet title="Ficha de nuestro anuncio" onClose={requestClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Ej. Chalet con piscina en Las Cuestas" flash={fl('título')} />
        {summary && (
          <ImportSummary filled={summary.filled} diffs={summary.diffs}
            missing={VSECTIONS.map(sec => ({ id: sec.id, title: sec.title, n: cnt(sec.id).total - cnt(sec.id).filled }))}
            onGo={id => sections.reveal([id], id)} />
        )}
        <EditSection id="anuncio" icon="📥" title="Rellenar desde el anuncio" open={sections.isOpen('anuncio')} onToggle={() => sections.toggle('anuncio')}>
          <ListingImport bare url={url} onUrl={setUrl} onApply={apply} shots={shots} onShots={setShots} adPhotos={adPhotos} onAdPhotos={setAdPhotos} onLinks={setExtraLinks}
            ourPrice={amount.trim() ? parsePrice(amount) : null} missing={l ? missingForAi : undefined}
            known={knownForAi({
              'Precio': amount && `${amount} €`, 'Título': title, 'Tipo': type, 'Dirección': address, 'Zona': zone, 'Localidad': municipality,
              'Metros construidos': m2, 'Metros útiles': useful, 'Parcela (m²)': plot, 'Habitaciones': rooms, 'Baños': baths, 'Planta': floor,
              'Año de construcción': year, 'Extras': features.map(f => FEATURES[f] ?? f).join(', '), 'Certificado energético': energy,
              'Calefacción': heatType && HEATING[heatType], 'Aire acondicionado': cooling && COOLING[cooling],
              'Comunidad (€/mes)': fee, 'IBI (€/año)': ibi, 'Luz (€/mes)': power, 'Agua (€/mes)': water, 'Calefacción (€/mes)': heating, 'Referencia': ref
            })} />
        </EditSection>

        <EditSection id="casa" icon="🏠" title="Nuestra casa" {...cnt('casa')} flashed={flashedIn('casa')} open={sections.isOpen('casa')} onToggle={() => sections.toggle('casa')}>
          <Field label="Tipo" value={type} onChange={e => setType(e.target.value)} maxLength={60} placeholder="Piso, chalet independiente, ático…" flash={fl('tipo')} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Construidos" suffix="m²" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} flash={fl('m²')} />
            <Field label="Útiles" suffix="m²" inputMode="decimal" value={useful} onChange={e => setUseful(e.target.value)} flash={fl('m² útiles')} />
            <Field label="Parcela" suffix="m²" inputMode="decimal" value={plot} onChange={e => setPlot(e.target.value)} flash={fl('parcela')} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Hab." inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} flash={fl('habitaciones')} />
            <Field label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} flash={fl('baños')} />
            <Field label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} flash={fl('planta')} />
            <Field label="Año finca" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} flash={fl('año')} />
          </div>
          <SubHead id="casa-equip">Equipamiento</SubHead>
          <GroupedChips label={`Tiene${fl('características') ? ' ✨' : ''}`} value={features} onChange={setFeatures}
            groups={FEATURE_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => k !== 'cerca_cole') }))} labels={k => FEATURES[k] ?? k}  sets={HOUSE_ONE_OF} oneOf />
          <div className="grid grid-cols-2 gap-3">
            <SelectField<string> label="Certificado energético" value={energy} onChange={setEnergy} flash={fl('certificado')}
              options={'ABCDEFG'.split('').map(x => ({ value: x, label: x }))} />
            <SelectField<HeatingType> label="Calefacción" value={heatType} onChange={setHeatType} flash={fl('tipo de calefacción')}
              options={(Object.keys(HEATING) as HeatingType[]).map(k => ({ value: k, label: HEATING[k] }))} />
            <SelectField<Cooling> label="Aire acondicionado" value={cooling} onChange={setCooling} flash={fl('aire')}
              options={(['splits', 'conductos', 'aerotermia', 'si', 'no'] as Cooling[]).map(k => ({ value: k, label: COOLING[k] }))} />
          </div>
          <SubHead id="casa-valor">⚖️ Lo que pesa en el precio</SubHead>
          <p className="text-xs text-muted -mt-2">Se usa en «¿Estamos en precio?» para comparar con pisos parecidos más allá del €/m².</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Reforma del piso (año)" inputMode="numeric" value={reformYear} onChange={e => setReformYear(e.target.value)} placeholder="Ej. 2018" />
            <SelectField label="Orientación" value={orientation} onChange={v => setOrientation(v)} empty="Sin saber"
              options={['sur', 'sureste', 'suroeste', 'este', 'oeste', 'norte', 'noreste', 'noroeste'].map(x => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField<Noise> label="Ruido de la calle" value={noise} onChange={setNoise} options={(Object.keys(NOISE_LABEL) as Noise[]).map(k => ({ value: k, label: NOISE_LABEL[k] }))} />
            <SelectField<Light> label="Luz" value={light} onChange={setLight} options={(Object.keys(LIGHT_LABEL) as Light[]).map(k => ({ value: k, label: LIGHT_LABEL[k] }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField<BuildingState> label="Estado del edificio" value={building} onChange={setBuilding} options={(Object.keys(BUILDING_LABEL) as BuildingState[]).map(k => ({ value: k, label: BUILDING_LABEL[k] }))} />
            <Field label="Derrama pendiente" suffix="€" inputMode="decimal" value={derrama} onChange={e => setDerrama(e.target.value)} placeholder="Si la hay" />
          </div>
          <Field label="Rehabilitación de la finca (año)" inputMode="numeric" value={buildingRehab} onChange={e => setBuildingRehab(e.target.value)} placeholder="Fachada, cubierta, ascensor… Ej. 1995" />
          <SubHead id="casa-ubicacion">📍 Ubicación</SubHead>
          <div className={`rounded-xl ${fl('localidad') ? 'ring-2 ring-accent' : ''}`}>
            <Combobox label="Localidad" value={municipality} onChange={setMunicipality} options={TOWNS} placeholder="Escribe: Galap…" />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona, urbanización o barrio'}{fl('zona') ? ' ✨' : ''}</span>
            <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'venta-distritos' : undefined}
              className={`w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent ${fl('zona') ? 'ring-2 ring-accent' : ''}`} />
            {municipality === 'Madrid' && <datalist id="venta-distritos">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
          </label>
          <Field label="Dirección" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} flash={fl('dirección')} />
        </EditSection>

        <EditSection id="cuentas" icon="💶" title="¿Cuánto nos queda?" {...cnt('cuentas')} flashed={flashedIn('cuentas')} open={sections.isOpen('cuentas')} onToggle={() => sections.toggle('cuentas')}>
          <SubHead id="cuentas-precio" first>🏷️ Precio</SubHead>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio publicado" suffix="€" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} onBlur={() => setAmount(thousands)} placeholder="285.000" flash={fl('precio')} />
            <Field label="Publicado desde" type="date" value={published} onChange={e => setPublished(e.target.value)} />
          </div>
          <p className="text-xs text-muted -mt-2">Cada cambio de precio queda guardado en el historial.</p>
          <SubHead id="cuentas-venta">🏦 Hipoteca y gastos de la venta</SubHead>
          <Field label="Hipoteca pendiente" suffix="€" inputMode="decimal" value={mortgage} onChange={e => setMortgage(e.target.value)} onBlur={() => setMortgage(thousands)} placeholder="Lo que dice el certificado de deuda" />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-muted mb-1">Gastos de la venta</legend>
            {costs.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input value={c.label} onChange={e => setCosts(costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={60}
                  className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[15px]" aria-label="Concepto" />
                <input value={c.amount} onChange={e => setCosts(costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="€"
                  className="w-28 min-h-11 px-3 rounded-xl border border-line bg-card text-[15px] text-right" aria-label={`Importe de ${c.label}`} />
                <button type="button" onClick={() => setCosts(costs.filter((_, j) => j !== i))} aria-label="Quitar" className="w-9 text-muted text-xl">×</button>
              </div>
            ))}
            {costs.length < 20 && (
              <button type="button" onClick={() => setCosts([...costs, { label: '', amount: '' }])} className="min-h-10 rounded-xl border border-dashed border-line text-sm font-semibold text-accent">+ Añadir gasto</button>
            )}
          </fieldset>
          <SubHead id="cuentas-mes">📆 Gastos al mes (lo que verá el comprador)</SubHead>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comunidad" suffix="€/mes" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} flash={fl('comunidad')} />
            <Field label="IBI" suffix="€/año" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} onBlur={() => setIbi(thousands)} flash={fl('IBI')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Luz" suffix="€" inputMode="decimal" value={power} onChange={e => setPower(e.target.value)} flash={fl('luz')} />
            <Field label="Agua" suffix="€" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} flash={fl('agua')} />
            <Field label="Calefacción" suffix="€" inputMode="decimal" value={heating} onChange={e => setHeating(e.target.value)} flash={fl('calefacción')} />
          </div>
          <p className="text-xs text-muted -mt-2">Gasto medio al mes de vuestras facturas: a los compradores les interesa y sale en el dossier.</p>
        </EditSection>

        <EditSection id="texto" icon="📝" title="Descripción y referencia" {...cnt('texto')} flashed={flashedIn('texto')} open={sections.isOpen('texto')} onToggle={() => sections.toggle('texto')}>
          <Field label="Referencia del anuncio" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} flash={fl('referencia')} />
          <TextArea label="Descripción del anuncio" value={description} onChange={e => setDescription(e.target.value)} maxLength={5000}
            placeholder="El texto que tenéis publicado (sirve también para el dossier)" />
        </EditSection>

        <EditSection id="enlaces" icon="🔗" title="Enlaces" open={sections.isOpen('enlaces')} onToggle={() => sections.toggle('enlaces')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-muted mb-1">Dónde está anunciada (el primero es el principal)</legend>
            {links.map((lk, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={lk.label} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 40) } : x)))} placeholder={portalName(lk.url) ?? 'Nombre'}
                  aria-label="Nombre del enlace" className="w-28 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold" />
                <input value={lk.url} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" inputMode="url"
                  aria-label="Enlace" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px]" />
                <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Quitar enlace" className="w-9 text-muted text-xl">×</button>
              </div>
            ))}
            {links.length === 0 && <p className="text-[13px] text-muted">Sin enlaces todavía.</p>}
            {links.length < 10 && <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="self-start min-h-10 text-sm text-accent font-semibold">+ Añadir enlace (otro portal, la inmobiliaria…)</button>}
          </fieldset>
        </EditSection>

        <TextArea label="Notas privadas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Precio mínimo que aceptaríamos, qué incluye… (no sale en el dossier)" />
        <SaveBar dirty={dirty} busy={!!busy} status={busy} error={error} leaving={leaving} onStay={() => setLeaving(false)} onLeave={onClose} />
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
  const [view, setViewRaw] = useState<SalePhoto | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const setView = (p: SalePhoto | null) => { setConfirmDel(false); setViewRaw(p) }
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
          <div className="flex justify-between items-center px-3 pb-3 pt-[max(env(safe-area-inset-top),12px)]" onClick={e => e.stopPropagation()}>
            <div className="flex gap-1">
              {confirmDel ? (
                <button onClick={async () => { await m.removeSalePhoto(view); setView(null) }} className="min-h-11 px-4 rounded-xl bg-danger text-white text-sm font-bold">¿Seguro? Borrar</button>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="min-h-11 px-4 rounded-xl bg-white/15 text-white text-sm font-semibold">🗑️ Borrar</button>
              )}
              {urls[view.id] && <a href={urls[view.id]} download target="_blank" rel="noopener noreferrer" className="min-h-11 px-3 text-sm font-semibold text-white flex items-center">Descargar</a>}
            </div>
            <button onClick={() => setView(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
          </div>
          <div className={`flex-1 p-2 pb-[max(env(safe-area-inset-bottom),8px)] ${ad ? 'overflow-y-auto' : 'flex items-center justify-center'}`}>
            {urls[view.id] && <img src={urls[view.id]} alt="" className={ad ? 'w-full h-auto' : 'max-w-full max-h-full object-contain'} />}
          </div>
        </div>
      )}
    </section>
  )
}
