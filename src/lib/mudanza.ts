import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { compressImage } from './money'
import { addDays } from './dates'

// ---------- Tipos ----------
/** Enlace a un anuncio (opcionalmente con el precio que pone esa web) */
export type Link = { label: string; url: string; price_cents?: number | null }
export type SaleCost = { label: string; cents: number }
export type Listing = {
  household_id: string; price_cents: number | null; published_on: string | null; links: Link[]; notes: string | null
  // Ficha del anuncio
  title: string | null; property_type: string | null; address: string | null; zone: string | null; municipality: string | null; province: string | null
  size_m2: number | null; useful_m2: number | null; plot_m2: number | null; rooms: number | null; baths: number | null; floor: string | null
  features: string[]; energy: string | null; community_fee_cents: number | null; ibi_cents: number | null; year_built: number | null
  electricity_cents: number | null; water_cents: number | null; heating_cents: number | null
  heating_type: HeatingType | null; cooling: Cooling | null
  description: string | null; listing_ref: string | null
  // Cuentas
  mortgage_cents: number | null; costs: SaleCost[]
}
export type SalePhoto = { id: string; path: string; kind: 'foto' | 'anuncio'; created_at: string }
/** Archivo de un documento (PDF o foto) en el bucket privado sale-docs */
export type DocFile = { path: string; name: string }
export type DocStatus = 'falta' | 'pedido' | 'ok' | 'no_aplica'
export type SaleDoc = {
  id: string; doc_key: string | null; title: string; status: DocStatus; expires_on: string | null
  files: DocFile[]; notes: string | null; position: number; updated_at: string
}
export type StepKind = 'reserva' | 'arras' | 'firma' | 'otro'
export type SaleStep = {
  id: string; kind: StepKind; title: string; step_date: string | null; step_time: string | null; location: string | null
  amount_cents: number | null; notes: string | null; checklist: Record<string, boolean>; done: boolean; position: number
}
export type PricePoint = { id: string; price_cents: number; changed_on: string; changed_at: string }

export type VisitStatus = 'scheduled' | 'done' | 'cancelled' | 'no_show'
export type Interest = 'high' | 'medium' | 'low'
export type BuyerVisit = {
  id: string
  visit_date: string
  start_time: string
  end_time: string | null
  contact_name: string | null
  contact_phone: string | null
  source: string | null
  host_id: string | null
  status: VisitStatus
  interest: Interest | null
  liked: string | null
  objections: string[]
  notes: string | null
  prep_done: string[]
}
export type OfferStatus = 'pending' | 'countered' | 'rejected' | 'accepted' | 'withdrawn'
export type Financing = 'cash' | 'mortgage_approved' | 'mortgage_pending' | 'unknown'
export type BuyerOffer = {
  id: string
  visit_id: string | null
  buyer_name: string | null
  offer_date: string
  amount_cents: number
  financing: Financing
  proposed_signing: string | null
  response_deadline: string | null
  status: OfferStatus
  counter_cents: number | null
  notes: string | null
}

