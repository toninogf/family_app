// Saca los datos de un piso del texto de un anuncio (Idealista, Fotocasa, pisos.com…): lo que se copia y pega
// de la ficha, el texto que comparte la app del portal o la vista previa del enlace.
import { fold, MUNICIPALITIES } from '../data/places'

export type ListingData = {
  title?: string
  price_eur?: number
  size_m2?: number
  rooms?: number
  baths?: number
  floor?: string
  features?: string[]
  energy?: string
  community_eur?: number
  ibi_eur?: number
  /** Suministros, media €/mes */
  power_eur?: number
  water_eur?: number
  heating_eur?: number
  address?: string
  zone?: string
  municipality?: string
  /** Lo que no tiene campo propio (parcela, año, resumen): va a Notas */
  notes?: string
  property_type?: string
  useful_m2?: number
  plot_m2?: number
  year_built?: number
  summary?: string
  /** Enlaces directos a las fotos del anuncio (si la IA los da) */
  photo_urls?: string[]
  advertiser?: 'agencia' | 'particular'
  agency?: string
  contact?: string
  phone?: string
  email?: string
  ref?: string
}

/** «1.250.000» / «350.000,50» / «95,5» → número */
function toNumber(s: string) {
  const t = s.trim()
  // Con punto de miles y sin coma decimal, o con ambos
  const clean = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(clean)
  return isFinite(n) ? n : undefined
}

const FEATURE_PATTERNS: [string, RegExp][] = [
  ['ascensor', /\bascensor\b/i],
  ['garaje', /\bgaraje\b|\bplaza de (garaje|aparcamiento|parking)\b|\bparking\b/i],
  ['trastero', /\btrastero\b/i],
  ['terraza', /\bterraza\b/i],
  ['exterior', /\bexterior\b/i],
  ['calefaccion', /\bcalefacci[oó]n\b/i],
  ['aire', /\baire acondicionado\b/i],
  ['jardin', /\bjard[ií]n\b/i],
  ['piscina', /\bpiscina\b/i],
  ['reformado', /\breformad[oa]\b|\bobra nueva\b/i]
]
// Frases que niegan una característica («sin ascensor», «no tiene garaje»)
const NEGATED = (key: string, text: string) => {
  const words: Record<string, string> = { ascensor: 'ascensor', garaje: '(garaje|parking)', trastero: 'trastero', terraza: 'terraza', piscina: 'piscina', jardin: 'jard[ií]n', calefaccion: 'calefacci[oó]n', aire: 'aire acondicionado' }
  if (key === 'reformado') return /\b(para|a) reformar\b|\bnecesita reforma\b/i.test(text)
  const w = words[key]
  return w ? new RegExp(`\\b(sin|no tiene|no dispone de)\\s+${w}`, 'i').test(text) : false
}

const MADRID_TOWNS = (MUNICIPALITIES['28'] ?? []).map(p => p.name)

