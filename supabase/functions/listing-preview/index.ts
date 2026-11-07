// Lee lo que se pueda de un anuncio inmobiliario (título, descripción y, si el portal lo deja, el texto de la ficha)
// para rellenar «Buscamos». Solo usuarios con 2FA y solo portales inmobiliarios conocidos (nada de URLs arbitrarias).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PORTALS = ['idealista.com', 'fotocasa.es', 'pisos.com', 'habitaclia.com', 'yaencontre.com', 'milanuncios.com', 'tucasa.com', 'enalquiler.com', 'housfy.com', 'solvia.es', 'altamirainmuebles.com', 'servihabitat.com', 'aliseda.es', 'haya.es']
const allowed = (host: string) => PORTALS.some(p => host === p || host.endsWith('.' + p))

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const meta = (html: string, key: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'))
  return m ? decode(m[1]).trim() : null
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

  const { url } = await req.json().catch(() => ({ url: '' }))
  let target: URL
  try { target = new URL(String(url)) } catch { return json({ error: 'El enlace no es válido' }, 400) }
  if (target.protocol !== 'https:' || !allowed(target.hostname)) return json({ error: 'Solo se pueden leer anuncios de portales inmobiliarios conocidos' }, 400)
  target.search = '' // fuera parámetros de seguimiento

  try {
    // Con el agente de WhatsApp los portales suelen devolver al menos la vista previa del enlace
    const r = await fetch(target, {
      headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A', 'Accept': 'text/html', 'Accept-Language': 'es-ES,es;q=0.9' },
      redirect: 'follow', signal: AbortSignal.timeout(10000)
    })
    if (!r.ok) return json({ blocked: true, status: r.status })
    const html = (await r.text()).slice(0, 1_500_000)
    const title = meta(html, 'og:title') ?? decode((html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? '').trim()
    const description = meta(html, 'og:description') ?? meta(html, 'description')
    // Texto visible de la página (si el portal la ha servido entera): sin scripts, estilos ni etiquetas
    const text = decode(html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/li|\/div|\/h\d|\/span)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 30000)
    return json({ title: title || null, description, text, url: target.toString() })
  } catch (e) {
    return json({ blocked: true, error: String(e).slice(0, 200) })
  }
})