export type Criteria = { household_id: string; max_price_cents: number | null; min_rooms: number | null; min_m2: number | null; zones: string[]; municipalities: string[]; must_haves: string[] }
export type HomeStatus = 'interesa' | 'llamar' | 'visita_pedida' | 'visitado' | 'favorito' | 'descartado' | 'oferta'
export type Home = {
  id: string
  title: string
  url: string | null
  address: string | null
  zone: string | null
  province: string | null
  municipality: string | null
  price_cents: number | null
  size_m2: number | null
  rooms: number | null
  baths: number | null
  floor: string | null
  features: string[]
  community_fee_cents: number | null
  ibi_cents: number | null
  electricity_cents: number | null
  water_cents: number | null
  heating_cents: number | null
  heating_type: HeatingType | null
  cooling: Cooling | null
  energy: string | null
  maps_url: string | null
  cover_photo_id: string | null
  links: Link[]
  cadastral_ref: string | null
  cadastre: import('./health').Cadastre | null
  flood: import('./health').Flood | null
  health: import('./health').Health
  market: import('./health').Market | null
  registry: import('./notaSimple').Registry | null
  plot_m2: number | null
  useful_m2: number | null
  year_built: number | null
  contact: string | null
  advertiser: 'agencia' | 'particular' | null
  agency: string | null
  contact_phone: string | null
  contact_email: string | null
  listing_ref: string | null
  lat: number | null
  lng: number | null
  geo_precision: 'exacta' | 'calle' | 'zona' | 'localidad' | null
  geo_query: string | null
  minutes_to_school: number | null
  status: HomeStatus
  discard_reason: string | null
  notes: string | null
  created_at: string
}
export type CheckValue = { v: 'ok' | 'mal' | ''; n?: string }
export type HomeVisit = {
  id: string
  home_id: string
  visit_date: string
  start_time: string
  end_time: string | null
  attendee_id: string | null
  status: 'scheduled' | 'done' | 'cancelled'
  checklist: Record<string, CheckValue>
  notes: string | null
}
export type Rating = { home_id: string; member_id: string; score: number; comment: string | null }
/** kind: «foto» (de la visita) o «anuncio» (captura del anuncio, por si lo borran del portal) */
export type Photo = { id: string; home_id: string; path: string; created_at: string; kind: 'foto' | 'anuncio' }
export type HomeOffer = {
  id: string
  home_id: string
  offer_date: string
  amount_cents: number
  response_deadline: string | null
  status: OfferStatus
  counter_cents: number | null
  notes: string | null
}

// ---------- Textos ----------
export const SOURCES: Record<string, string> = {
  idealista: 'Idealista', fotocasa: 'Fotocasa', habitaclia: 'Habitaclia', wallapop: 'Wallapop',
  cartel: 'Cartel', conocidos: 'Conocidos', otro: 'Otro'
}
export const VISIT_STATUS: Record<VisitStatus, string> = { scheduled: 'Prevista', done: 'Hecha', cancelled: 'Cancelada', no_show: 'No vino' }
export const INTEREST: Record<Interest, string> = { high: 'Alto', medium: 'Medio', low: 'Bajo' }
export const INTEREST_COLOR: Record<Interest, string> = { high: '#2E8B57', medium: '#C77A12', low: '#B3261E' }
export const OFFER_STATUS: Record<OfferStatus, string> = {
  pending: 'Pendiente', countered: 'Contraoferta', rejected: 'Rechazada', accepted: 'Aceptada', withdrawn: 'Retirada'
}
export const FINANCING: Record<Financing, string> = {
  cash: 'Al contado', mortgage_approved: 'Hipoteca aprobada', mortgage_pending: 'Hipoteca en trámite', unknown: 'Sin saber'
}
export const OBJECTION_PRESETS = [
  'Precio alto', 'Necesita reforma', 'Cocina pequeña', 'Poca luz', 'Ruido', 'Sin ascensor',
  'Distribución', 'Tamaño', 'Zona', 'Sin garaje', 'Gastos de comunidad', 'Orientación'
]
export const PREP_ITEMS = [
  'Ventilar', 'Subir persianas y encender luces', 'Camas hechas', 'Baños limpios', 'Cocina recogida',
  'Juguetes recogidos', 'Guardar papeles y objetos de valor', 'Plan para los niños'
]
/** Tipo de calefacción y de aire acondicionado */
export type HeatingType = 'gas_natural' | 'gasoil' | 'propano' | 'electrica' | 'aerotermia' | 'biomasa' | 'central' | 'ninguna'
export type Cooling = 'no' | 'si' | 'splits' | 'conductos' | 'aerotermia'
export const HEATING: Record<HeatingType, string> = {
  gas_natural: 'Gas natural', gasoil: 'Gasóleo', propano: 'Propano', electrica: 'Eléctrica', aerotermia: 'Aerotermia',
  biomasa: 'Biomasa / pellets', central: 'Central (comunidad)', ninguna: 'Sin calefacción'
}
export const COOLING: Record<Cooling, string> = { no: 'Sin aire', si: 'Sí', splits: 'Splits', conductos: 'Por conductos', aerotermia: 'Aerotermia' }