export function parseListing(raw: string): ListingData {
  const text = raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
  const out: ListingData = {}

  // Precio: «350.000 €», «350.000€», «Precio: 350.000 euros». Se ignoran €/m², €/mes y bajadas de precio.
  const prices = [...text.matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:€|euros?)(?!\s*\/\s*(?:m|mes))/gi)]
    .map(m => toNumber(m[1].replace(/\s/g, '.')) ?? 0).filter(n => n >= 20000 && n <= 20000000)
  if (prices.length) out.price_eur = prices[0]

  // Metros: preferir construidos; si no, el primero que aparezca
  const built = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)\s*(?:construidos|const)/i)
  const anyM2 = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)(?![a-z0-9])(?!\s*(?:de parcela|parcela|de terreno|terreno|útiles|utiles))/i)
  const m2 = toNumber((built ?? anyM2)?.[1] ?? '')
  if (m2 && m2 >= 10 && m2 <= 5000) out.size_m2 = m2

  const rooms = text.match(/(\d{1,2})\s*(?:hab\.?|habitaciones?|habitación|dormitorios?)\b/i)
  if (rooms) out.rooms = Number(rooms[1])
  const baths = text.match(/(\d{1,2})\s*(?:baños?|aseos?)\b/i)
  if (baths) out.baths = Number(baths[1])

  // Planta: «Planta 3ª», «3ª planta», «Bajo», «Entreplanta», «Ático»
  const floorM = text.match(/\bplanta\s+(\d{1,2})\s*[ªº°]?/i) ?? text.match(/\b(\d{1,2})\s*[ªº°]\s*planta\b/i)
  if (floorM) out.floor = `${floorM[1]}º`
  else if (/\bplanta baja\b|\bbajo\b(?!s)/i.test(text)) out.floor = 'Bajo'
  else if (/\bentreplanta\b/i.test(text)) out.floor = 'Entreplanta'
  else if (/\b[aá]tico\b/i.test(text)) out.floor = 'Ático'
  else if (/\bs[oó]tano\b/i.test(text)) out.floor = 'Sótano'

  const feats = FEATURE_PATTERNS.filter(([k, re]) => re.test(text) && !NEGATED(k, text)).map(([k]) => k)
  if (feats.length) out.features = [...new Set(feats)]

  // Certificado energético: «Consumo: E», «Calificación energética: D», «Certificado energético ... C»
  const energy = text.match(/(?:[Cc]onsumo|[Cc]alificaci[oó]n energ[eé]tica|[Cc]ertificado energ[eé]tico)[^\n]{0,40}?\b([A-G])\b(?![a-záéíóúñ])/)
  if (energy) out.energy = energy[1]

  const fee = text.match(/(?:comunidad|gastos de comunidad)[^\d\n]{0,30}(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros)/i)
  if (fee) out.community_eur = toNumber(fee[1])
  const ibi = text.match(/\bIBI\b[^\d\n]{0,30}(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euros)/i)
  if (ibi) out.ibi_eur = toNumber(ibi[1])
  const supply = (re: RegExp) => { const x = text.match(re); return x ? toNumber(x[1]) : undefined }
  const pw = supply(/\b(?:luz|electricidad)\b[^\d\n]{0,25}(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros)\s*(?:\/|al |por )?\s*mes/i); if (pw) out.power_eur = pw
  const wt = supply(/\bagua\b[^\d\n]{0,25}(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros)\s*(?:\/|al |por )?\s*mes/i); if (wt) out.water_eur = wt
  const ht = supply(/\bcalefacci[oó]n\b[^\d\n]{0,25}(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros)\s*(?:\/|al |por )?\s*mes/i); if (ht) out.heating_eur = ht

  // «Piso en venta en Calle X, Barrio, Municipio» (formato de título de Idealista)
  const loc = text.match(/\ben venta en\s+([^\n—|]+)/i)
  if (loc) {
    const all = loc[1].replace(/\s+[-—–]\s*idealista.*$/i, '').split(',').map(s => s.trim()).filter(Boolean)
    // Solo la parte de la dirección: se corta en cuanto aparecen cifras (precio, metros, habitaciones…)
    const cut = all.findIndex(p => /\d|€/.test(p) && !/^(calle|c\/|avenida|avda|plaza|paseo|camino|carretera)/i.test(p))
    const parts = cut === -1 ? all : all.slice(0, cut)
    const town = [...parts].reverse().find(p => MADRID_TOWNS.some(t => fold(t) === fold(p)))
    if (town) out.municipality = MADRID_TOWNS.find(t => fold(t) === fold(town))
    const street = parts.find(p => /^(calle|c\/|avenida|avda|av\.|plaza|paseo|camino|carretera|ronda|glorieta|traves[ií]a|urbanizaci[oó]n|urb\.)/i.test(p))
    if (street) out.address = street
    const zone = parts.find(p => p !== street && p !== town && !MADRID_TOWNS.some(t => fold(t) === fold(p)))
    if (zone) out.zone = zone
  }
  // Si no venía en ese formato, buscar cualquier municipio de la Comunidad de Madrid mencionado
  if (!out.municipality) {
    const f = ` ${fold(text)} `
    const hit = [...MADRID_TOWNS].sort((a, b) => b.length - a.length).find(t => t.length > 3 && f.includes(` ${fold(t)} `))
    if (hit) out.municipality = hit
  }

  // Útiles, parcela, año de construcción y tipo
  const useful = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)\s*útiles/i)
  if (useful) out.useful_m2 = toNumber(useful[1])
  const plot = text.match(/parcela(?: de)?\s*(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*m(?:²|2)/i) ?? text.match(/(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*m(?:²|2)\s*de parcela/i)
  if (plot) out.plot_m2 = toNumber(plot[1].replace(/\s/g, '.'))
  const year = text.match(/(?:construido en|construcción[:\s]+|año de construcción[:\s]*)\s*(1[89]\d{2}|20\d{2})/i)
  if (year) out.year_built = Number(year[1])

  // Contacto: teléfono, email, particular o agencia, referencia
  const phone = text.match(/(?:\+34[\s.-]?)?\b[6789]\d{2}[\s.-]?\d{2,3}[\s.-]?\d{2,3}[\s.-]?\d{0,3}\b/)
  if (phone && phone[0].replace(/\D/g, '').replace(/^34/, '').length === 9) out.phone = phone[0].trim()
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (email) out.email = email[0]
  if (/\bparticular\b/i.test(text)) out.advertiser = 'particular'
  else if (/\b(profesional|inmobiliaria|agencia|real estate|fincas)\b/i.test(text)) out.advertiser = 'agencia'
  const agency = text.match(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&.\- ]{2,60}?(?:Inmobiliaria|Real Estate|Fincas|Properties|Homes)(?:\s*,?\s*S\.?L\.?U?\.?)?)/)
  if (agency) { out.agency = agency[1].trim(); out.advertiser = out.advertiser ?? 'agencia' }
  const ref = text.match(/(?:referencia(?: del anuncio)?|ref\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9_\-/]{2,30})/i)
  if (ref) out.ref = ref[1]

  // Nombre para reconocerlo: tipo + zona/calle + municipio, corto
  const type = text.match(/\b(piso|ático|atico|chalet(?: adosado| pareado| independiente)?|casa(?: o chalet independiente| adosada| pareada)?|dúplex|duplex|estudio|apartamento|loft)\b/i)
  if (type) {
    const t = type[1].replace(/^casa o chalet independiente$/i, 'Chalet independiente')
    const where = [out.zone ?? out.address, out.municipality].filter(Boolean).join(' · ')
    out.title = `${t.charAt(0).toUpperCase()}${t.slice(1)}${out.rooms ? ` ${out.rooms} hab.` : ''}${where ? ` · ${where}` : ''}`.slice(0, 80)
  }
  return out
}

