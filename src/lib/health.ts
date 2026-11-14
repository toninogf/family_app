// «Estado y riesgos» de un piso: lo que se calcula solo (Catastro, inundable, radón, historial), lo que aporta la IA
// y lo que hay que comprobar con papeles. Cada comprobación: s = ok | warn | bad | unknown.
import { fold } from '../data/places'
import type { DocFile, Home } from './mudanza'

export type HealthStatus = 'ok' | 'warn' | 'bad' | 'unknown'
export type HealthItem = { s: HealthStatus; n?: string; src?: 'auto' | 'ia' | 'manual'; files?: DocFile[] }
export type Health = Record<string, HealthItem>
export type Cadastre = {
  rc: string; address: string; use: string | null; built_m2: number | null; year: number | null; plot_m2: number | null
  kind: string | null; parts?: { use: string; m2: number | null }[]; map?: string | null; rural?: boolean; at: string
}
export type Flood = { t100: number | null; t500: number | null; at: string }
/** Precios de la zona: lo que se paga en notaría y lo que se pide en portales (€/m²) */
export type Market = { paid_m2?: number | null; asking_m2?: number | null; paid_note?: string; asking_note?: string; at: string }

export const STATUS_ICON: Record<HealthStatus, string> = { ok: '✅', warn: '⚠️', bad: '⛔', unknown: '❓' }
export const STATUS_LABEL: Record<HealthStatus, string> = { ok: 'Bien', warn: 'Revisar', bad: 'Problema', unknown: 'Sin datos' }

/** Lo que busca la IA (se marca «a confirmar») */
export const AI_CHECKS: { key: string; title: string; hint: string }[] = [
  { key: 'ite', title: 'ITE y licencias', hint: 'Inspección técnica del edificio pasada, licencia de primera ocupación, obras o ampliaciones sin licencia.' },
  { key: 'urbanizacion', title: 'Urbanización recepcionada', hint: 'Si el ayuntamiento no se ha hecho cargo, los vecinos pagan calles, alumbrado y mantenimiento (a veces una cuota aparte).' },
  { key: 'vpo', title: 'Vivienda protegida (VPO)', hint: 'Limita el precio de venta y quién puede comprarla.' },
  { key: 'ocupacion', title: 'Libre, alquilada u ocupada', hint: '«Nuda propiedad», «con inquilino» o «sin posesión» son señales de que no se entrega libre.' },
  { key: 'saneamiento', title: 'Saneamiento y agua', hint: 'Alcantarillado o fosa séptica; agua de red o pozo.' },
  { key: 'ruido', title: 'Ruido', hint: 'Cerca de autopista, aeropuerto, tren o zona de ocio. En la visita: calle, vecinos, bares, ascensor.' },
  { key: 'precio_zona', title: 'Precio de la zona', hint: 'Precio medio del m² en compraventas reales (penotariado.com) comparado con el de este piso.' }
]
/** Lo que solo se sabe pidiendo papeles o yendo a verlo */
export const MANUAL_CHECKS: { key: string; title: string; hint: string; link?: { label: string; url: string } }[] = [
  { key: 'nota_simple', title: 'Nota simple (cargas)', hint: 'Titular, hipotecas, embargos, usufructos y afecciones. Unos 10 €.', link: { label: 'Pedirla en registradores.org', url: 'https://www.registradores.org' } },
  { key: 'comunidad', title: 'Comunidad: deudas y derramas', hint: 'Certificado del administrador y últimas actas (derramas aprobadas o previstas). En la visita: ¿hay alguna derrama prevista (fachada, ascensor…)? La cuota al mes va en Editar → El dinero.' },
  { key: 'instalaciones', title: 'Caldera, agua y electricidad', hint: 'Año y última revisión de la caldera; abre un grifo y la ducha (presión y agua caliente); cuadro eléctrico moderno, enchufes suficientes, boletín y potencia.' },
  { key: 'revision', title: 'Revisión técnica', hint: 'Un arquitecto o aparejador antes de comprar: humedades, grietas, tejado, estructura.' }
]