export const FEATURES: Record<string, string> = {
  ascensor: 'Ascensor', garaje: 'Garaje', trastero: 'Trastero', terraza: 'Terraza', exterior: 'Exterior',
  calefaccion: 'Calefacción', aire: 'Aire acondicionado', jardin: 'Jardín', piscina: 'Piscina',
  reformado: 'Reformado', placas_solares: 'Placas solares', solar_termica: 'Solar térmica (agua)',
  cerca_cole: 'Cerca del cole', transporte: 'Transporte cerca'
}
export const HOME_STATUS: Record<HomeStatus, string> = {
  interesa: 'Me interesa', llamar: 'Llamar para visita', visita_pedida: 'Visita pedida', visitado: 'Visitado',
  favorito: 'Favorito', descartado: 'Descartado', oferta: 'Oferta hecha'
}
export const HOME_STATUS_ORDER: HomeStatus[] = ['favorito', 'oferta', 'visitado', 'visita_pedida', 'llamar', 'interesa', 'descartado']
export const VISIT_CHECKLIST: { key: string; label: string; hint?: string }[] = [
  { key: 'luz', label: 'Luz y orientación', hint: 'Mira a qué hora da el sol en el salón' },
  { key: 'ruido', label: 'Ruido', hint: 'Calle, vecinos, bares, ascensor' },
  { key: 'humedad', label: 'Humedades o grietas', hint: 'Techos, esquinas, baños, detrás de muebles' },
  { key: 'agua', label: 'Agua y caldera', hint: 'Abre un grifo y la ducha; edad de la caldera' },
  { key: 'ventanas', label: 'Ventanas y aislamiento' },
  { key: 'electricidad', label: 'Instalación eléctrica', hint: 'Cuadro moderno, enchufes suficientes' },
  { key: 'comunidad', label: 'Gastos de comunidad', hint: '¿Cuánto al mes y qué incluyen?' },
  { key: 'derramas', label: 'Derramas', hint: '¿Hay alguna pendiente o prevista (fachada, ascensor…)?' },
  { key: 'ibi', label: 'IBI', hint: '¿Cuánto al año?' },
  { key: 'energia', label: 'Certificado energético' },
  { key: 'cargas', label: 'Cargas', hint: 'Pide la nota simple: hipotecas o embargos' },
  { key: 'motivo', label: 'Por qué venden y desde cuándo' },
  { key: 'zona', label: 'Zona', hint: 'Aparcar, tiendas, parques, de noche' }
]

// ---------- Formatos ----------
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const price = (cents: number | null | undefined) => (cents == null ? '—' : eur0.format(cents / 100))
export const priceShort = (cents: number | null | undefined) => {
  if (cents == null) return '—'
  const e = cents / 100
  return e >= 10000 ? `${(e / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€` : eur0.format(e)
}

/** "285.000" · "285000" · "285.000,50" · "285 k" → céntimos */
export function parsePrice(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\s|€/g, '')
  if (!s) return null
  let mult = 1
  if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1) }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * mult * 100)
  return cents > 0 ? cents : null
}
export const priceInput = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }))

export const perM2 = (h: Pick<Home, 'price_cents' | 'size_m2'>) =>
  h.price_cents && h.size_m2 ? Math.round(h.price_cents / Number(h.size_m2)) : null

/** Qué imprescindibles cumple un piso (las habitaciones y m² mínimos cuentan como imprescindibles) */
export function mustHaveCheck(h: Home, c: Criteria | null) {
  if (!c) return [] as { label: string; ok: boolean | null }[]
  const out: { label: string; ok: boolean | null }[] = []
  if (c.max_price_cents) out.push({ label: `≤ ${priceShort(c.max_price_cents)}`, ok: h.price_cents == null ? null : h.price_cents <= c.max_price_cents })
  if (c.min_rooms) out.push({ label: `${c.min_rooms}+ hab.`, ok: h.rooms == null ? null : h.rooms >= c.min_rooms })
  if (c.municipalities?.length) out.push({ label: c.municipalities.length === 1 ? c.municipalities[0] : 'Localidad buscada', ok: h.municipality == null ? null : c.municipalities.includes(h.municipality) })
  if (c.min_m2) out.push({ label: `${c.min_m2}+ m²`, ok: h.size_m2 == null ? null : Number(h.size_m2) >= c.min_m2 })
  for (const k of c.must_haves) out.push({ label: FEATURES[k] ?? k, ok: h.features.includes(k) })
  return out
}

