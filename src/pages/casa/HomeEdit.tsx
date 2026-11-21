// Alta y edición de una casa (datos, gastos, contacto, fotos, reforma, honorarios…)
import { today } from '../../lib/dates'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { aiPrompt, parseAny, type ListingData } from '../../lib/listingParse'
import { readImages } from '../../lib/ocr'
import { locateHome } from '../../lib/geo'

import { isMapsUrl } from '../../lib/kids'
import { COOLING, FEATURES, HEATING, mergeLinks, parsePrice, portalName, priceInput, priceShort, type Cooling, type HeatingType, type Home, type Link, type Mudanza } from '../../lib/mudanza'
import { Choice, Sheet, TextArea, TextField } from '../../components/Sheet'
import Combobox from '../../components/Combobox'
import { aiStatus, type Health, type Market } from '../../lib/health'
import { mergeAiReform, type Reform } from '../../lib/reforma'
import { ReformaEditor } from './HomeReforma'
import { EquipChips } from './EquipChips'
import { EditSection, Field, ImportSummary, SaveBar, SelectField, thousands, useDirty, useFlash, useSections, SubHead } from '../../components/FormKit'
import { AdPhotoFetch, AiChanges, AiSources, ImportDiffs, knownForAi, importMessage, merger, sourcesToLinks, type ImportDiff } from '../../components/ListingImport'
import type { AiSource } from '../../lib/listingParse'
import { MADRID_DISTRICTS } from '../../data/places'
import { PROVINCE_NAMES, municipalitiesOf, num } from './BuscamosComun'
import { Photos, type EditFocus } from './HomeFicha'
import { SECTIONS } from './Criterios'

export type Shared = { url?: string | null; text?: string | null; files?: File[] }