/** Lo que solo se ve yendo a la casa (antes era la lista de cada visita; ahora queda en la ficha) */
export const VISIT_CHECKS: { key: string; title: string; hint: string }[] = [
  { key: 'luz', title: 'Luz y orientación', hint: 'A qué hora da el sol en el salón y los dormitorios.' },
  { key: 'humedad', title: 'Humedades y grietas', hint: 'Techos, esquinas, baños y detrás de los muebles.' },
  { key: 'ventanas', title: 'Ventanas y aislamiento', hint: 'Doble acristalamiento, corrientes, persianas.' },
  { key: 'zona_visita', title: 'La zona en persona', hint: 'Aparcar, tiendas, parques; si podéis, volved de noche.' },
  { key: 'motivo', title: 'Por qué venden y desde cuándo', hint: 'Ayuda a negociar: prisa, herencia, cambio de casa…' }
]

// ---------- Radón (Comunidad de Madrid, CTE DB HS-6: Zona II = más radón) ----------
const RADON_II = ['Alameda del Valle', 'Aldea del Fresno', 'Alpedrete', 'Becerril de la Sierra', 'Berzosa del Lozoya', 'Braojos', 'Brunete',
  'Buitrago del Lozoya', 'Bustarviejo', 'Cabanillas de la Sierra', 'Cadalso de los Vidrios', 'Canencia', 'Cenicientos', 'Cercedilla',
  'Cervera de Buitrago', 'Chapinería', 'Collado Mediano', 'Collado Villalba', 'Colmenar del Arroyo', 'Colmenar Viejo', 'Colmenarejo',
  'El Álamo', 'El Berrueco', 'El Boalo', 'El Escorial', 'El Molar', 'El Vellón', 'Fresnedillas de la Oliva', 'Galapagar',
  'Garganta de los Montes', 'Gargantilla del Lozoya y Pinilla de Buitrago', 'Gascones', 'Guadalix de la Sierra', 'Guadarrama',
  'Horcajo de la Sierra-Aoslos', 'Horcajuelo de la Sierra', 'Hoyo de Manzanares', 'La Acebeda', 'La Cabrera', 'La Hiruela',
  'La Serna del Monte', 'Las Rozas de Madrid', 'Los Baldios', 'Los Molinos', 'Lozoya', 'Lozoyuela-Navas-Sieteiglesias', 'Madarcos',
  'Manzanares el Real', 'Miraflores de la Sierra', 'Montejo de la Sierra', 'Moralzarzal', 'Navacerrada', 'Navalafuente', 'Navalagamella',
  'Navalcarnero', 'Navarredonda y San Mamés', 'Navas del Rey', 'Pedrezuela', 'Pelayos de la Presa', 'Piñuécar-Gandullas',
  'Puebla de la Sierra', 'Puentes Viejas', 'Prádena del Rincón', 'Rascafría', 'Robledillo de la Jara', 'Robledo de Chavela', 'Robregordo',
  'Rozas de Puerto Real', 'San Lorenzo de El Escorial', 'San Martín de Valdeiglesias', 'Santa María de la Alameda', 'Sevilla la Nueva',
  'Somosierra', 'Soto del Real', 'Torrelaguna', 'Torrelodones', 'Tres Cantos', 'Valdemanco', 'Valdemaqueda', 'Valdemorillo', 'Venturada',
  'Villa del Prado', 'Villamanta', 'Villamantilla', 'Villanueva de Perales', 'Villavieja del Lozoya', 'Zarzalejo']