// ---------- Datos ----------
const TABLES = ['sale_listing', 'sale_photos', 'sale_documents', 'sale_steps', 'sale_price_history', 'buyer_visits', 'buyer_offers', 'search_criteria', 'homes', 'home_visits', 'home_ratings', 'home_photos', 'home_offers']

export function useMudanza() {
  const [listing, setListing] = useState<Listing | null>(null)
  const [prices, setPrices] = useState<PricePoint[]>([])
  const [visits, setVisits] = useState<BuyerVisit[]>([])
  const [offers, setOffers] = useState<BuyerOffer[]>([])
  const [criteria, setCriteria] = useState<Criteria | null>(null)
  const [homes, setHomes] = useState<Home[]>([])
  const [homeVisits, setHomeVisits] = useState<HomeVisit[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [homeOffers, setHomeOffers] = useState<HomeOffer[]>([])
  const [salePhotos, setSalePhotos] = useState<SalePhoto[]>([])
  const [saleDocs, setSaleDocs] = useState<SaleDoc[]>([])
  const [saleSteps, setSaleSteps] = useState<SaleStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [l, p, v, o, c, h, hv, r, ph, ho, sp, sd, ss] = await Promise.all([
      supabase.from('sale_listing').select('*').maybeSingle(),
      supabase.from('sale_price_history').select('id, price_cents, changed_on, changed_at').order('changed_at'),
      supabase.from('buyer_visits').select('id, visit_date, start_time, end_time, contact_name, contact_phone, source, host_id, status, interest, liked, objections, notes, prep_done').order('visit_date').order('start_time'),
      supabase.from('buyer_offers').select('id, visit_id, buyer_name, offer_date, amount_cents, financing, proposed_signing, response_deadline, status, counter_cents, notes').order('offer_date', { ascending: false }),
      supabase.from('search_criteria').select('household_id, max_price_cents, min_rooms, min_m2, zones, municipalities, must_haves').maybeSingle(),
      supabase.from('homes').select('id, title, url, address, zone, province, municipality, price_cents, size_m2, rooms, baths, floor, features, community_fee_cents, ibi_cents, electricity_cents, water_cents, heating_cents, heating_type, cooling, energy, maps_url, cover_photo_id, links, cadastral_ref, cadastre, flood, health, market, registry, plot_m2, useful_m2, year_built, contact, advertiser, agency, contact_phone, contact_email, listing_ref, lat, lng, geo_precision, geo_query, minutes_to_school, status, discard_reason, notes, created_at').order('created_at', { ascending: false }),
      supabase.from('home_visits').select('id, home_id, visit_date, start_time, end_time, attendee_id, status, checklist, notes').order('visit_date').order('start_time'),
      supabase.from('home_ratings').select('home_id, member_id, score, comment'),
      supabase.from('home_photos').select('id, home_id, path, created_at, kind').order('created_at'),
      supabase.from('home_offers').select('id, home_id, offer_date, amount_cents, response_deadline, status, counter_cents, notes').order('offer_date', { ascending: false }),
      supabase.from('sale_photos').select('id, path, kind, created_at').order('created_at'),
      supabase.from('sale_documents').select('id, doc_key, title, status, expires_on, files, notes, position, updated_at').order('position').order('title'),
      supabase.from('sale_steps').select('id, kind, title, step_date, step_time, location, amount_cents, notes, checklist, done, position').order('position')
    ])
    const firstError = [l, p, v, o, c, h, hv, r, ph, ho, sp, sd, ss].find(x => x.error)?.error
    if (firstError) setError(firstError.message)
    setListing((l.data as Listing | null) ?? null)
    setPrices((p.data ?? []) as PricePoint[])
    setVisits((v.data ?? []) as BuyerVisit[])
    setOffers((o.data ?? []) as BuyerOffer[])
    setCriteria((c.data as Criteria | null) ?? null)
    setHomes((h.data ?? []) as Home[])
    setHomeVisits((hv.data ?? []) as HomeVisit[])
    setRatings((r.data ?? []) as Rating[])
    setPhotos((ph.data ?? []) as Photo[])
    setHomeOffers((ho.data ?? []) as HomeOffer[])
    setSalePhotos((sp.data ?? []) as SalePhoto[])
    setSaleDocs((sd.data ?? []) as SaleDoc[])
    setSaleSteps((ss.data ?? []) as SaleStep[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    let channel = supabase.channel(`mudanza:${crypto.randomUUID()}`)
    for (const t of TABLES) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => load())
    channel.subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  /** Inserta o actualiza y recarga. Devuelve el mensaje de error, si lo hay. */
  async function write(table: string, data: Record<string, unknown>, id?: string, onConflict?: string): Promise<string | undefined> {
    const q = id
      ? supabase.from(table).update(data).eq('id', id)
      : onConflict
        ? supabase.from(table).upsert(data, { onConflict })
        : supabase.from(table).insert(data)
    const { error } = await q
    if (error) { setError(friendly(error.message)); return friendly(error.message) }
    await load()
  }

  async function remove(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setError(friendly(error.message))
    await load()
  }

  async function removeHome(id: string) {
    const paths = photos.filter(p => p.home_id === id).map(p => p.path)
    if (paths.length) await supabase.storage.from('house-photos').remove(paths)
    await remove('homes', id)
  }

  /** Crea un piso y devuelve su id (para subir después las capturas del anuncio) */
  async function createHome(data: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
    const { data: row, error } = await supabase.from('homes').insert(data).select('id').single()
    if (error) { setError(friendly(error.message)); return { error: friendly(error.message) } }
    await load()
    return { id: row.id as string }
  }

  async function addPhoto(householdId: string, homeId: string, file: File, kind: 'foto' | 'anuncio' = 'foto') {
    try {
      // Las capturas del anuncio se guardan más grandes para que el texto se siga leyendo
      const blob = await compressImage(file, kind === 'anuncio' ? 2400 : 1600)
      const path = `${householdId}/${homeId}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('house-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      return await write('home_photos', { home_id: homeId, path, kind })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo subir la foto'
      setError(msg)
      return msg
    }
  }

  /** Foto o captura de nuestro anuncio (carpeta <hogar>/venta/) */
  async function addSalePhoto(householdId: string, file: File, kind: 'foto' | 'anuncio' = 'foto') {
    try {
      const blob = await compressImage(file, kind === 'anuncio' ? 2400 : 1600)
      const path = `${householdId}/venta/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('house-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      return await write('sale_photos', { path, kind })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo subir la foto'
      setError(msg)
      return msg
    }
  }
  async function removeSalePhoto(p: SalePhoto) {
    await supabase.storage.from('house-photos').remove([p.path])
    await remove('sale_photos', p.id)
  }

  /** Añade archivos (PDF o fotos) a un documento y lo marca como «lo tenemos» */
  async function uploadSaleDoc(householdId: string, doc: SaleDoc, list: File[], onProgress?: (i: number) => void) {
    const { added, error } = await uploadDocFiles(`${householdId}`, list, 20 - doc.files.length, onProgress)
    if (added.length) {
      const err = await write('sale_documents', { files: [...doc.files, ...added], status: 'ok' }, doc.id)
      if (err) return err
    }
    if (error) setError(error)
    return error
  }
  async function removeSaleDocFile(doc: SaleDoc, f: DocFile) {
    await supabase.storage.from('sale-docs').remove([f.path])
    return write('sale_documents', { files: doc.files.filter(x => x.path !== f.path) }, doc.id)
  }
  async function removeSaleDoc(doc: SaleDoc) {
    if (doc.files.length) await supabase.storage.from('sale-docs').remove(doc.files.map(f => f.path))
    await remove('sale_documents', doc.id)
  }

  async function removePhoto(p: Photo) {
    await supabase.storage.from('house-photos').remove([p.path])
    await remove('home_photos', p.id)
  }

  return {
    listing, prices, visits, offers, criteria, homes, homeVisits, ratings, photos, homeOffers, loading, error,
    salePhotos, saleDocs, saleSteps, addSalePhoto, removeSalePhoto, uploadSaleDoc, removeSaleDocFile, removeSaleDoc,
    clearError: () => setError(''), reload: load, write, remove, removeHome, createHome, addPhoto, removePhoto
  }
}
export type Mudanza = ReturnType<typeof useMudanza>

/** Foto de portada de un piso: la elegida o, si no, la primera foto (y si no hay, la primera captura) */
export function coverPhoto(h: Pick<Home, 'id' | 'cover_photo_id'>, photos: Photo[]): Photo | null {
  const own = photos.filter(p => p.home_id === h.id)
  return own.find(p => p.id === h.cover_photo_id) ?? own.find(p => (p.kind ?? 'foto') === 'foto') ?? own[0] ?? null
}

// Enlaces temporales de fotos ya pedidos (duran 30 min; se reutilizan 25 para no pedirlos en cada recarga)
const urlCache = new Map<string, { url: string; until: number }>()
/** Enlaces de varias fotos de una vez (para las portadas de la lista) */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const out: Record<string, string> = {}
  const missing = paths.filter(p => { const c = urlCache.get(p); if (c && c.until > now) { out[p] = c.url; return false } return true })
  if (missing.length) {
    const { data } = await supabase.storage.from('house-photos').createSignedUrls(missing, 60 * 30)
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) { out[d.path] = d.signedUrl; urlCache.set(d.path, { url: d.signedUrl, until: now + 25 * 60 * 1000 }) }
    }
  }
  return out
}

