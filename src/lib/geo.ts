// Situar los pisos en el mapa: coordenadas del enlace de Google Maps si las trae; si no, se buscan por calle,
// zona o localidad (función «geocode», OpenStreetMap). Se guardan en el piso para no repetir la búsqueda.
import { supabase } from './supabase'
import type { Home } from './mudanza'

type Where = Pick<Home, 'address' | 'zone' | 'municipality' | 'province' | 'maps_url'>

/** Lo que determina la posición: si cambia, hay que volver a buscarla */
export const geoQuery = (h: Where) => [h.maps_url, h.address, h.zone, h.municipality, h.province].map(x => (x ?? '').trim()).join('|')

/** Coordenadas escritas en un enlace largo de Google Maps (…/@40.12,-3.45,… o ?q=40.12,-3.45) */
export function coordsFromMapsUrl(url: string | null) {
  if (!url) return null
  const m = url.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ?? url.match(/[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null
}

/** Sitúa un piso si aún no lo está (o si ha cambiado su dirección). Devuelve true si ha guardado algo. */
export async function locateHome(id: string, h: Where & Partial<Pick<Home, 'geo_query' | 'lat'>>): Promise<boolean> {
  const query = geoQuery(h)
  if (h.geo_query === query) return false // ya se buscó con estos mismos datos
  if (!h.maps_url && !h.address && !h.zone && !h.municipality) return false
  const exact = coordsFromMapsUrl(h.maps_url)
  let patch: Record<string, unknown> = { geo_query: query, lat: null, lng: null, geo_precision: null }
  if (exact) patch = { ...patch, ...exact, geo_precision: 'exacta' }
  else {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { address: h.address, zone: h.zone, municipality: h.municipality, province: h.province }
    })
    if (error) return false // se reintentará la próxima vez
    const r = data as { lat?: number; lng?: number; precision?: string } | null
    if (r?.lat != null && r.lng != null) patch = { ...patch, lat: r.lat, lng: r.lng, geo_precision: r.precision }
  }
  const { error } = await supabase.from('homes').update(patch).eq('id', id)
  return !error
}
