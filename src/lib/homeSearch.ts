// «Buscar casas con IA» (Buscamos): petición con vuestros criterios para ChatGPT/Claude/Gemini y lectura de su respuesta
import {
  DISCARD_CATS, FEATURES, REJECT_REASONS, criteriaLabel, price,
  type Cooling, type Criteria, type HeatingType, type Home, type Rejection
} from './mudanza'
import { PARTIDA, type ReformState } from './reforma'

export type HomeDraft = {
  title: string; url: string | null; price_cents: number | null; size_m2: number | null; useful_m2: number | null; plot_m2: number | null
  rooms: number | null; baths: number | null; year_built: number | null; municipality: string | null; zone: string | null; address: string | null
  floor: string | null; features: string[]; heating_type: HeatingType | null; cooling: Cooling | null; energy: string | null
  advertiser: 'agencia' | 'particular' | null; agency: string | null; listing_ref: string | null; contact_phone: string | null
  reform_state: ReformState | null; reform_items: string[]; published: string | null; note: string | null
}

const HEAT: HeatingType[] = ['gas_natural', 'gasoil', 'propano', 'electrica', 'aerotermia', 'geotermia', 'biomasa', 'central', 'ninguna']
const COOL: Cooling[] = ['no', 'splits', 'conductos', 'aerotermia']