export async function photoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('house-photos').createSignedUrl(path, 60 * 30)
  return data?.signedUrl ?? null
}

function friendly(msg: string) {
  if (/check constraint|violates/i.test(msg)) return 'Algún dato no es válido. Revisa los campos.'
  return msg
}

/** Resumen ligero para la pantalla Hoy */
export async function mudanzaSummary(fromDate: string) {
  const [bv, hv, bo, ho, sd, pd] = await Promise.all([
    supabase.from('buyer_visits').select('visit_date, start_time, contact_name').eq('status', 'scheduled').gte('visit_date', fromDate).order('visit_date').order('start_time').limit(1),
    supabase.from('home_visits').select('visit_date, start_time, homes(title)').eq('status', 'scheduled').gte('visit_date', fromDate).order('visit_date').order('start_time').limit(1),
    supabase.from('buyer_offers').select('response_deadline').in('status', ['pending', 'countered']),
    supabase.from('home_offers').select('response_deadline').in('status', ['pending', 'countered']),
    supabase.from('sale_documents').select('title, expires_on').neq('status', 'no_aplica').not('expires_on', 'is', null)
      .lte('expires_on', addDays(fromDate, 15)).order('expires_on'),
    supabase.from('purchase_docs').select('title, expires_on').neq('status', 'no_aplica').not('expires_on', 'is', null)
      .lte('expires_on', addDays(fromDate, 15)).order('expires_on')
  ])
  const nextSale = bv.data?.[0] as { visit_date: string; start_time: string; contact_name: string | null } | undefined
  const nh = hv.data?.[0] as { visit_date: string; start_time: string; homes: { title: string } | { title: string }[] | null } | undefined
  const homeTitle = nh ? (Array.isArray(nh.homes) ? nh.homes[0]?.title : nh.homes?.title) ?? 'Piso' : null
  const deadlines = [...(bo.data ?? []), ...(ho.data ?? [])].map(o => o.response_deadline as string | null).filter((d): d is string => !!d).sort()
  return {
    nextSale: nextSale ?? null,
    nextHome: nh ? { visit_date: nh.visit_date, start_time: nh.start_time, title: homeTitle! } : null,
    openOffers: (bo.data?.length ?? 0) + (ho.data?.length ?? 0),
    nearestDeadline: deadlines.find(d => d >= fromDate) ?? null,
    expiringDocs: [
      ...((sd.data ?? []) as { title: string; expires_on: string }[]),
      ...((pd.data ?? []) as { title: string; expires_on: string }[]).map(d => ({ ...d, title: `Compra · ${d.title}` }))
    ].sort((a, b) => a.expires_on.localeCompare(b.expires_on))
  }
}