/** Busca el primer enlace http(s) en un texto (lo que comparten las apps de los portales) */
export function firstUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[).,;]+$/, '') : null
}

/** Nombres legibles de lo que se ha encontrado, para decir qué se ha rellenado */
export function filledLabels(d: ListingData) {
  const L: [keyof ListingData, string][] = [['price_eur', 'precio'], ['size_m2', 'm²'], ['rooms', 'habitaciones'], ['baths', 'baños'], ['floor', 'planta'],
    ['municipality', 'localidad'], ['zone', 'zona'], ['address', 'dirección'], ['features', 'características'], ['energy', 'certificado'], ['community_eur', 'comunidad'], ['ibi_eur', 'IBI'], ['power_eur', 'luz'], ['water_eur', 'agua'], ['heating_eur', 'calefacción']]
  L.push(['useful_m2', 'm² útiles'], ['plot_m2', 'parcela'], ['year_built', 'año'], ['notes', 'notas'], ['advertiser', 'anunciante'], ['agency', 'agencia'], ['contact', 'contacto'], ['phone', 'teléfono'], ['email', 'email'], ['ref', 'referencia'], ['photo_urls', 'enlaces de fotos'])
  return L.filter(([k]) => d[k] != null && !(Array.isArray(d[k]) && !(d[k] as unknown[]).length)).map(([, l]) => l)
}

// ---------- Respuesta de una IA (ChatGPT, Gemini, Claude) en formato «CLAVE: valor» ----------

/** Lo que se le pide a la IA: leer el anuncio y contestar con un bloque fijo que la app sabe leer */
export function aiPrompt(url: string) {
  return `Lee este anuncio inmobiliario: ${url}

Responde SOLO con este bloque, sin nada más, una línea por dato. Si un dato no aparece en el anuncio pon «-». No inventes nada.
PRECIO: (en euros, solo el número)
TIPO: (piso, ático, chalet independiente…)
DIRECCION: (calle, si aparece)
ZONA: (barrio o urbanización)
LOCALIDAD: (municipio)
M2: (construidos, solo el número)
UTILES: (m² útiles, solo el número)
PARCELA: (m² de parcela, solo el número)
HABITACIONES:
BANOS:
PLANTA:
EXTRAS: (elige entre: ascensor, garaje, trastero, terraza, exterior, calefaccion, aire, jardin, piscina, reformado)
CERTIFICADO: (letra de consumo, A-G)
COMUNIDAD: (€/mes, solo el número)
IBI: (€/año, solo el número)
LUZ: (gasto medio de luz en €/mes, solo el número, si aparece)
AGUA: (gasto medio de agua en €/mes, solo el número, si aparece)
CALEFACCION: (gasto medio de calefacción en €/mes, solo el número, si aparece)
AÑO: (de construcción)
RESUMEN: (dos frases con lo más destacable)
ANUNCIANTE: (agencia o particular)
AGENCIA: (nombre de la inmobiliaria, si es agencia)
CONTACTO: (nombre de la persona de contacto)
TELEFONO:
EMAIL:
REFERENCIA: (referencia del anuncio)
FOTOS: (enlaces directos a las fotos del anuncio, los que veas de verdad en la página —por ejemplo https://img3.idealista.com/…jpg—, uno por línea; máximo 20; si no puedes verlos, pon «-»)`
}