const RADON_I = ['Ajalvir', 'Alcalá de Henares', 'Alcobendas', 'Alcorcón', 'Algete', 'Aranjuez', 'Arganda del Rey', 'Batres',
  'Camarma de Esteruelas', 'Casarrubuelos', 'Cobeña', 'Colmenar de Oreja', 'Coslada', 'Cubas de la Sagra', 'Daganzo de Arriba', 'El Atazar',
  'Fresno de Torote', 'Fuenlabrada', 'Fuente el Saz de Jarama', 'Fuentidueña de Tajo', 'Getafe', 'Griñón', 'Leganés', 'Loeches',
  'Los Santos de la Humosa', 'Meco', 'Mejorada del Campo', 'Morata de Tajuña', 'Paracuellos de Jarama', 'Patones', 'Perales de Tajuña',
  'Pinilla del Valle', 'Pinto', 'Quijorna', 'Redueña', 'San Agustín del Guadalix', 'San Fernando de Henares', 'San Martín de la Vega',
  'San Sebastián de los Reyes', 'Talamanca de Jarama', 'Tielmes', 'Titulcia', 'Torrejón de Ardoz', 'Torrejón de Velasco',
  'Torremocha de Jarama', 'Torres de la Alameda', 'Valdeavero', 'Valdeolmos-Alalpardo', 'Valdepiélagos', 'Valdetorres de Jarama',
  'Valverde de Alcalá', 'Velilla de San Antonio', 'Villaconejos', 'Villalbilla', 'Villamanrique de Tajo', 'Villanueva de la Cañada',
  'Villanueva del Pardillo', 'Villaviciosa de Odón']
const norm = (s: string) => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const R2 = new Set(RADON_II.map(norm)), R1 = new Set(RADON_I.map(norm))

export function radonCheck(h: Pick<Home, 'municipality' | 'province'>): HealthItem {
  if (!h.municipality) return { s: 'unknown', n: 'Sin localidad', src: 'auto' }
  if (h.province && h.province !== 'Madrid') return { s: 'unknown', n: 'La lista de municipios de la app es solo de la Comunidad de Madrid', src: 'auto' }
  const m = norm(h.municipality)
  if (R2.has(m)) return { s: 'warn', n: 'Municipio de zona II (la de más radón). Importa en sótanos y plantas bajas: se puede medir y se corrige ventilando.', src: 'auto' }
  if (R1.has(m)) return { s: 'warn', n: 'Municipio de zona I (radón moderado). Conviene medirlo si hay sótano o planta baja.', src: 'auto' }
  return { s: 'ok', n: 'El municipio no está en las zonas de radón', src: 'auto' }
}

export function floodCheck(h: Pick<Home, 'lat' | 'lng' | 'geo_precision'> & { flood: Flood | null }): HealthItem {
  if (!h.flood) return { s: 'unknown', n: h.lat == null ? 'Primero hay que situar el piso en el mapa' : 'Sin comprobar', src: 'auto' }
  const approx = h.geo_precision === 'zona' || h.geo_precision === 'localidad'
  const f = h.flood
  if (f.t100 != null) return { s: 'bad', n: `En zona inundable cada 100 años (agua hasta ${f.t100} m)${approx ? ' · posición aproximada' : ''}`, src: 'auto' }
  if (f.t500 != null) return { s: 'warn', n: `En zona inundable cada 500 años (agua hasta ${f.t500} m)${approx ? ' · posición aproximada' : ''}`, src: 'auto' }
  return { s: approx ? 'unknown' : 'ok', n: approx ? 'Sin riesgo en el punto aproximado; pon la dirección exacta para asegurarlo' : 'Fuera de las zonas inundables cartografiadas', src: 'auto' }
}