/** Nombre del portal a partir del enlace: «Idealista», «Fotocasa»… */
/** Añade enlaces nuevos sin repetir (compara sin «www», parámetros ni barra final); máximo 10 */
export function mergeLinks(existing: Link[], extra: Link[], exclude: (string | null | undefined)[] = []) {
  const key = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase() } catch { return u } }
  const seen = new Set([...existing.map(l => key(l.url)), ...exclude.filter((x): x is string => !!x).map(key)])
  const out = [...existing]
  for (const l of extra) {
    const k = key(l.url)
    if (seen.has(k)) {
      // Si ya estaba, se actualiza su precio
      const i = out.findIndex(x => key(x.url) === k)
      if (i >= 0 && l.price_cents != null) out[i] = { ...out[i], price_cents: l.price_cents }
      continue
    }
    seen.add(k); out.push(l)
  }
  return out.slice(0, 10)
}

export function portalName(url: string | null | undefined) {
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const known: [RegExp, string][] = [
      [/idealista\./, 'Idealista'], [/fotocasa\./, 'Fotocasa'], [/habitaclia\./, 'Habitaclia'], [/pisos\.com$/, 'Pisos.com'],
      [/wallapop\./, 'Wallapop'], [/milanuncios\./, 'Milanuncios'], [/yaencontre\./, 'Yaencontré'], [/tucasa\./, 'Tucasa']
    ]
    return known.find(([re]) => re.test(host))?.[1] ?? host
  } catch {
    return null
  }
}