// Servidores de fotos de los portales (los mismos que permite la función que las descarga)
const PHOTO_HOSTS = ['idealista.com', 'fotocasa.es', 'pisos.com', 'imghs.net', 'habitaclia.com', 'habimg.com', 'yaencontre.com', 'milanuncios.com',
  'tucasa.com', 'enalquiler.com', 'housfy.com', 'solvia.es', 'altamirainmuebles.com', 'servihabitat.com', 'aliseda.es', 'haya.es', 'adevinta.com']

/** Enlaces a fotos de portales que aparezcan en cualquier parte del texto (sin repetir; máximo 20) */
export function photoUrls(raw: string): string[] {
  const out: string[] = []
  for (const m of raw.matchAll(/https:\/\/[^\s"'<>()\[\]]+/gi)) {
    const u = m[0].replace(/[.,;]+$/, '')
    try {
      const x = new URL(u)
      const okHost = PHOTO_HOSTS.some(h => x.hostname === h || x.hostname.endsWith('.' + h))
      const looksImage = /\.(jpe?g|png|webp|avif)$/i.test(x.pathname) || /^(img\d*|fotos?\d*|images?\d*|static\d*|media\d*|cdn\d*)\./i.test(x.hostname)
      if (okHost && looksImage && !out.includes(u)) out.push(u)
    } catch { /* no es un enlace válido */ }
    if (out.length >= 20) break
  }
  return out
}

const AI_KEYS = ['PRECIO', 'TIPO', 'DIRECCION', 'ZONA', 'LOCALIDAD', 'M2', 'UTILES', 'PARCELA', 'HABITACIONES', 'BANOS', 'PLANTA', 'EXTRAS', 'CERTIFICADO', 'COMUNIDAD', 'IBI', 'LUZ', 'AGUA', 'CALEFACCION', 'AÑO', 'ANO', 'RESUMEN',
  'ANUNCIANTE', 'AGENCIA', 'CONTACTO', 'TELEFONO', 'EMAIL', 'REFERENCIA', 'FOTOS']

/** Si el texto es la respuesta de la IA con el bloque pedido, lo lee campo a campo; si no, devuelve null */
export function parseAiBlock(raw: string): ListingData | null {
  const values: Record<string, string> = {}
  // Algunas apps copian la respuesta en una sola línea: se separa antes de cada «CLAVE:»
  const keys = 'PRECIO|TIPO|DIRECCI[OÓ]N|ZONA|LOCALIDAD|M2|[UÚ]TILES|PARCELA|HABITACIONES|BA[NÑ]OS|PLANTA|EXTRAS|CERTIFICADO|COMUNIDAD|IBI|LUZ|AGUA|CALEFACCI[OÓ]N|A[NÑ]O|RESUMEN|ANUNCIANTE|AGENCIA|CONTACTO|TEL[EÉ]FONO|EMAIL|REFERENCIA|FOTOS'
  const text = raw.replace(/[*`_]/g, '').replace(new RegExp(`\\s+(?=(?:${keys})\\s*:)`, 'g'), '\n')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-•]?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 ]{2,15}?)\s*:\s*(.*)$/)
    if (!m) continue
    const key = fold(m[1]).toUpperCase().replace(/\s+/g, '').replace('BAÑOS', 'BANOS')
    const k = AI_KEYS.find(x => fold(x).toUpperCase() === key)
    const v = m[2].trim()
    if (k && v && !/^[-–—]$|^(no consta|no aparece|n\/?a|desconocido|-)\.?$/i.test(v)) values[k] = v
  }
  if (Object.keys(values).length < 3) return null

  const n = (k: string) => { const x = values[k]?.match(/\d[\d.,]*/); return x ? toNumber(x[0]) : undefined }
  const out: ListingData = {}
  const price = n('PRECIO'); if (price && price >= 1000) out.price_eur = price
  const m2 = n('M2'); if (m2) out.size_m2 = m2
  const rooms = n('HABITACIONES'); if (rooms != null) out.rooms = Math.round(rooms)
  const baths = n('BANOS'); if (baths != null) out.baths = Math.round(baths)
  if (values.PLANTA) out.floor = values.PLANTA.replace(/^planta\s*/i, '').slice(0, 20)
  if (values.DIRECCION) out.address = values.DIRECCION.slice(0, 120)
  if (values.ZONA) out.zone = values.ZONA.slice(0, 60)
  if (values.LOCALIDAD) {
    const town = MADRID_TOWNS.find(t => fold(t) === fold(values.LOCALIDAD))
    if (town) out.municipality = town
  }
  if (values.EXTRAS) {
    const f = fold(values.EXTRAS)
    const keys = ['ascensor', 'garaje', 'trastero', 'terraza', 'exterior', 'calefaccion', 'aire', 'jardin', 'piscina', 'reformado'].filter(k => f.includes(k))
    if (keys.length) out.features = keys
  }
  const cert = values.CERTIFICADO?.match(/\b([A-G])\b/i); if (cert) out.energy = cert[1].toUpperCase()
  const fee = n('COMUNIDAD'); if (fee) out.community_eur = fee
  const ibi = n('IBI'); if (ibi) out.ibi_eur = ibi
  const pw = n('LUZ'); if (pw) out.power_eur = pw
  const wt = n('AGUA'); if (wt) out.water_eur = wt
  const ht = n('CALEFACCION'); if (ht) out.heating_eur = ht
  const notes = [
    n('PARCELA') ? `Parcela: ${n('PARCELA')!.toLocaleString('es-ES')} m²` : '',
    values.AÑO || values.ANO ? `Año: ${values.AÑO ?? values.ANO}` : '',
    values.RESUMEN ?? ''
  ].filter(Boolean)
  if (notes.length) out.notes = notes.join('\n').slice(0, 1000)
  const util = n('UTILES'); if (util) out.useful_m2 = util
  const parc = n('PARCELA'); if (parc) out.plot_m2 = parc
  const yr = n('AÑO') ?? n('ANO'); if (yr && yr > 1700 && yr < 2100) out.year_built = Math.round(yr)
  if (values.RESUMEN) out.summary = values.RESUMEN.slice(0, 2000)
  if (values.TIPO) out.property_type = values.TIPO.slice(0, 60)
  if (values.ANUNCIANTE) out.advertiser = /particular/i.test(values.ANUNCIANTE) ? 'particular' : 'agencia'
  if (values.AGENCIA) { out.agency = values.AGENCIA.slice(0, 120); out.advertiser = out.advertiser ?? 'agencia' }
  if (values.CONTACTO) out.contact = values.CONTACTO.slice(0, 120)
  const tel = values.TELEFONO?.match(/\+?[\d][\d\s.()-]{6,20}\d/); if (tel) out.phone = tel[0].trim()
  const mail = values.EMAIL?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (mail) out.email = mail[0]
  if (values.REFERENCIA) out.ref = values.REFERENCIA.slice(0, 60)
  if (values.TIPO) {
    const where = [out.zone ?? out.address, out.municipality].filter(Boolean).join(' · ')
    const t = values.TIPO.charAt(0).toUpperCase() + values.TIPO.slice(1)
    out.title = `${t}${out.rooms ? ` ${out.rooms} hab.` : ''}${where ? ` · ${where}` : ''}`.slice(0, 80)
  }
  return out
}

/** Lee cualquier texto: primero como respuesta de IA y, lo que falte, como texto suelto del anuncio */
export function parseAny(raw: string): ListingData {
  // Los enlaces de fotos se quitan antes de leer los datos (sus números confundirían precio, metros…)
  const photos = photoUrls(raw)
  const text = raw.replace(/https?:\/\/[^\s"'<>()]+/gi, ' ')
  const ai = parseAiBlock(text)
  const free = parseListing(text)
  const extra = photos.length ? { photo_urls: photos } : {}
  if (!ai) return { ...free, ...extra }
  return { ...free, ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v != null)), ...extra }
}
