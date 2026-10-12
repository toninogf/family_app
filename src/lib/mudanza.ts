import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { compressImage } from './money'

// ---------- Tipos ----------
export type Link = { label: string; url: string }
export type Listing = { household_id: string; price_cents: number | null; published_on: string | null; links: Link[]; notes: string | null }
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
export type HomeStatus = 'interesa' | 'visita_pedida' | 'visitado' | 'favorito' | 'descartado' | 'oferta'
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
  energy: string | null
  maps_url: string | null
  contact: string | null
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
export type Rating = { home_id: string; member_id: string; score: number; best: string | null; worst: string | null }
export type Photo = { id: string; home_id: string; path: string; created_at: string }
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
export const FEATURES: Record<string, string> = {
  ascensor: 'Ascensor', garaje: 'Garaje', trastero: 'Trastero', terraza: 'Terraza', exterior: 'Exterior',
  calefaccion: 'Calefacción', aire: 'Aire acondicionado', jardin: 'Jardín', piscina: 'Piscina',
  reformado: 'Reformado', cerca_cole: 'Cerca del cole', transporte: 'Transporte cerca'
}
export const HOME_STATUS: Record<HomeStatus, string> = {
  interesa: 'Me interesa', visita_pedida: 'Visita pedida', visitado: 'Visitado',
  favorito: 'Favorito', descartado: 'Descartado', oferta: 'Oferta hecha'
}
export const HOME_STATUS_ORDER: HomeStatus[] = ['favorito', 'oferta', 'visitado', 'visita_pedida', 'interesa', 'descartado']
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
const TABLES = ['sale_listing', 'sale_price_history', 'buyer_visits', 'buyer_offers', 'search_criteria', 'homes', 'home_visits', 'home_ratings', 'home_photos', 'home_offers']

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [l, p, v, o, c, h, hv, r, ph, ho] = await Promise.all([
      supabase.from('sale_listing').select('household_id, price_cents, published_on, links, notes').maybeSingle(),
      supabase.from('sale_price_history').select('id, price_cents, changed_on, changed_at').order('changed_at'),
      supabase.from('buyer_visits').select('id, visit_date, start_time, end_time, contact_name, contact_phone, source, host_id, status, interest, liked, objections, notes, prep_done').order('visit_date').order('start_time'),
      supabase.from('buyer_offers').select('id, visit_id, buyer_name, offer_date, amount_cents, financing, proposed_signing, response_deadline, status, counter_cents, notes').order('offer_date', { ascending: false }),
      supabase.from('search_criteria').select('household_id, max_price_cents, min_rooms, min_m2, zones, municipalities, must_haves').maybeSingle(),
      supabase.from('homes').select('id, title, url, address, zone, province, municipality, price_cents, size_m2, rooms, baths, floor, features, community_fee_cents, ibi_cents, energy, maps_url, contact, minutes_to_school, status, discard_reason, notes, created_at').order('created_at', { ascending: false }),
      supabase.from('home_visits').select('id, home_id, visit_date, start_time, end_time, attendee_id, status, checklist, notes').order('visit_date').order('start_time'),
      supabase.from('home_ratings').select('home_id, member_id, score, best, worst'),
      supabase.from('home_photos').select('id, home_id, path, created_at').order('created_at'),
      supabase.from('home_offers').select('id, home_id, offer_date, amount_cents, response_deadline, status, counter_cents, notes').order('offer_date', { ascending: false })
    ])
    const firstError = [l, p, v, o, c, h, hv, r, ph, ho].find(x => x.error)?.error
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

  async function addPhoto(householdId: string, homeId: string, file: File) {
    try {
      const blob = await compressImage(file)
      const path = `${householdId}/${homeId}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('house-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      return await write('home_photos', { home_id: homeId, path })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo subir la foto'
      setError(msg)
      return msg
    }
  }

  async function removePhoto(p: Photo) {
    await supabase.storage.from('house-photos').remove([p.path])
    await remove('home_photos', p.id)
  }

  return {
    listing, prices, visits, offers, criteria, homes, homeVisits, ratings, photos, homeOffers, loading, error,
    clearError: () => setError(''), reload: load, write, remove, removeHome, addPhoto, removePhoto
  }
}
export type Mudanza = ReturnType<typeof useMudanza>

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
  const [bv, hv, bo, ho] = await Promise.all([
    supabase.from('buyer_visits').select('visit_date, start_time, contact_name').eq('status', 'scheduled').gte('visit_date', fromDate).order('visit_date').order('start_time').limit(1),
    supabase.from('home_visits').select('visit_date, start_time, homes(title)').eq('status', 'scheduled').gte('visit_date', fromDate).order('visit_date').order('start_time').limit(1),
    supabase.from('buyer_offers').select('response_deadline').in('status', ['pending', 'countered']),
    supabase.from('home_offers').select('response_deadline').in('status', ['pending', 'countered'])
  ])
  const nextSale = bv.data?.[0] as { visit_date: string; start_time: string; contact_name: string | null } | undefined
  const nh = hv.data?.[0] as { visit_date: string; start_time: string; homes: { title: string } | { title: string }[] | null } | undefined
  const homeTitle = nh ? (Array.isArray(nh.homes) ? nh.homes[0]?.title : nh.homes?.title) ?? 'Piso' : null
  const deadlines = [...(bo.data ?? []), ...(ho.data ?? [])].map(o => o.response_deadline as string | null).filter((d): d is string => !!d).sort()
  return {
    nextSale: nextSale ?? null,
    nextHome: nh ? { visit_date: nh.visit_date, start_time: nh.start_time, title: homeTitle! } : null,
    openOffers: (bo.data?.length ?? 0) + (ho.data?.length ?? 0),
    nearestDeadline: deadlines.find(d => d >= fromDate) ?? null
  }
}

/** Nombre del portal a partir del enlace: «Idealista», «Fotocasa»… */
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