/**
 * Prepara un documento para subirlo: lo lee entero en memoria primero (en Android, un archivo elegido desde Drive
 * o «Descargas» puede fallar al leerse durante la subida y dar «Failed to fetch»), reconoce los PDF aunque el móvil
 * no diga su tipo, y comprime las fotos.
 */
export async function prepareDoc(file: File): Promise<{ body: Blob; isPdf: boolean }> {
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throw new Error('El móvil no deja leer ese archivo. Si está en Drive u otra nube, descárgalo primero al teléfono y súbelo desde «Descargas».')
  }
  if (!bytes.byteLength) throw new Error('El archivo está vacío o no se ha terminado de descargar. Ábrelo una vez en el móvil y vuelve a intentarlo.')
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('El archivo pesa más de 15 MB.')
  const head = new Uint8Array(bytes.slice(0, 5))
  const isPdf = String.fromCharCode(...head) === '%PDF-' || file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (isPdf) return { body: new Blob([bytes], { type: 'application/pdf' }), isPdf }
  try {
    return { body: await compressImage(new File([bytes], file.name, { type: file.type || 'image/jpeg' }), 2400), isPdf }
  } catch {
    throw new Error('Solo se pueden subir PDF o fotos (JPG, PNG, WEBP).')
  }
}

/** Sube varios archivos de documentos a <carpeta>/; devuelve los subidos y, si alguno falló, el error */
export async function uploadDocFiles(folder: string, list: File[], room: number, onProgress?: (i: number) => void) {
  const added: DocFile[] = []
  let error: string | undefined
  if (list.length > room) error = `Caben como mucho 20 archivos por documento: se suben los ${Math.max(0, room)} primeros.`
  for (const [i, file] of list.slice(0, Math.max(0, room)).entries()) {
    onProgress?.(i + 1)
    try {
      const { body, isPdf } = await prepareDoc(file)
      const path = `${folder}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`
      const { error: e } = await supabase.storage.from('sale-docs').upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg', upsert: false })
      if (e) throw e
      added.push({ path, name: (file.name || (isPdf ? 'Documento.pdf' : 'Foto.jpg')).slice(0, 200) })
    } catch (e) {
      error = `${file.name ? `«${file.name}»: ` : ''}${uploadError(e)}`
    }
  }
  return { added, error }
}

