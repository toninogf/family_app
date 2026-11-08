// Datos públicos de un piso para «Estado y riesgos»: Catastro (referencia, metros, año, parcela) y zona inundable
// (mapas oficiales de peligrosidad del Ministerio, a través de la IDEE). Solo usuarios con 2FA; nada se guarda aquí.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const OVC = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero'
const FLOOD = 'https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones'

type J = Record<string, any>
const arr = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x])
const rcOf = (rc: J) => [rc?.pc1, rc?.pc2, rc?.car, rc?.cc1, rc?.cc2].filter(Boolean).join('')
const num = (s: unknown) => { const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }

/** Dirección legible de un inmueble del Catastro */
function addressOf(dt: J) {
  const d = dt?.locs?.lous?.lourb?.dir ?? {}
  const i = dt?.locs?.lous?.lourb?.loint ?? {}
  const street = [d.tv, d.nv, d.pnp && d.pnp !== '0' ? d.pnp : null].filter(Boolean).join(' ')
  const inside = [i.es && `Esc. ${i.es}`, i.pt && `Pl. ${i.pt}`, i.pu && `Pta. ${i.pu}`].filter(Boolean).join(' ')
  const rustic = dt?.locs?.lors?.lorus ? [dt.locs.lors.lorus.npa, dt.locs.lors.lorus.cpp && `Pol. ${dt.locs.lors.lorus.cpp.cpo} Parc. ${dt.locs.lors.lorus.cpp.cpa}`].filter(Boolean).join(' ') : ''
  return [street || rustic, inside, dt?.nm].filter(Boolean).join(' · ')
}

async function ovc(path: string) {
  const r = await fetch(`${OVC}/${path}`, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Catastro respondió ${r.status}`)
  return await r.json() as J
}

/** Datos de una referencia catastral: si es un solo inmueble, su ficha; si hay varios (pisos), la lista para elegir */
async function byRc(rc: string) {
  const res = (await ovc(`COVCCallejero.svc/json/Consulta_DNPRC?RefCat=${encodeURIComponent(rc)}`)).consulta_dnprcResult ?? {}
  const err = arr(res.lerr)[0]
  if (err) return { error: String(err.des ?? 'Referencia no encontrada') }
  if (res.bico) {
    const b = res.bico, bi = b.bi ?? {}
    const lcons = arr(b.lcons).map((c: J) => ({ use: String(c.lcd ?? ''), m2: num(c.dfcons?.stl) })).filter(c => c.m2)
    return {
      property: {
        rc: rcOf(bi.idbi?.rc), address: String(bi.ldt ?? addressOf(bi.dt)), use: bi.debi?.luso ?? null,
        built_m2: num(bi.debi?.sfc), year: num(bi.debi?.ant), plot_m2: num(b.finca?.dff?.ss), kind: b.finca?.ltp ?? null,
        parts: lcons.slice(0, 12), map: b.finca?.infgraf?.igraf ?? null, rural: bi.idbi?.cn === 'RU'
      }
    }
  }
  const units = arr(res.lrcdnp?.rcdnp).slice(0, 60).map((u: J) => ({
    rc: rcOf(u.rc), address: addressOf(u.dt), use: u.debi?.luso ?? null, built_m2: num(u.debi?.sfc), year: num(u.debi?.ant)
  }))
  return { units }
}

/** Parcelas alrededor de un punto (la más cercana primero) */
async function nearby(lat: number, lng: number) {
  const res = (await ovc(`COVCCoordenadas.svc/json/Consulta_RCCOOR_Distancia?SRS=EPSG:4326&CoorX=${lng}&CoorY=${lat}`)).Consulta_RCCOOR_DistanciaResult ?? {}
  const err = arr(res.lerr)[0]
  if (err) return { error: String(err.des ?? 'Sin referencia para ese punto') }
  const list = arr(res.coordenadas_distancias?.coordd).flatMap((c: J) => arr(c.lpcd)).map((p: J) => ({
    rc: `${p.pc?.pc1 ?? ''}${p.pc?.pc2 ?? ''}`, address: String(p.ldt ?? ''), dis: Number(p.dis ?? 0)
  })).filter(p => p.rc.length === 14)
  return { candidates: list.slice(0, 8) }
}

/** Calado (m) de la zona inundable en un punto para un periodo de retorno; null si no está en zona cartografiada */
async function depth(lat: number, lng: number, layer: string) {
  const d = 0.0004
  const url = `${FLOOD}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}&STYLES=&CRS=EPSG:4326` +
    `&BBOX=${lat - d},${lng - d},${lat + d},${lng + d}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/plain`
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!r.ok) throw new Error(`El mapa de inundaciones respondió ${r.status}`)
  const t = await r.text()
  const m = t.match(/GRAY_INDEX\s*=\s*(-?[\d.]+(?:E[+-]?\d+)?)/i)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) && v > 0 && v < 100 ? Math.round(v * 100) / 100 : null
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

  const body = await req.json().catch(() => ({})) as J
  const lat = Number(body.lat), lng = Number(body.lng)
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && lat > 27 && lat < 44 && lng > -19 && lng < 5
  try {
    if (body.mode === 'catastro') {
      const rc = String(body.rc ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
      if (rc) {
        if (!/^[0-9A-Z]{14}([0-9A-Z]{6})?$/.test(rc)) return json({ error: 'La referencia catastral tiene 14 o 20 caracteres' }, 400)
        return json(await byRc(rc))
      }
      if (!hasPoint) return json({ error: 'Hace falta la referencia catastral o la ubicación del piso' }, 400)
      return json(await nearby(lat, lng))
    }
    if (body.mode === 'flood') {
      if (!hasPoint) return json({ error: 'Hace falta la ubicación del piso' }, 400)
      const [t100, t500] = await Promise.all([depth(lat, lng, 'NZ.Flood.FluvialT100'), depth(lat, lng, 'NZ.Flood.FluvialT500')])
      return json({ t100, t500 })
    }
    return json({ error: 'Modo no válido' }, 400)
  } catch (e) {
    return json({ error: `No se ha podido consultar (${String((e as Error).message ?? e).slice(0, 120)})` }, 502)
  }
})