export function HomeEditSheet({ home, initial, m, householdId, onClose, onCreated, focus }: {
  home?: Home; initial?: Shared; m: Mudanza; householdId: string; onClose: () => void; onCreated: () => void; focus?: EditFocus
}) {
  // Bloques: en un piso nuevo, abiertos «anuncio» y «lo básico»; al venir del ✏️ de la ficha, solo ese bloque
  // Mismos bloques y en el mismo orden que la ficha; el ✏️ de cada tarjeta lleva a su sitio (bloque y apartado)
  const target = focus ? ({
    datos: ['casa', 'casa'], gastos: ['dinero', 'dinero-mes'], reforma: ['reforma', 'reforma'], honorarios: ['dinero', 'dinero-honorarios'],
    compra: ['dinero', 'dinero-compra'], zona: ['zona', 'zona'], contacto: ['contacto', 'contacto'], fotos: ['enlaces', 'enlaces'], enlaces: ['enlaces', 'enlaces']
  } as const)[focus] : null
  const focusSection = target?.[0] ?? null
  const anchor = target?.[1] ?? null
  const sections = useSections(home ? (focusSection ? [focusSection] : []) : ['anuncio', 'casa'])
  useEffect(() => {
    if (!anchor) return
    const t = setTimeout(() => document.getElementById(`edit-${anchor}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [anchor])
  const { flash, show: showFlash } = useFlash()
  const [summary, setSummary] = useState<{ filled: number; diffs: number } | null>(null)
  const [leaving, setLeaving] = useState(false)
  // Capturas del anuncio: se leen en el móvil para rellenar la ficha y se guardan con el piso al guardar
  const [shots, setShots] = useState<File[]>([])
  // Fotos traídas desde los enlaces que dé la IA (se guardan como fotos del piso)
  const [photoLinks, setPhotoLinks] = useState<string[]>([])
  const [diffs, setDiffs] = useState<ImportDiff[]>([])
  const [sources, setSources] = useState<AiSource[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [links, setLinks] = useState<Link[]>(home?.links ?? [])
  // Lo que diga la IA de ITE, urbanización, VPO… (no pisa lo que hayáis puesto a mano) y la referencia catastral
  const [health, setHealth] = useState<Health>(home?.health ?? {})
  const [cadRef, setCadRef] = useState<string | null>(home?.cadastral_ref ?? null)
  const [market, setMarket] = useState<Market | null>(home?.market ?? null)
  const [changes, setChanges] = useState<string | undefined>()
  const [adPhotos, setAdPhotos] = useState<File[]>([])
  const [ocr, setOcr] = useState<string | null>(null)
  const [title, setTitle] = useState(home?.title ?? '')
  const [url, setUrl] = useState(home?.url ?? initial?.url ?? '')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState(false)
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [amount, setAmount] = useState(priceInput(home?.price_cents))
  const [m2, setM2] = useState(home?.size_m2 != null ? String(Number(home.size_m2)).replace('.', ',') : '')
  const [useful, setUseful] = useState(home?.useful_m2 != null ? String(Number(home.useful_m2)).replace('.', ',') : '')
  const [plot, setPlot] = useState(home?.plot_m2 != null ? String(Number(home.plot_m2)).replace('.', ',') : '')
  const [year, setYear] = useState(home?.year_built?.toString() ?? '')
  const [rooms, setRooms] = useState(home?.rooms?.toString() ?? '')
  const [baths, setBaths] = useState(home?.baths?.toString() ?? '')
  const [floor, setFloor] = useState(home?.floor ?? '')
  const [zone, setZone] = useState(home?.zone ?? '')
  const [province, setProvince] = useState<string | null>(home?.province ?? 'Madrid')
  const [municipality, setMunicipality] = useState<string | null>(home?.municipality ?? null)
  const [address, setAddress] = useState(home?.address ?? '')
  const [maps, setMaps] = useState(home?.maps_url ?? '')
  const [features, setFeatures] = useState<string[]>(home?.features ?? [])
  const [fee, setFee] = useState(priceInput(home?.community_fee_cents))
  const [ibi, setIbi] = useState(priceInput(home?.ibi_cents))
  const [power, setPower] = useState(priceInput(home?.electricity_cents))
  const [water, setWater] = useState(priceInput(home?.water_cents))
  const [heating, setHeating] = useState(priceInput(home?.heating_cents))
  const [energy, setEnergy] = useState<string | null>(home?.energy ?? null)
  const [heatType, setHeatType] = useState<HeatingType | null>(home?.heating_type ?? null)
  const [cooling, setCooling] = useState<Cooling | null>(home?.cooling ?? null)
  const [minutes, setMinutes] = useState(home?.minutes_to_school?.toString() ?? '')
  const [contact, setContact] = useState(home?.contact ?? '')
  const [advertiser, setAdvertiser] = useState<'agencia' | 'particular' | null>(home?.advertiser ?? null)
  const [agency, setAgency] = useState(home?.agency ?? '')
  const [phone, setPhone] = useState(home?.contact_phone ?? '')
  const [email, setEmail] = useState(home?.contact_email ?? '')
  const [listingRef, setListingRef] = useState(home?.listing_ref ?? '')
  const [listedOn, setListedOn] = useState(home?.listed_on ?? '')
  const [feeKind, setFeeKind] = useState<'no' | 'pct' | 'fijo' | null>(home?.buyer_fee_kind ?? null)
  const [feePct, setFeePct] = useState(home?.buyer_fee_pct != null ? String(Number(home.buyer_fee_pct)).replace('.', ',') : '')
  const [feeAmount, setFeeAmount] = useState(priceInput(home?.buyer_fee_cents))
  const [feeVat, setFeeVat] = useState(home?.buyer_fee_vat ?? true)
  const [feeNote, setFeeNote] = useState(home?.buyer_fee_note ?? '')
  const [notes, setNotes] = useState(home?.notes ?? '')
  const [refValue, setRefValue] = useState(priceInput(home?.ref_value_cents))
  const [newBuild, setNewBuild] = useState(home?.new_build ?? false)
  // La reforma: se edita aquí (bloque «Reforma») y la IA puede proponer partidas
  const [reform, setReform] = useState<Reform>(() => ({ ...(home?.reform ?? {}) }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /** Rellena la ficha con lo que se haya sacado del anuncio (solo los datos encontrados) */
  /** Rellena solo lo vacío; lo que ya tenía otro valor se ofrece aparte (no se machaca) */
  function apply(d: ListingData) {
    if (d.photo_urls?.length) setPhotoLinks(l => [...new Set([...l, ...d.photo_urls!])].slice(0, 20))
    if (d.sources?.length) {
      setSources(d.sources)
      setPicked(d.sources.map(x => x.url).filter(u => u.replace(/\?.*$/, '') !== url.trim().replace(/\?.*$/, '')))
    }
    if (d.changes) setChanges(d.changes)
    if (d.reform) setReform(r => mergeAiReform(r, d.reform!))
    if (d.cadastral_ref && !cadRef) setCadRef(d.cadastral_ref)
    if (d.zone_m2_eur || d.asking_m2_eur) {
      setMarket(mk => ({
        ...(mk ?? {}), at: new Date().toISOString(),
        ...(d.zone_m2_eur ? { paid_m2: d.zone_m2_eur, paid_note: d.zone_m2_note } : {}),
        ...(d.asking_m2_eur ? { asking_m2: d.asking_m2_eur, asking_note: d.asking_m2_note } : {})
      }))
    }
    if (d.solar_note && health.solar?.src !== 'manual') setHealth(hl => ({ ...hl, solar: { s: 'ok', n: d.solar_note!, src: 'ia' } }))
    if (d.checks) {
      const next: Health = { ...health, ...(d.solar_note && health.solar?.src !== 'manual' ? { solar: { s: 'ok' as const, n: d.solar_note, src: 'ia' as const } } : {}) }
      for (const [k, text] of Object.entries(d.checks ?? {})) {
        if (next[k]?.src === 'manual') continue
        next[k] = { s: aiStatus(k, text), n: text.replace(/^\s*(BIEN|REVISAR|PROBLEMA|NO CONSTA)\s*[—–:-]*\s*/i, '').slice(0, 400) || text.slice(0, 400), src: 'ia', ...(next[k]?.files ? { files: next[k].files } : {}) }
      }
      setHealth(next)
    }
    const f = merger()
    const eur = (v?: number) => (v ? priceInput(Math.round(v * 100)) : null)
    f.put('nombre', title, d.title, setTitle, { diff: false })
    f.put('precio', amount, eur(d.price_eur), setAmount)
    f.put('m²', m2, d.size_m2 ? String(d.size_m2).replace('.', ',') : null, setM2)
    f.put('m² útiles', useful, d.useful_m2 ? String(d.useful_m2).replace('.', ',') : null, setUseful)
    f.put('parcela', plot, d.plot_m2 ? String(d.plot_m2).replace('.', ',') : null, setPlot)
    f.put('año', year, d.year_built ? String(d.year_built) : null, setYear)
    f.put('habitaciones', rooms, d.rooms != null ? String(d.rooms) : null, setRooms)
    f.put('baños', baths, d.baths != null ? String(d.baths) : null, setBaths)
    f.put('planta', floor, d.floor, setFloor)
    f.put('localidad', municipality, d.municipality, v => { setProvince('Madrid'); setMunicipality(v) })
    f.put('zona', zone, d.zone?.slice(0, 60), setZone)
    f.put('dirección', address, d.address?.slice(0, 120), setAddress)
    f.put('certificado', energy, d.energy, setEnergy)
    f.put('tipo de calefacción', heatType ? HEATING[heatType] : null, d.heating_type ? HEATING[d.heating_type] : null, () => setHeatType(d.heating_type!))
    f.put('aire', cooling ? COOLING[cooling] : null, d.cooling ? COOLING[d.cooling] : null, () => setCooling(d.cooling!))
    f.put('comunidad', fee, eur(d.community_eur), setFee)
    f.put('IBI', ibi, eur(d.ibi_eur), setIbi)
    f.put('luz', power, eur(d.power_eur), setPower)
    f.put('agua', water, eur(d.water_eur), setWater)
    f.put('calefacción', heating, eur(d.heating_eur), setHeating)
    f.put('notas', notes, d.notes, setNotes, { diff: false })
    f.put('anunciante', advertiser, d.advertiser, v => setAdvertiser(v as 'agencia' | 'particular'))
    if (d.buyer_fee && !feeKind) {
      setFeeKind(d.buyer_fee.kind)
      if (d.buyer_fee.pct != null) setFeePct(String(d.buyer_fee.pct).replace('.', ','))
      if (d.buyer_fee.eur != null) setFeeAmount(priceInput(Math.round(d.buyer_fee.eur * 100)))
      if (d.buyer_fee.vat_included) setFeeVat(false)
      if (d.buyer_fee.note) setFeeNote(`IA: ${d.buyer_fee.note}`.slice(0, 300))
      f.filled.push('honorarios')
    }
    f.put('agencia', agency, d.agency?.slice(0, 120), setAgency)
    f.put('contacto', contact, d.contact?.slice(0, 120), setContact)
    f.put('teléfono', phone, d.phone?.slice(0, 30), setPhone)
    f.put('email', email, d.email?.slice(0, 120), setEmail)
    f.put('referencia', listingRef, d.ref?.slice(0, 60), setListingRef)
    // Las características solo se añaden (nunca se quita ninguna)
    const newF = (d.features ?? []).filter(x => !features.includes(x))
    if (newF.length) { setFeatures([...features, ...newF]); f.filled.push('características') }
    setDiffs(f.diffs)
    const touched = [...f.filled, ...f.diffs.map(x => x.label)]
    showFlash(f.filled, f.diffs.map(x => x.label))
    sections.reveal(SECTIONS.filter(sec => fieldsOf(sec.id).some(([k]) => touched.includes(k))).map(sec => sec.id))
    if (touched.length) setSummary({ filled: f.filled.length, diffs: f.diffs.length })
    return f
  }

  // Qué datos tiene cada bloque (para el contador, el resumen y «pedir solo lo que falta»)
  function fieldsOf(id: string): [string, string][] {
    switch (id) {
      case 'casa': return [['precio', amount], ['m²', m2], ['parcela', plot], ['m² útiles', useful], ['año', year], ['habitaciones', rooms], ['baños', baths], ['planta', floor],
        ['características', features.length ? 'x' : ''], ['certificado', energy ?? ''], ['tipo de calefacción', heatType ?? ''], ['aire', cooling ?? '']]
      case 'dinero': return [...(advertiser === 'particular' ? [] : [['honorarios', feeKind ?? ''] as [string, string]]),
        ['comunidad', fee], ['IBI', ibi], ['luz', power], ['agua', water], ['calefacción', heating]]
      case 'zona': return [['localidad', municipality ?? ''], ['zona', zone], ['dirección', address], ['mapa', maps], ['minutos al cole', minutes]]
      case 'contacto': return [['anunciante', advertiser ?? ''], ['agencia', advertiser === 'particular' ? 'x' : agency || contact], ['teléfono', phone], ['email', email], ['referencia', listingRef]]
      default: return []
    }
  }
  const countOf = (id: string) => { const f = fieldsOf(id); return { filled: f.filter(([, v]) => v.trim()).length, total: f.length } }
  const flashedIn = (id: string) => fieldsOf(id).some(([k]) => flash[k])
  const missingForAi = SECTIONS.flatMap(sec => fieldsOf(sec.id)).filter(([k, v]) => !v.trim() && !['mapa', 'minutos al cole', 'anunciante'].includes(k)).map(([k]) => k)

  const dirty = useDirty({ title, url, amount, m2, useful, plot, year, rooms, baths, floor, zone, province, municipality, address, maps, features, fee, ibi, power, water, heating,
    energy, heatType, cooling, minutes, contact, advertiser, agency, phone, email, listingRef, feeKind, feePct, feeAmount, feeVat, feeNote, notes, links, shots: shots.length, ad: adPhotos.length, picked, health, cadRef, market, reform, refValue, newBuild })
  const requestClose = () => { if (dirty && !busy) setLeaving(true); else onClose() }

  function fromText(text: string, intro = 'Rellenado') {
    const r = apply(parseAny(text))
    setImportNote(importMessage(intro, r.filled, r.diffs.length))
    return r.filled
  }

  /** Intenta leer el anuncio desde el servidor; muchos portales (Idealista sobre todo) solo dejan ver la vista previa */
  async function readLink(link = url) {
    const full = link.trim() && (/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`)
    if (!full) return
    setReading(true); setImportNote(null)
    const { data, error } = await supabase.functions.invoke('listing-preview', { body: { url: full } })
    setReading(false)
    const res = data as { blocked?: boolean; error?: string; title?: string; description?: string; text?: string } | null
    if (error || !res || res.blocked || res.error) {
      setImportNote({ ok: false, text: res?.error && !res.blocked ? res.error : 'El portal no deja leer el anuncio desde la app. Pídeselo a una IA con los botones de abajo, o sube capturas.' })
      return
    }
    const got = fromText([res.title, res.description, res.text].filter(Boolean).join('\n'), 'Leído del anuncio')
    if (got.length && !got.includes('precio') && !amount.trim()) {
      setImportNote({ ok: true, text: `Leído del anuncio: ${got.join(', ')}. El portal no deja ver el resto: para el precio y la ficha completa, pídeselo a una IA con los botones de abajo.` })
    }
  }

  /** Abre ChatGPT, Gemini o Claude con la petición ya escrita (y copiada, por si la app no la recoge) */
  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude', onlyMissing = false) {
    const full = url.trim() && (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
    if (!full) return
    const prompt = aiPrompt(full.replace(/\?.*$/, ''), knownForAi({
      'Precio': amount && `${amount} €`, 'Tipo y nombre': title, 'Dirección': address, 'Zona': zone, 'Localidad': municipality,
      'Metros construidos': m2, 'Metros útiles': useful, 'Parcela (m²)': plot, 'Habitaciones': rooms, 'Baños': baths, 'Planta': floor,
      'Año de construcción': year, 'Extras': features.map(f => FEATURES[f] ?? f).join(', '), 'Certificado energético': energy,
      'Calefacción': heatType && HEATING[heatType], 'Aire acondicionado': cooling && COOLING[cooling],
      'Comunidad (€/mes)': fee, 'IBI (€/año)': ibi, 'Luz (€/mes)': power, 'Agua (€/mes)': water, 'Calefacción (€/mes)': heating,
      'Anunciante': advertiser, 'Agencia': agency, 'Referencia': listingRef
    }), onlyMissing ? missingForAi : undefined)
    try { await navigator.clipboard.writeText(prompt) } catch { /* sin permiso: se abre igualmente */ }
    const q = encodeURIComponent(prompt)
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setImportNote({ ok: true, text: ai === 'gemini'
      ? 'Petición copiada: pégala en Gemini. Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».'
      : 'Si no aparece escrita, pégala (está copiada). Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».' })
    window.open(target, '_blank', 'noopener')
  }

  /** Lee lo copiado (la respuesta de la IA o el texto del anuncio) y rellena la ficha */
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('vacío')
      setPasted(text)
      fromText(text, 'Rellenado con la respuesta')
    } catch {
      setPasteOpen(true)
      setImportNote({ ok: false, text: 'No he podido leer lo copiado. Mantén pulsado el cuadro de abajo y elige «Pegar».' })
    }
  }

  async function addShots(list: File[]) {
    const imgs = list.filter(f => f.type.startsWith('image/')).slice(0, 10 - shots.length)
    if (!imgs.length) return
    setShots(s => [...s, ...imgs])
    setImportNote(null)
    try {
      setOcr('Preparando el lector de texto…')
      const text = await readImages(imgs, p => setOcr(`Leyendo captura ${p.image} de ${p.total}… ${p.pct}%`))
      setOcr(null)
      setPasted(prev => [prev, text].filter(Boolean).join('\n'))
      fromText([pasted, text].filter(Boolean).join('\n'), 'Leído de las capturas')
    } catch {
      setOcr(null)
      setImportNote({ ok: false, text: 'No se han podido leer las capturas. Se guardarán igualmente con el piso; puedes rellenar a mano o pegar el texto.' })
    }
  }

  // Si viene de «Compartir», se rellena solo
  useEffect(() => {
    if (!initial) return
    if (initial.files?.length) void addShots(initial.files)
    if (initial.text) fromText(initial.text, 'Rellenado con lo compartido')
    // Con capturas ya está todo: no hace falta intentar leer el enlace (Idealista suele bloquearlo)
    if (initial.url && !initial.files?.length) void readLink(initial.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre para reconocerlo (ej. «3 hab. calle Mayor»)'); return }
    const priceCents = amount.trim() ? parsePrice(amount) : null
    if (amount.trim() && !priceCents) { setError('El precio no es válido'); return }
    const cleanUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : null
    if (phone.trim() && !/^[0-9 +().-]{3,30}$/.test(phone.trim())) { setError('El teléfono solo puede llevar números, espacios y +'); return }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('El email no es válido'); return }
    if (maps.trim() && !isMapsUrl(maps.trim())) { setError('El enlace de mapa debe ser de Google Maps (Compartir → Copiar enlace)'); return }
    const ints = [rooms, baths, minutes].map(x => (x.trim() ? parseInt(x, 10) : null))
    if (ints.some(x => x != null && (isNaN(x) || x < 0))) { setError('Revisa habitaciones, baños y minutos'); return }
    const size = num(m2)
    if (size != null && (isNaN(size) || size <= 0)) { setError('Los metros no son válidos'); return }
    const usefulM2 = num(useful), plotM2 = num(plot)
    if ([usefulM2, plotM2].some(x => x != null && (isNaN(x) || x <= 0))) { setError('Revisa los metros útiles y de parcela'); return }
    const yearN = year.trim() ? parseInt(year, 10) : null
    if (yearN != null && (isNaN(yearN) || yearN < 1700 || yearN > 2100)) { setError('El año de construcción no es válido'); return }
    if (refValue.trim() && parsePrice(refValue) == null) { setError('El valor de referencia del Catastro no es válido'); return }
    setBusy(true); setError('')
    const data = {
      title: title.trim(), url: cleanUrl, price_cents: priceCents, size_m2: size, useful_m2: usefulM2, plot_m2: plotM2, year_built: yearN, rooms: ints[0], baths: ints[1], floor: floor.trim() || null,
      zone: zone.trim() || null, province, municipality, address: address.trim() || null, maps_url: maps.trim() || null, features,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, ibi_cents: ibi.trim() ? parsePrice(ibi) : null, energy, heating_type: heatType, cooling,
      electricity_cents: power.trim() ? parsePrice(power) : null, water_cents: water.trim() ? parsePrice(water) : null, heating_cents: heating.trim() ? parsePrice(heating) : null,
      minutes_to_school: ints[2], contact: contact.trim() || null, notes: notes.trim() || null,
      advertiser, agency: advertiser === 'particular' ? null : agency.trim() || null, contact_phone: phone.trim() || null,
      contact_email: email.trim() || null, listing_ref: listingRef.trim() || null, listed_on: listedOn || null,
      buyer_fee_kind: advertiser === 'particular' ? null : feeKind, buyer_fee_vat: feeVat, buyer_fee_note: feeNote.trim() || null,
      buyer_fee_pct: feeKind === 'pct' && feePct.trim() ? Math.min(10, Math.max(0, Number(feePct.replace(',', '.')) || 0)) : null,
      buyer_fee_cents: feeKind === 'fijo' && feeAmount.trim() ? parsePrice(feeAmount) : null,
      ref_value_cents: refValue.trim() ? parsePrice(refValue) : null, new_build: newBuild,
      health, cadastral_ref: cadRef, market, ...(Object.keys(reform).length || home?.reform ? { reform: reform.items ? { ...reform, items: reform.items.slice(0, 40) } : reform } : {}),
      links: mergeLinks(links.filter(l => l.url.trim()).map(l => ({ ...l, label: l.label.trim(),
        url: /^https?:\/\//i.test(l.url.trim()) ? l.url.trim().replace(/^http:/i, 'https:') : `https://${l.url.trim()}` })), sourcesToLinks(sources, picked), [cleanUrl])
    }
    let homeId = home?.id
    let err: string | undefined
    if (home) err = await m.write('homes', data, home.id)
    else { const r = await m.createHome(data); err = r.error; homeId = r.id }
    // Las capturas se suben con el piso ya creado
    if (!err && homeId && shots.length) {
      setOcr(`Guardando ${shots.length} captura${shots.length === 1 ? '' : 's'}…`)
      for (const f of shots) await m.addPhoto(householdId, homeId, f, 'anuncio')
      setOcr(null)
    }
    if (!err && homeId && adPhotos.length) {
      for (const [i, f] of adPhotos.entries()) { setOcr(`Guardando fotos… ${i + 1} de ${adPhotos.length}`); await m.addPhoto(householdId, homeId, f, 'foto') }
      setOcr(null)
    }
    // Situarlo en el mapa en segundo plano (si es nuevo o ha cambiado la dirección)
    if (!err && homeId) {
      const id = homeId
      void locateHome(id, { address: data.address, zone: data.zone, municipality: data.municipality, province: data.province, maps_url: data.maps_url,
        geo_query: home?.geo_query ?? null, lat: home?.lat ?? null }).then(changed => { if (changed) void m.reload() })
    }
    setBusy(false)
    if (err) setError(err); else if (home) onClose(); else onCreated()
  }

  const fl = (k: string) => flash[k]
  const cnt = (id: string) => countOf(id)
  return (
    <Sheet title={home ? 'Editar piso' : 'Nuevo piso'} onClose={requestClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre para reconocerlo" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Ático luminoso calle Mayor" autoFocus={!home && !initial} flash={fl('nombre')} />
        {summary && (
          <ImportSummary filled={summary.filled} diffs={summary.diffs}
            missing={SECTIONS.map(sec => ({ id: sec.id, title: sec.title, n: cnt(sec.id).total - cnt(sec.id).filled }))}
            onGo={id => sections.reveal([id], id)} />
        )}

        <EditSection id="anuncio" icon="📥" title="Rellenar desde el anuncio" open={sections.isOpen('anuncio')} onToggle={() => sections.toggle('anuncio')}>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <TextField label="Enlace del anuncio" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.idealista.com/inmueble/…" />
            </div>
            <button type="button" onClick={() => readLink()} disabled={!url.trim() || reading}
              className="min-h-12 px-3 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold shrink-0 disabled:opacity-40">{reading ? 'Leyendo…' : 'Leer'}</button>
          </div>
          {url.trim() && (() => {
            const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
            const portal = portalName(full)
            return portal
              ? <a href={full} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold -mt-2">✓ Anuncio de {portal} · abrir ↗</a>
              : <span className="text-xs text-danger -mt-2">Ese enlace no parece válido</span>
          })()}
          {url.trim() && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Que una IA lea el anuncio y te dé los datos:</span>
              <div className="grid grid-cols-3 gap-2">
                {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => askAi(k)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">{l} ↗</button>
                ))}
              </div>
              <button type="button" onClick={pasteFromClipboard} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar respuesta de la IA</button>
              {home && missingForAi.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-xs text-muted">🎯 Pedir solo lo que falta ({missingForAi.length}: {missingForAi.slice(0, 4).join(', ')}{missingForAi.length > 4 ? '…' : ''}):</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => askAi(k, true)} className="min-h-10 rounded-xl border border-dashed border-line bg-card text-[13px] font-semibold">{l} ↗</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center gap-2 text-sm font-semibold text-accent cursor-pointer ${ocr ? 'opacity-50 pointer-events-none' : ''}`}>
            📸 {shots.length ? `Añadir más capturas (${shots.length})` : 'Subir capturas del anuncio'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { void addShots(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          </label>
          {shots.length > 0 && !ocr && <p className="text-xs text-muted -mt-2">Las capturas se guardan con el piso al pulsar «Guardar», por si borran el anuncio.</p>}
          {ocr && <p role="status" className="text-xs text-muted">{ocr}</p>}
          {pasteOpen ? (
            <div className="flex flex-col gap-2">
              <TextArea label="Texto del anuncio" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={20000}
                placeholder="Pega aquí el precio, las características básicas, el edificio, el certificado…" />
              <button type="button" onClick={() => fromText(pasted)} disabled={!pasted.trim()}
                className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Rellenar con este texto</button>
            </div>
          ) : (
            <button type="button" onClick={() => setPasteOpen(true)} className="self-start min-h-10 text-sm text-accent font-semibold -mt-2">📋 Pegar el texto del anuncio</button>
          )}
          <AdPhotoFetch urls={photoLinks} photos={adPhotos} onPhotos={setAdPhotos} />
          {importNote && <p role="status" className={`text-xs ${importNote.ok ? 'text-accent' : 'text-danger'}`}>{importNote.text}</p>}
          <ImportDiffs diffs={diffs} onChange={setDiffs} />
          <AiChanges text={changes} />
          <AiSources sources={sources} picked={picked} onPicked={setPicked} ourPrice={amount.trim() ? parsePrice(amount) : null} />
        </EditSection>

        <EditSection id="casa" icon="🏠" title="La casa" {...cnt('casa')} flashed={flashedIn('casa')} open={sections.isOpen('casa')} onToggle={() => sections.toggle('casa')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio" suffix="€" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} onBlur={() => setAmount(thousands)} placeholder="320.000" flash={fl('precio')} />
            <Field label="Construidos" suffix="m²" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} placeholder="95" flash={fl('m²')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Parcela" suffix="m²" inputMode="decimal" value={plot} onChange={e => setPlot(e.target.value)} flash={fl('parcela')} />
            <Field label="Útiles" suffix="m²" inputMode="decimal" value={useful} onChange={e => setUseful(e.target.value)} flash={fl('m² útiles')} />
            <Field label="Año" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} flash={fl('año')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Habitaciones" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} flash={fl('habitaciones')} />
            <Field label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} flash={fl('baños')} />
            <Field label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} placeholder="3º" flash={fl('planta')} />
          </div>
          <SubHead id="casa-equip">Equipamiento</SubHead>
          <EquipChips label={`Tiene${fl('características') || fl('tipo de calefacción') || fl('aire') ? ' ✨' : ''}`} features={features} setFeatures={setFeatures}
            heat={heatType} setHeat={setHeatType} cool={cooling} setCool={setCooling} exclude={features.includes('ascensor') ? [] : ['ascensor']} />
          <SelectField<string> label="Certificado energético" value={energy} onChange={setEnergy} flash={fl('certificado')}
            options={'ABCDEFG'.split('').map(x => ({ value: x, label: x }))} />
        </EditSection>

        <EditSection id="dinero" icon="💶" title="Gastos e impuestos" {...cnt('dinero')} flashed={flashedIn('dinero')} open={sections.isOpen('dinero')} onToggle={() => sections.toggle('dinero')}>
          <SubHead id="dinero-mes" first>📆 Gastos al mes</SubHead>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comunidad" suffix="€/mes" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} flash={fl('comunidad')} />
            <Field label="IBI" suffix="€/año" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} onBlur={() => setIbi(thousands)} flash={fl('IBI')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Luz" suffix="€" inputMode="decimal" value={power} onChange={e => setPower(e.target.value)} flash={fl('luz')} />
            <Field label="Agua" suffix="€" inputMode="decimal" value={water} onChange={e => setWater(e.target.value)} flash={fl('agua')} />
            <Field label="Calefacción" suffix="€" inputMode="decimal" value={heating} onChange={e => setHeating(e.target.value)} flash={fl('calefacción')} />
          </div>
          <p className="text-xs text-muted -mt-2">Luz, agua y calefacción: gasto medio al mes (si la factura es bimestral, divídela entre dos).</p>
          <SubHead id="dinero-honorarios">💼 Honorarios de la agencia</SubHead>
          {advertiser === 'particular'
            ? <p className="text-[13px] text-muted">Lo anuncia un particular: no hay honorarios (se cambia en Contacto).</p>
            : (
            <div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
              <SelectField<'no' | 'pct' | 'fijo'> label="¿Cobran algo al comprador?" value={feeKind} onChange={setFeeKind} empty="Sin preguntar" flash={fl('honorarios')}
                options={[{ value: 'no', label: 'No cobra al comprador' }, { value: 'pct', label: 'Un % del precio' }, { value: 'fijo', label: 'Un importe fijo' }]} />
              {feeKind === 'pct' && <Field label="Porcentaje" inputMode="decimal" value={feePct} onChange={e => setFeePct(e.target.value)} suffix="%" placeholder="3" />}
              {feeKind === 'fijo' && <Field label="Importe" inputMode="decimal" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} onBlur={e => setFeeAmount(thousands(e.target.value))} suffix="€" />}
              {(feeKind === 'pct' || feeKind === 'fijo') && (
                <label className="flex items-center gap-2 text-[14px] min-h-10">
                  <input type="checkbox" checked={feeVat} onChange={e => setFeeVat(e.target.checked)} className="w-5 h-5" />
                  <span>Más IVA (21 %)</span>
                </label>
              )}
              <Field label="Nota" value={feeNote} onChange={e => setFeeNote(e.target.value)} maxLength={300} placeholder="Ej. se pagan en arras / negociable" />
              <p className="text-[12px] text-muted -mt-1">En Madrid lo normal es que pague el vendedor, pero algunas agencias cobran también al comprador. Se suma al precio para entrar a vivir.</p>
            </div>
          )}
          <SubHead id="dinero-compra">🧾 Impuestos de la compra</SubHead>
          <Field label="Valor de referencia del Catastro" suffix="€" inputMode="decimal" value={refValue} onChange={e => setRefValue(e.target.value)} onBlur={() => setRefValue(thousands)} placeholder="Opcional" />
          <p className="text-xs text-muted -mt-2">El ITP se paga sobre el mayor entre el precio y este valor. Lo consultas con la referencia catastral en la Sede del Catastro («Valor de referencia»).</p>
          <label className="flex items-center gap-2 text-[14px] min-h-10">
            <input type="checkbox" checked={newBuild} onChange={e => setNewBuild(e.target.checked)} className="w-5 h-5" />
            <span>Obra nueva (IVA 10 % + AJD en lugar de ITP)</span>
          </label>
        </EditSection>

        <EditSection id="reforma" icon="🔨" title="Reforma" open={sections.isOpen('reforma')} onToggle={() => sections.toggle('reforma')}>
          <ReformaEditor m={m} householdId={householdId} value={reform} onChange={setReform}
            h={{ ...(home ?? {}), id: home?.id, price_cents: parsePrice(amount) ?? null, size_m2: num(m2) ?? null, useful_m2: num(useful) ?? null,
              rooms: rooms.trim() ? parseInt(rooms, 10) : null, baths: baths.trim() ? parseInt(baths, 10) : null, year_built: year.trim() ? parseInt(year, 10) : null,
              features, energy, heating_type: heatType, cooling, advertiser, buyer_fee_kind: feeKind, buyer_fee_vat: feeVat,
              buyer_fee_pct: feeKind === 'pct' && feePct.trim() ? Number(feePct.replace(',', '.')) || 0 : null,
              buyer_fee_cents: feeKind === 'fijo' && feeAmount.trim() ? parsePrice(feeAmount) : null,
              ref_value_cents: refValue.trim() ? parsePrice(refValue) : null, new_build: newBuild } as Home} />
        </EditSection>

        <EditSection id="zona" icon="📍" title="La zona" {...cnt('zona')} flashed={flashedIn('zona')} open={sections.isOpen('zona')} onToggle={() => sections.toggle('zona')}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Provincia</span>
              <select value={province ?? ''} onChange={e => { setProvince(e.target.value || null); setMunicipality(null) }}
                className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
                <option value="">—</option>
                {PROVINCE_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <div className={`rounded-xl ${fl('localidad') ? 'ring-2 ring-accent' : ''}`}>
              <Combobox key={province ?? 'none'} label="Localidad" value={municipality} onChange={setMunicipality} options={municipalitiesOf(province)} placeholder="Escribe: Alcob…" />
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona, urbanización o barrio'}{fl('zona') ? ' ✨' : ''}</span>
            <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'distritos-madrid' : undefined}
              placeholder={municipality === 'Madrid' ? 'Elige un distrito o escribe el barrio' : 'Ej. Casco antiguo'}
              className={`w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent ${fl('zona') ? 'ring-2 ring-accent' : ''}`} />
            {municipality === 'Madrid' && <datalist id="distritos-madrid">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
          </label>
          <Field label="Dirección" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} flash={fl('dirección')} />
          <Field label="Enlace de Google Maps" type="url" inputMode="url" value={maps} onChange={e => setMaps(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          <p className="text-xs text-muted -mt-2">Con la dirección o el enlace de Maps, el piso sale bien situado en el mapa y se pueden comprobar el Catastro y las zonas inundables.</p>
          <Field label="Minutos al cole" suffix="min" inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="10" />
        </EditSection>

        <EditSection id="contacto" icon="📞" title="Contacto" {...cnt('contacto')} flashed={flashedIn('contacto')} open={sections.isOpen('contacto')} onToggle={() => sections.toggle('contacto')}>
          <Choice<'agencia' | 'particular' | null> label="¿Quién lo anuncia?" value={advertiser} onChange={setAdvertiser}
            options={[{ value: 'agencia', label: '🏢 Agencia' }, { value: 'particular', label: '🙋 Particular' }, { value: null, label: '?' }]} />
          {advertiser !== 'particular' && <Field label="Agencia" value={agency} onChange={e => setAgency(e.target.value)} maxLength={120} placeholder="Nombre de la inmobiliaria" flash={fl('agencia')} />}
          <Field label="Persona de contacto" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} flash={fl('contacto')} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="600 000 000" flash={fl('teléfono')} />
            <Field label="Referencia" value={listingRef} onChange={e => setListingRef(e.target.value)} maxLength={60} placeholder="Ref. del anuncio" flash={fl('referencia')} />
          </div>
          <Field label="Email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} flash={fl('email')} />
          <Field label="Anuncio publicado el (aprox.)" type="date" value={listedOn} max={today()} onChange={e => setListedOn(e.target.value)} />
        </EditSection>

        <EditSection id="enlaces" icon="🔗" title={home ? 'Enlaces y fotos' : 'Otros enlaces'} open={sections.isOpen('enlaces')} onToggle={() => sections.toggle('enlaces')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-muted mb-1">Otros enlaces de este piso</legend>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={l.label} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 40) } : x)))} placeholder="Nombre"
                  aria-label="Nombre del enlace" className="w-28 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px] font-semibold" />
                <input value={l.url} onChange={e => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" inputMode="url"
                  aria-label="Enlace" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-[14px]" />
                {l.price_cents ? <span className="text-[12px] text-muted shrink-0">{priceShort(l.price_cents)}</span> : null}
                <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Quitar enlace" className="w-9 text-muted text-xl">×</button>
              </div>
            ))}
            {links.length < 10 && <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="self-start min-h-10 text-sm text-accent font-semibold">+ Añadir enlace (otro portal, la inmobiliaria…)</button>}
          </fieldset>
          {home && (
            <>
              <Photos h={home} m={m} householdId={householdId} kind="foto" />
              <Photos h={home} m={m} householdId={householdId} kind="anuncio" />
              <p className="text-xs text-muted -mt-2">Toca una foto para verla, borrarla o ponerla de portada.</p>
            </>
          )}
        </EditSection>

        <TextArea label="Notas y comentarios" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        <SaveBar dirty={dirty} busy={busy} label={home ? 'Guardar' : 'Guardar piso'} status={ocr} error={error}
          leaving={leaving} onStay={() => setLeaving(false)} onLeave={onClose} />
      </form>
    </Sheet>
  )
}
