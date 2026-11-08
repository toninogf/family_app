// Descarga UNA foto de un anuncio (a partir del enlace que haya dado la IA) para guardarla en la app.
// Solo usuarios con 2FA, solo https y solo servidores de fotos de portales inmobiliarios conocidos (nada de URLs arbitrarias).
// Devuelve la imagen tal cual (application/octet-stream); la app la comprime y la guarda en vuestra carpeta privada.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Portales y sus servidores de imágenes (idealista: img*.idealista.com; pisos.com: imghs.net; habitaclia: habimg.com…)
const HOSTS = ['idealista.com', 'fotocasa.es', 'pisos.com', 'imghs.net', 'habitaclia.com', 'habimg.com', 'yaencontre.com', 'milanuncios.com',
  'tucasa.com', 'enalquiler.com', 'housfy.com', 'solvia.es', 'altamirainmuebles.com', 'servihabitat.com', 'aliseda.es', 'haya.es', 'adevinta.com']
const allowed = (host: string) => HOSTS.some(p => host === p || host.endsWith('.' + p))
const MAX = 8 * 1024 * 1024

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

  const { url } = await req.json().catch(() => ({ url: '' }))
  let target: URL
  try { target = new URL(String(url)) } catch { return json({ error: 'Enlace no válido' }, 400) }
  if (target.protocol !== 'https:' || !allowed(target.hostname) || target.port) return json({ error: 'Solo fotos de portales inmobiliarios conocidos' }, 400)

  try {
    const site = target.hostname.split('.').slice(-2).join('.')
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
        'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5', 'Referer': `https://www.${site}/`
      },
      redirect: 'manual', signal: AbortSignal.timeout(12000)
    })
    // Redirecciones: solo si siguen en un servidor permitido (una vez)
    let res = r
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      const next = new URL(r.headers.get('location')!, target)
      if (next.protocol !== 'https:' || !allowed(next.hostname)) return json({ error: 'Redirección no permitida' }, 400)
      res = await fetch(next, { headers: { 'Accept': 'image/*', 'Referer': `https://www.${site}/` }, redirect: 'manual', signal: AbortSignal.timeout(12000) })
    }
    if (!res.ok) return json({ blocked: true, status: res.status })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!/^image\/(jpeg|jpg|png|webp|avif)$/.test(type)) return json({ blocked: true, error: 'No es una foto' })
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX) return json({ error: 'La foto pesa demasiado' }, 400)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX) return json({ error: 'La foto pesa demasiado' }, 400)
    if (buf.byteLength < 2000) return json({ blocked: true, error: 'Imagen vacía' })
    return new Response(buf, { headers: { ...cors, 'Content-Type': 'application/octet-stream', 'X-Image-Type': type, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return json({ blocked: true, error: String(e).slice(0, 200) })
  }
})