const pctDiff = (a: number, b: number) => Math.round(((a - b) / b) * 100)
/** Catastro frente al anuncio: diferencias de metros suelen ser ampliaciones sin legalizar */
export function cadastreCheck(h: Pick<Home, 'size_m2' | 'plot_m2' | 'year_built' | 'features'> & { cadastre: Cadastre | null }): HealthItem {
  const c = h.cadastre
  if (!c) return { s: 'unknown', n: 'Sin consultar', src: 'auto' }
  const notes: string[] = []
  let s: HealthStatus = 'ok'
  const flat = /division horizontal/i.test(c.kind ?? '')
  if (c.built_m2 && h.size_m2) {
    const d = pctDiff(Number(h.size_m2), c.built_m2)
    if (d >= 15) { s = 'warn'; notes.push(`El anuncio dice ${Number(h.size_m2)} m² y el Catastro ${c.built_m2} m² (${d} % más): puede haber ampliaciones sin legalizar`) }
    else if (d <= -15) notes.push(`El anuncio dice ${Number(h.size_m2)} m² y el Catastro ${c.built_m2} m²`)
  }
  if (!flat && c.plot_m2 && h.plot_m2) {
    const d = pctDiff(Number(h.plot_m2), c.plot_m2)
    if (Math.abs(d) >= 10) { s = 'warn'; notes.push(`Parcela: anuncio ${Number(h.plot_m2)} m², Catastro ${c.plot_m2} m²`) }
  }
  if (c.year && h.year_built && Math.abs(c.year - h.year_built) >= 5) notes.push(`Año: anuncio ${h.year_built}, Catastro ${c.year}`)
  if (c.use && !/residencial/i.test(c.use)) { s = 'warn'; notes.push(`Uso en Catastro: ${c.use} (no residencial)`) }
  if (c.rural) { s = 'warn'; notes.push('Está en suelo rústico: limita obras y ampliaciones') }
  // Elementos del anuncio que el Catastro no recoge (en casas; en pisos van en la comunidad o en otra referencia)
  const missing = missingInCadastre(h.features ?? [], c)
  if (missing.length) { s = 'warn'; notes.push(`El anuncio tiene ${missing.join(', ')} y el Catastro no lo recoge: puede estar sin declarar`) }
  return { s, n: notes.length ? notes.join('. ') : 'Coincide con el anuncio', src: 'auto' }
}