/** Lo aprendido de rechazos («No nos interesa») y descartes, en corto (la petición tiene que caber en el enlace a la IA) */
function learnings(homes: Home[], rejections: Rejection[]) {
  const out: string[] = []
  const cut = (x: string | null | undefined, n: number) => (x ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
  for (const r of rejections.filter(r => !r.reproposed_at).slice(0, 10)) {
    out.push(`- ${r.reason ? REJECT_REASONS[r.reason].replace(/^\S+\s/, '') : 'no'}: ${[cut(r.municipality, 30), r.price_cents ? kShort(r.price_cents) : null, r.plot_m2 ? `parcela ${r.plot_m2} m²` : null].filter(Boolean).join(', ')}`)
  }
  for (const h of homes.filter(h => h.status === 'descartado' && h.discard_category && !['vendida', 'otra'].includes(h.discard_category)).slice(0, 10)) {
    out.push(`- ${DISCARD_CATS[h.discard_category!].replace(/^\S+\s/, '')}${h.discard_reason ? ` («${cut(h.discard_reason, 60)}»)` : ''}: ${[cut(h.municipality, 30), h.price_cents ? kShort(h.price_cents) : null].filter(Boolean).join(', ')}`)
  }
  return out
}
const kShort = (c: number) => `${Math.round(c / 100000)} k€`
/** «idealista 111553510» en vez del enlace entero (para no alargar la petición) */
function shortRef(url: string | null, title: string | null, town: string | null) {
  if (url) {
    try {
      const u = new URL(url)
      const host = u.hostname.replace(/^www\./, '').split('.')[0]
      const id = u.pathname.split('/').filter(Boolean).pop() ?? ''
      return `${host} ${id.slice(0, 40)}`
    } catch { /* sigue */ }
  }
  return `${(title ?? '').slice(0, 40)}${town ? ` (${town})` : ''}`
}

export function homeSearchPrompt(c: Criteria | null, homes: Home[], rejections: Rejection[], extra: string) {
  const crit = [
    c?.max_price_cents ? `- Presupuesto PARA ENTRAR A VIVIR (precio + reforma + impuestos y gastos de compra ≈ 6,5 % + honorarios si los hay): hasta ${price(c.max_price_cents)}. El precio del anuncio tiene que dejar margen para eso.` : null,
    c?.municipalities.length ? `- Localidades: ${c.municipalities.join(', ')}${c.zones.length ? ` (zonas: ${c.zones.join(', ')})` : ''}. Puedes incluir alguna de los alrededores si es muy buena, avisándolo en la nota.` : c?.zones.length ? `- Zonas: ${c.zones.join(', ')}` : null,
    c?.min_rooms ? `- Mínimo ${c.min_rooms} habitaciones` : null,
    c?.min_m2 ? `- Mínimo ${c.min_m2} m² construidos` : null,
    c?.must_haves.length ? `- IMPRESCINDIBLE: ${c.must_haves.map(criteriaLabel).join(', ')}` : null,
    c?.nice_to_haves.length ? `- Valoramos (suma, no obliga): ${c.nice_to_haves.map(criteriaLabel).join(', ')}` : null
  ].filter(Boolean)
  const learned = learnings(homes, rejections)
  // Lo que ya tenemos (para no repetirlo): enlaces y, si no hay, título y localidad
  const have = [...new Set([
    ...homes.map(h => shortRef(h.url, h.title, h.municipality)),
    ...rejections.map(r => shortRef(r.url, r.title, r.municipality))
  ].filter(x => x.trim()))].slice(0, 60)
  return [
    'Busca casas EN VENTA que encajen con lo que buscamos (familia con 2 hijos), con la búsqueda web: idealista, fotocasa, pisos.com, habitaclia, yaencontre e inmobiliarias de la zona.',
    'Qué buscamos:', ...crit,
    extra.trim() ? `En esta búsqueda, además: ${extra.trim()}` : '',
    learned.length ? 'No nos ha gustado (evita casas parecidas):\n' + learned.join('\n') : '',
    have.length ? `Ya las tenemos o rechazadas, NO las propongas (portal y referencia): ${have.join('; ')}` : '',
    'Reglas: solo anuncios que sigan publicados (abre el enlace para comprobarlo); prioriza los recientes y las bajadas de precio; máximo 10, los mejores primero; no inventes datos: lo que el anuncio no diga, null. Fuera: ocupadas, nuda propiedad, subastas.',
    `Extras posibles (solo estas claves): ${Object.keys(FEATURES).join(', ')}.`,
    `Reforma: estado para entrar a vivir mirando texto y fotos (listo | lavado | parcial | integral) y SOLO las partidas que se vean claramente (si dudas, no la pongas): ${Object.keys(PARTIDA).join(', ')}.`,
    'RESPONDE SOLO con este JSON (sin texto antes ni después):',
    `{"casas": [{"titulo": "", "url": "https://…", "precio": 0, "m2": 0, "m2_utiles": null, "parcela": null, "habitaciones": 0, "banos": 0, "ano": null, "localidad": "", "zona": "", "direccion": null, "planta": null, "extras": [], "calefaccion": "${HEAT.join('|')}", "aire": "${COOL.join('|')}", "certificado": null, "anunciante": "agencia|particular", "agencia": null, "referencia": null, "telefono": null, "estado_reforma": "listo|lavado|parcial|integral", "partidas": [], "fecha_anuncio": "AAAA-MM-DD", "nota": "1–3 frases: por qué encaja, qué le falta y precio para entrar a vivir estimado"}]}`,
    'Precios en euros.'
  ].filter(Boolean).join('\n\n')
}

export type HomeParse = { items: HomeDraft[]; error?: string }

export function parseHomeSearch(text: string): HomeParse {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let data: { casas?: unknown[] }
  try { data = JSON.parse(raw) } catch { return { items: [], error: 'No entiendo la respuesta: copia solo el bloque JSON que devuelve la IA.' } }
  const num = (x: unknown) => { const n = typeof x === 'string' ? Number(x.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) : Number(x); return Number.isFinite(n) && n > 0 ? n : null }
  const int = (x: unknown) => { const n = num(x); return n == null ? null : Math.round(n) }
  const str = (x: unknown, max = 160) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null)
  const one = <T extends string>(x: unknown, ok: readonly T[]) => (typeof x === 'string' && (ok as readonly string[]).includes(x) ? x as T : null)
  const items: HomeDraft[] = []
  for (const p of (Array.isArray(data.casas) ? data.casas : []).slice(0, 20) as Record<string, unknown>[]) {
    const url = str(p.url, 500)
    const pEur = num(p.precio)
    const year = int(p.ano)
    const feats = (Array.isArray(p.extras) ? p.extras : []).filter((k): k is string => typeof k === 'string' && k in FEATURES)
    const parts = (Array.isArray(p.partidas) ? p.partidas : []).filter((k): k is string => typeof k === 'string' && k in PARTIDA)
    const state = one(p.estado_reforma, ['listo', 'lavado', 'parcial', 'integral'] as const)
    const date = typeof p.fecha_anuncio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_anuncio) ? p.fecha_anuncio : null
    const energy = typeof p.certificado === 'string' && /^[A-G]$/i.test(p.certificado.trim()) ? p.certificado.trim().toUpperCase() : null
    items.push({
      title: str(p.titulo) ?? 'Casa propuesta', url: url && /^https?:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : null,
      price_cents: pEur != null ? Math.round(pEur * 100) : null, size_m2: num(p.m2), useful_m2: num(p.m2_utiles), plot_m2: num(p.parcela),
      rooms: int(p.habitaciones), baths: int(p.banos), year_built: year && year >= 1700 && year <= 2100 ? year : null,
      municipality: str(p.localidad, 80), zone: str(p.zona, 80), address: str(p.direccion, 200), floor: str(p.planta, 40),
      features: [...new Set(feats)], heating_type: one(p.calefaccion, HEAT), cooling: one(p.aire, COOL), energy,
      advertiser: one(p.anunciante, ['agencia', 'particular'] as const), agency: str(p.agencia, 120), listing_ref: str(p.referencia, 60),
      contact_phone: str(p.telefono, 40), reform_state: state, reform_items: state === 'listo' ? [] : [...new Set(parts)],
      published: date, note: str(p.nota, 600)
    })
  }
  return { items }
}