/** Mensaje claro cuando falla la subida de un documento */
export function uploadError(e: unknown) {
  const msg = e instanceof Error ? e.message : ''
  if (/failed to fetch|network|load failed/i.test(msg)) return 'No se ha podido subir: revisa la conexión. Si el archivo está en Drive u otra nube, descárgalo antes al móvil.'
  return msg || 'No se pudo subir el documento'
}

/** Enlace temporal para ver un documento de la venta */
export async function saleDocUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('sale-docs').createSignedUrl(path, 60 * 10)
  return data?.signedUrl ?? null
}

// ---------- Plantillas de Vendemos ----------
/** Documentos que suelen hacer falta para vender; «months»: validez habitual (para avisar de la caducidad) */
export const DOC_TEMPLATE: { key: string; title: string; hint: string; months?: number }[] = [
  { key: 'nota_simple', title: 'Nota simple del Registro', hint: 'Titularidad y cargas. Se pide reciente (menos de 3 meses).', months: 3 },
  { key: 'escritura', title: 'Escritura de propiedad', hint: 'La piden el notario y el banco del comprador.' },
  { key: 'catastro', title: 'Referencia / certificado catastral', hint: 'Sede electrónica del Catastro.' },
  { key: 'planos', title: 'Planos de la vivienda', hint: 'Del proyecto, del arquitecto o hechos para el anuncio. Si hay varios (por plantas), añade uno por cada plano.' },
  { key: 'cee', title: 'Certificado energético', hint: 'Obligatorio para anunciar y firmar. Vale 10 años.', months: 120 },
  { key: 'ibi', title: 'Último recibo del IBI', hint: 'Lo pide el notario.', months: 12 },
  { key: 'comunidad', title: 'Certificado de la comunidad (al corriente)', hint: 'Obligatorio en la firma si hay comunidad. Reciente.', months: 1 },
  { key: 'hipoteca', title: 'Certificado de deuda de la hipoteca', hint: 'Cuánto queda para cancelarla el día de la firma.', months: 1 },
  { key: 'suministros', title: 'Facturas de luz, agua y gas', hint: 'Para el cambio de titular.' },
  { key: 'ite', title: 'ITE / IEE y licencias de obras', hint: 'Si el edificio es antiguo o hay reformas.' },
  { key: 'arras_modelo', title: 'Modelo de contrato de arras', hint: 'El que vayáis a firmar con el comprador.' }
]

/** Pasos de la venta con lo que conviene tener hecho en cada uno */
export const STEP_TEMPLATE: { kind: StepKind; title: string; checklist: { key: string; label: string }[] }[] = [
  { kind: 'reserva', title: 'Reserva', checklist: [
    { key: 'oferta_escrito', label: 'Oferta aceptada por escrito' },
    { key: 'importe', label: 'Importe y plazo de la reserva acordados' },
    { key: 'cobro', label: 'Reserva cobrada (transferencia)' }
  ] },
  { kind: 'arras', title: 'Firma de arras', checklist: [
    { key: 'nota_simple', label: 'Nota simple reciente' },
    { key: 'contrato', label: 'Contrato de arras revisado' },
    { key: 'financiacion', label: 'Financiación del comprador confirmada' },
    { key: 'fecha_notaria', label: 'Fecha límite de firma en notaría' },
    { key: 'cobro', label: 'Arras cobradas' }
  ] },
  { kind: 'firma', title: 'Firma ante notario', checklist: [
    { key: 'deuda', label: 'Certificado de deuda de la hipoteca (15 días antes)' },
    { key: 'comunidad', label: 'Certificado de la comunidad' },
    { key: 'ibi', label: 'Último recibo del IBI' },
    { key: 'cee', label: 'Certificado energético' },
    { key: 'llaves', label: 'Llaves y mandos preparados' },
    { key: 'suministros', label: 'Lecturas de luz, agua y gas; cambio de titular' }
  ] }
]

/** Gastos habituales al vender (las cifras las pone cada uno; los impuestos, mejor confirmarlos con un gestor) */
export const COST_TEMPLATE = ['Cancelación de la hipoteca (notaría y registro)', 'Plusvalía municipal', 'Certificados y nota simple', 'Mudanza']