export function marketCheck(h: Pick<Home, 'created_at' | 'price_cents' | 'links' | 'size_m2' | 'market'>, health: Health): HealthItem {
  const notes: string[] = []
  let s: HealthStatus = 'ok'
  const days = Math.floor((Date.now() - new Date(h.created_at).getTime()) / 86400000)
  if (days >= 1) notes.push(`Lo guardasteis hace ${days} día${days === 1 ? '' : 's'}`)
  const cheaper = (h.links ?? []).filter(l => l.price_cents != null && h.price_cents != null && l.price_cents < h.price_cents)
  if (cheaper.length) { s = 'warn'; notes.push(`Más barato en ${cheaper.map(l => l.label || 'otra web').join(', ')}`) }
  const mk = h.market
  const ours = h.price_cents && h.size_m2 ? h.price_cents / 100 / Number(h.size_m2) : null
  if (mk && (mk.paid_m2 || mk.asking_m2)) {
    const fmt = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €/m²`
    notes.push(['Zona:', mk.asking_m2 && `se pide ~${fmt(mk.asking_m2)} en portales`, mk.paid_m2 && `se paga ~${fmt(mk.paid_m2)} en notaría`, ours && `este piso ${fmt(ours)}`].filter(Boolean).join(' '))
    const ref = mk.paid_m2 ?? (mk.asking_m2 ? mk.asking_m2 * 0.9 : null)
    if (ours && ref && ours > ref * 1.2) s = 'warn'
  } else if (health.precio_zona?.n) notes.push(health.precio_zona.n)
  return { s: notes.length ? s : 'unknown', n: notes.join(' · ') || 'Sin datos', src: 'auto' }
}

/** Qué elementos del anuncio (piscina, garaje, trastero, porche/terraza) no aparecen en el desglose del Catastro */
export function missingInCadastre(features: string[], c: Cadastre) {
  if (!c.parts?.length || /division horizontal/i.test(c.kind ?? '')) return []
  const uses = c.parts.map(p => p.use.toUpperCase()).join(' | ')
  const map: [string, string, RegExp][] = [
    ['piscina', 'piscina', /PISCINA|DEPORTIV/], ['garaje', 'garaje', /APARCAMIENTO|GARAJE/],
    ['trastero', 'trastero', /ALMAC|TRASTERO/]
  ]
  return map.filter(([f, , re]) => features.includes(f) && !re.test(uses)).map(([, label]) => label)
}

/** Todas las comprobaciones de un piso, para el semáforo */
export function allChecks(h: Home): { key: string; title: string; item: HealthItem }[] {
  const health = (h.health ?? {}) as Health
  const auto = [
    { key: 'catastro', title: 'Catastro', item: cadastreCheck(h as never) },
    { key: 'inundable', title: 'Zona inundable', item: floodCheck(h as never) },
    { key: 'radon', title: 'Radón', item: radonCheck(h) },
    { key: 'mercado', title: 'Precio e historial', item: marketCheck(h, health) }
  ]
  const rest = [...AI_CHECKS, ...MANUAL_CHECKS, ...VISIT_CHECKS].filter(c => c.key !== 'precio_zona')
    .map(c => ({ key: c.key, title: c.title, item: health[c.key] ?? { s: 'unknown' as HealthStatus } }))
  return [...auto, ...rest]
}

/**
 * Las dos partes de «Estado y documentos» en la ficha:
 * - docs: papeles y situación legal (Catastro, inundable, radón, precio, nota simple, comunidad, ITE, VPO, ocupación…)
 * - estado: cómo está la casa, lo que se comprueba yendo a verla (instalaciones, humedades, luz, ruido…)
 */
export const ESTADO_KEYS = ['saneamiento', 'ruido', 'instalaciones', 'revision', ...VISIT_CHECKS.map(c => c.key)]
export const partOf = (key: string): 'docs' | 'estado' => (ESTADO_KEYS.includes(key) ? 'estado' : 'docs')

export function healthCounts(h: Home, part?: 'docs' | 'estado') {
  const c = { ok: 0, warn: 0, bad: 0, unknown: 0 }
  for (const x of allChecks(h)) if (!part || partOf(x.key) === part) c[x.item.s]++
  return c
}

/** Lo que dice la IA en cada clave → estado orientativo (siempre «a confirmar») */
export function aiStatus(key: string, text: string): HealthStatus {
  const t = fold(text).toLowerCase()
  // Se le pide a la IA que empiece por BIEN, REVISAR, PROBLEMA o NO CONSTA
  const head = t.match(/^\s*(bien|revisar|problema|no consta)\b/)?.[1]
  if (head) return head === 'bien' ? 'ok' : head === 'revisar' ? 'warn' : head === 'problema' ? 'bad' : 'unknown'
  if (/^(no (se )?(sabe|indica|consta|aparece|menciona)|desconoc|sin (datos|informacion))/.test(t)) return 'unknown'
  const bad: Record<string, RegExp> = {
    ite: /desfavorable|sin licencia|ilegal|no legaliz|pendiente de legaliz/,
    urbanizacion: /no (esta )?recepcionad|sin recepcionar|entidad (urbanistica )?de conservacion/,
    vpo: /^(si|es)\b|proteccion oficial|protegida|vpo|vppl|vppb/,
    ocupacion: /ocupad|okup|sin posesion|nuda propiedad|inquilino|alquilad/,
    saneamiento: /fosa|pozo|depuradora propia/,
    ruido: /autopista|autovia|aeropuerto|via del tren|ferrocarril|ruidos?o/
  }
  const ok: Record<string, RegExp> = {
    ite: /favorable|al dia|pasada|en regla|no (le )?(aplica|necesita)|edificio nuevo/,
    urbanizacion: /recepcionad|municipal|no es urbanizacion|casco urbano/,
    vpo: /^no\b|libre|vivienda libre/,
    ocupacion: /libre|vacia|a la entrega|entrega inmediata/,
    saneamiento: /alcantarillado|red municipal|agua de red/,
    ruido: /tranquil|sin ruido|silencios/
  }
  if (bad[key]?.test(t)) return key === 'vpo' || key === 'ocupacion' ? 'bad' : 'warn'
  if (ok[key]?.test(t)) return 'ok'
  return 'unknown'
}
