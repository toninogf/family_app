// Colegios cercanos a cada piso, con los datos abiertos de la Comunidad de Madrid (tabla public.schools, se refresca cada mes).
// Las coordenadas vienen en UTM ETRS89 huso 30: se pasa la ubicación del piso a UTM y se mide en metros.
import { supabase } from './supabase'

export type SchoolKind = 'infantil' | 'primaria' | 'prim_sec' | 'secundaria' | 'internacional'
export type Ownership = 'publico' | 'concertado' | 'privado'
export type School = {
  code: number; name: string; kind: SchoolKind; type_abbr: string; type_desc: string | null; ownership: Ownership
  municipality: string | null; address: string | null; phone: string | null; web: string | null; email: string | null
  utm_x: number; utm_y: number; bilingual: string | null
}
export type NearSchool = School & { dist: number; walk: number; car: number }

export const KIND_LABEL: Record<SchoolKind, string> = {
  infantil: 'Infantil (0–6)', primaria: 'Infantil y Primaria', prim_sec: 'Primaria y Secundaria', secundaria: 'Secundaria (ESO y Bach.)', internacional: 'Internacional'
}
export const OWN_LABEL: Record<Ownership, string> = { publico: 'Público', concertado: 'Concertado', privado: 'Privado' }

/** WGS84 → UTM huso 30 (ETRS89 es prácticamente igual a WGS84 para esto) */
export function toUtm30(lat: number, lng: number) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const phi = (lat * Math.PI) / 180, lam = (lng * Math.PI) / 180, lam0 = (-3 * Math.PI) / 180
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lam0)
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  const x = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000
  const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720))
  return { x: Math.round(x), y: Math.round(y) }
}

/** Minutos aproximados: andando (calles ≈ 1,3 × línea recta, 80 m/min) y en coche (≈ 1,4 ×, 450 m/min + 2 min de aparcar) */
export const walkMin = (d: number) => Math.max(1, Math.round((d * 1.3) / 80))
export const carMin = (d: number) => Math.max(2, Math.round((d * 1.4) / 450 + 2))

const cache = new Map<string, Promise<NearSchool[]>>()
/** Colegios en un radio (metros) alrededor del piso, del más cercano al más lejano */
export function nearbySchools(lat: number, lng: number, radius = 4000): Promise<NearSchool[]> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${radius}`
  if (!cache.has(key)) {
    const { x, y } = toUtm30(lat, lng)
    const p = (async () => {
      const { data, error } = await supabase.from('schools')
        .select('code, name, kind, type_abbr, type_desc, ownership, municipality, address, phone, web, email, utm_x, utm_y, bilingual')
        .gte('utm_x', x - radius).lte('utm_x', x + radius).gte('utm_y', y - radius).lte('utm_y', y + radius).limit(400)
      if (error) { cache.delete(key); throw new Error(error.message) }
      return ((data ?? []) as School[])
        .filter(s => s.type_abbr !== 'ZNAS.CN.') // zonas de casas de niños: repiten la escuela
        .map(s => { const dist = Math.round(Math.hypot(s.utm_x - x, s.utm_y - y)); return { ...s, dist, walk: walkMin(dist), car: carMin(dist) } })
        .filter(s => s.dist <= radius)
        .sort((a, b) => a.dist - b.dist)
    })()
    cache.set(key, p)
  }
  return cache.get(key)!
}

/** Prefijo habitual: CEIP, IES, Colegio concertado… */
export function schoolTitle(s: School) {
  const name = s.name.toLowerCase().replace(/(^|[\s(.'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|El|Y|E)\b/g, w => w.toLowerCase()).replace(/^(\p{L})/u, c => c.toUpperCase())
  const pre = s.type_abbr === 'CP INF-PRI' ? 'CEIP' : s.type_abbr === 'CP INF-PRI-SEC' ? 'CEIPSO' : s.type_abbr === 'IES' ? 'IES'
    : s.type_abbr.startsWith('EEI') ? 'Escuela infantil' : s.type_abbr === 'EIPR' ? 'Escuela infantil' : s.kind === 'internacional' ? 'Colegio extranjero'
      : 'Colegio'
  return `${pre} ${name}`
}

/** Distancia legible */
export const distLabel = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`)

/** Resumen para comparar: cuántos a menos de 1,5 km y el público de primaria más cercano */
export function schoolSummary(list: NearSchool[]) {
  const school = list.filter(s => s.kind !== 'infantil')
  const near = school.filter(s => s.dist <= 1500).length
  const pubPri = school.find(s => s.ownership === 'publico' && (s.kind === 'primaria' || s.kind === 'prim_sec'))
  const pubSec = school.find(s => s.ownership === 'publico' && (s.kind === 'secundaria' || s.kind === 'prim_sec'))
  const conc = school.find(s => s.ownership === 'concertado')
  return { near, pubPri, pubSec, conc, closest: school[0] }
}
