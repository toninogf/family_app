// Busca las coordenadas de un piso (calle, zona y localidad) con OpenStreetMap (Nominatim) para el mapa de Buscamos.
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

async function search(params: Record<string, string>) {
  const q = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'es', 'accept-language': 'es', ...params })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { 'User-Agent': 'family-app/1.0 (app familiar privada; mapa de pisos)' },
    signal: AbortSignal.timeout(8000)
  })
  if (!r.ok) return null
  const [hit] = await r.json() as { lat: string; lon: string }[]
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
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
      const street = address.replace(/,?\s*\d+.*$/, '').trim() // sin número ni piso: más fácil de encontrar
      const hit = await search({ street: address, city: town, county: province }) ?? (street !== address ? await search({ street, city: town, county: province }) : null)
      if (hit) return json({ ...hit, precision: 'calle' })
    }
    if (zone) {
      const hit = await search({ q: [zone, town, province].filter(Boolean).join(', ') })
      if (hit) return json({ ...hit, precision: 'zona' })
    }
    if (town) {
      const hit = await search({ city: town, county: province })
      if (hit) return json({ ...hit, precision: 'localidad' })
    }
    return json({ notFound: true })
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 502)
  }
})
