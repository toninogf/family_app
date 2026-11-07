// Busca las coordenadas de un piso (calle, zona y localidad) con OpenStreetMap (vía Photon) para el mapa de Buscamos.
// Solo usuarios con 2FA. Se prueba de lo más preciso a lo menos: calle → zona → localidad.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 120) : '')

// Photon (komoot, datos de OpenStreetMap): el Nominatim público bloquea a los servidores en la nube
const MADRID_BBOX = '-4.6,39.85,-3.05,41.17'
type Hit = { lat: number; lng: number; type: string }
async function search(q: string, province: string): Promise<Hit | null> {
  const params = new URLSearchParams({ q, limit: '1' })
  if (/madrid/i.test(province)) params.set('bbox', MADRID_BBOX)
  const r = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { 'User-Agent': 'family-app/1.0 (app familiar privada; mapa de pisos)' },
    signal: AbortSignal.timeout(8000)
  })
  if (!r.ok) return null
  const data = await r.json() as { features?: { geometry: { coordinates: [number, number] }; properties: { type?: string; countrycode?: string } }[] }
  const f = data.features?.find(x => !x.properties.countrycode || x.properties.countrycode === 'ES')
  return f ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], type: f.properties.type ?? '' } : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await db.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'No autorizado' }, 401)
  try {
    const claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.aal !== 'aal2') return json({ error: 'Falta la verificación en dos pasos' }, 403)
  } catch { return json({ error: 'No autorizado' }, 401) }

  const body = await req.json().catch(() => ({}))
  const address = clean(body.address), zone = clean(body.zone), town = clean(body.municipality), province = clean(body.province) || 'Madrid'
  if (!town && !address && !zone) return json({ error: 'Sin datos de ubicación' }, 400)
  try {
    if (address) {
      const hit = await search([address, town, province].filter(Boolean).join(', '), province)
      if (hit && ['house', 'street'].includes(hit.type)) return json({ lat: hit.lat, lng: hit.lng, precision: 'calle' })
    }
    if (zone) {
      const hit = await search([zone, town, province].filter(Boolean).join(', '), province)
      if (hit && !['city', 'county', 'state', 'country'].includes(hit.type)) return json({ lat: hit.lat, lng: hit.lng, precision: 'zona' })
    }
    if (town) {
      const hit = await search(`${town}, ${province}`, province)
      if (hit) return json({ lat: hit.lat, lng: hit.lng, precision: 'localidad' })
    }
    return json({ notFound: true })
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 502)
  }
})
