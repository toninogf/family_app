// «🔬 Análisis a fondo con IA» de una casa de Buscamos: petición para el modo de investigación de ChatGPT / Claude / Gemini
// y lectura de su respuesta (informe + bloque de datos que la app propone aplicar a la ficha)
import { AI_CHECKS, MANUAL_CHECKS, VISIT_CHECKS, allChecks, STATUS_LABEL, type HealthStatus } from './health'
import { COOLING, FEATURES, HEATING, critItems, criteriaLabel, roomsLabel, type Home, type Mudanza } from './mudanza'
import { PARTIDA, REFORM_STATE, readyPrice, reformTotal, type ReformState } from './reforma'

export type DeepVerdict = 'comprar' | 'condiciones' | 'no'
export type DeepData = {
  veredicto?: DeepVerdict; nota?: number; resumen?: string
  motivos?: string[]; descartes?: string[]
  precio?: { justo?: number; oferta?: number; tope?: number }
  reforma?: { estado?: ReformState; partidas?: string[]; min?: number; max?: number; nota?: string }
  catastro?: { ref?: string; m2?: number; parcela?: number; ano?: number; coincide?: boolean; nota?: string }
  checks?: { clave: string; estado: HealthStatus; nota?: string }[]
  costes?: { ibi_ano?: number; comunidad_mes?: number; basuras_ano?: number; energia_mes?: number }
  trabajo?: { minutos_coche?: number; minutos_transporte?: number; nota?: string }
  colegios?: { nombre: string; tipo?: string; distancia_m?: number; nota?: string }[]
  preguntas?: string[]; documentos?: string[]; negociacion?: string[]
}
export type DeepAnalysis = { at: string; report: string; data: DeepData | null; applied?: string[] }

/** Puntos de «Documentos» y «Estado» que la IA puede proponer */
export const DEEP_CHECKS = ['ite', 'urbanizacion', 'vpo', 'ocupacion', 'saneamiento', 'ruido', 'comunidad', 'luz', 'motivo']
const CHECK_TITLE = Object.fromEntries([...AI_CHECKS, ...MANUAL_CHECKS, ...VISIT_CHECKS].map(c => [c.key, c.title]))
export const checkTitle = (k: string) => CHECK_TITLE[k] ?? k

export const VERDICT: Record<DeepVerdict, { icon: string; label: string; tone: string }> = {
  comprar: { icon: '✅', label: 'Comprar', tone: 'bg-[#1F8A4C] text-white' },
  condiciones: { icon: '🟡', label: 'Comprar con condiciones', tone: 'bg-[#E0A21B] text-white' },
  no: { icon: '⛔', label: 'No comprar', tone: 'bg-[#C8452F] text-white' }
}

const eur = (c: number | null | undefined) => (c == null ? '¿?' : `${Math.round(c / 100).toLocaleString('es-ES')} €`)

export type DeepContext = {
  workAddress: string | null
  sale: { price: number | null; net: number | null; need: number | null; accepted: boolean; status: string } | null
}

export function deepAnalysisPrompt(h: Home, m: Mudanza, ctx: DeepContext) {
  const c = m.criteria
  const r = h.reform ?? {}
  const rt = reformTotal(r, h)
  const ready = readyPrice(h)
  const checks = allChecks(h).filter(x => x.item.s !== 'unknown' || x.item.n)
  const ratings = m.ratings.filter(x => x.home_id === h.id)
  const visits = m.homeVisits.filter(v => v.home_id === h.id && v.status === 'done').length
  const feats = (h.features ?? []).filter(k => k !== 'calefaccion').map(k => FEATURES[k] ?? k)
  return [
    'Quiero un ANÁLISIS A FONDO de esta casa para decidir si la compramos. Somos una familia con dos hijos en edad escolar. Usa la búsqueda web todo lo que haga falta y NO pares hasta tener respuesta a cada punto o dejar claro que no se puede saber y cómo averiguarlo. No inventes: cita la fuente (con enlace) de cada dato y separa lo comprobado de lo que es estimación.',
    '',
    'LA CASA',
    `- ${h.title}`,
    `- Dirección: ${[h.address, h.zone, h.municipality, h.province].filter(Boolean).join(', ')}${h.cadastral_ref ? ` · referencia catastral ${h.cadastral_ref}` : ''}`,
    `- Anuncio: ${[h.url, ...(h.links ?? []).map(l => l.url)].filter((x, i, a) => x && a.indexOf(x) === i).join(' , ') || '—'}${h.listing_ref ? ` (ref. ${h.listing_ref})` : ''}${h.agency ? ` · ${h.agency}` : h.advertiser === 'particular' ? ' · particular' : ''}`,
    `- Piden ${eur(h.price_cents)}; ${h.size_m2 ?? '¿?'} m² construidos${h.useful_m2 ? ` (${h.useful_m2} útiles)` : ''}; parcela ${h.plot_m2 ?? '¿?'} m²; ${roomsLabel(h) ?? '¿? hab.'}; ${h.baths ?? '¿?'} baños; año ${h.year_built ?? '¿?'}${h.floor ? `; planta ${h.floor}` : ''}`,
    `- Calefacción: ${h.heating_type ? HEATING[h.heating_type] : '¿?'}; aire: ${h.cooling ? COOLING[h.cooling] : '¿?'}; certificado: ${h.energy ?? '¿?'}`,
    `- Extras según el anuncio: ${feats.join(', ') || '—'}`,
    `- Gastos conocidos: comunidad ${h.community_fee_cents != null ? `${eur(h.community_fee_cents)}/mes` : '¿?'}; IBI ${h.ibi_cents != null ? `${eur(h.ibi_cents)}/año` : '¿?'}`,
    `- Reforma que estimamos: ${r.state ? REFORM_STATE[r.state].label : 'sin valorar'}${(r.items ?? []).length ? ` (${(r.items ?? []).map(i => i.k === 'otros' ? i.label || 'otros' : PARTIDA[i.k]?.label ?? i.k).join(', ')})` : ''}${rt ? `, ${eur(rt.lo)}–${eur(rt.hi)}` : ''}. Para entrar a vivir (precio + reforma + impuestos y gastos) ~${eur(ready)}`,
    ...(checks.length ? ['- Lo que ya sabemos (documentos y estado):', ...checks.map(x => `  · ${x.title}: ${STATUS_LABEL[x.item.s]}${x.item.n ? ` — ${x.item.n}` : ''}`)] : []),
    ...(h.notes ? [`- Notas nuestras: ${h.notes.replace(/\s+/g, ' ').slice(0, 1200)}`] : []),
    `- La hemos visitado ${visits} ${visits === 1 ? 'vez' : 'veces'}${ratings.length ? `; nuestra nota media ${(ratings.reduce((a, x) => a + x.score, 0) / ratings.length).toLocaleString('es-ES', { maximumFractionDigits: 1 })} de 10` : ''}`,
    ...(h.market?.paid_m2 ? [`- En la zona se firma a ~${Math.round(h.market.paid_m2)} €/m² (${h.market.paid_note ?? 'notarías'})`] : []),
    '',
    'LO QUE BUSCAMOS',
    `- Presupuesto PARA ENTRAR A VIVIR: ${eur(c?.max_price_cents)}`,
    `- Imprescindible: ${[c?.min_rooms && `${c.min_rooms}+ habitaciones (buhardilla y sótano habitable cuentan como una)`, c?.min_m2 && `${c.min_m2}+ m²`, c?.min_plot_m2 && `parcela ${c.min_plot_m2}+ m²`, ...critItems(c?.must_haves ?? []).map(criteriaLabel)].filter(Boolean).join('; ') || '—'}`,
    `- Valoramos: ${critItems(c?.nice_to_haves ?? []).map(criteriaLabel).join('; ') || '—'}`,
    `- Localidades: ${[...(c?.municipalities ?? []), ...(c?.zones ?? [])].join(', ') || '—'}`,
    '- Tener que hacer mucha reforma nos descarta la casa. Colegio: público como prioridad y, después, concertado.',
    ctx.workAddress ? `- Trabajo (calcula el trayecto en hora punta, en coche y en transporte público): ${ctx.workAddress}` : '- Trabajo: en Madrid (calcula el trayecto en hora punta al centro de Madrid, en coche y en transporte público).',
    ...(ctx.sale ? [`- La compra DEPENDE DE VENDER nuestro piso: lo tenemos a la venta por ${eur(ctx.sale.price)}${ctx.sale.accepted ? ' (con oferta aceptada)' : ` (${ctx.sale.status})`}; nos quedarían ~${eur(ctx.sale.net)} limpios${ctx.sale.need != null ? ` y para comprar al presupuesto necesitamos ~${eur(ctx.sale.need)} de la venta` : ''}. Tenlo en cuenta en plazos y en cómo plantear la oferta (arras, condición de venta…).`] : []),
    '',
    'INVESTIGA (en este orden; si un punto no aplica, dilo):',
    '1. Catastro (sede.catastro.gob.es): referencia catastral, superficie construida y de parcela, año y uso. ¿Coincide con el anuncio? Si hay más m², piscina, porche cerrado o buhardilla que no figuran, puede haber obras sin legalizar: dilo.',
    '2. Urbanismo y legal: clasificación y calificación del suelo en el plan general del municipio, afecciones (vías pecuarias, cauces, protección ambiental, carreteras), si es suelo rústico o fuera de ordenación, si es VPO, urbanización recepcionada o no, y qué revisar en la nota simple (cargas, usufructos, servidumbres).',
    '3. Riesgos del sitio: inundabilidad (SNCZI), incendio forestal (interfaz urbano-forestal, cercanía a monte), radón, ruido (mapas estratégicos, carreteras, tren, aviones), líneas de alta tensión, antenas, pendiente, orientación y sombras.',
    '4. Estado técnico por el año, el tipo de construcción y las FOTOS del anuncio: cubierta, fachada, humedades, carpinterías, instalaciones (caldera, electricidad, fontanería), aislamiento, piscina. Con eso, la reforma realista con horquilla de precio (Madrid 2026, gama media, con IVA e imprevistos). Sé prudente: no inventes partidas que no se vean.',
    '5. Mercado y precio: cuánto lleva anunciada y bajadas (historial en portales), si está en otros portales a otro precio, comparables anunciados y vendidos en la zona, €/m² frente a lo que se firma (Portal del Notariado), y con todo eso precio justo, oferta inicial y tope razonable.',
    '6. Coste de vivir ahí al año: IBI, basuras, comunidad o urbanización (y derramas si se sabe), y consumo estimado de calefacción, agua y piscina según superficie, certificado y sistema.',
    '7. Entorno y día a día: colegios públicos (primero) y concertados más cercanos, con distancia y fama; trayecto al trabajo; transporte, servicios, comercios, centro de salud, ambiente y seguridad de la zona; proyectos urbanísticos cercanos que la puedan mejorar o empeorar.',
    '8. VEREDICTO: comprar, comprar con condiciones o no comprar; los 3–5 motivos que más pesan; lo que la descartaría (deal-breakers); preguntas para la agencia o el vendedor; documentos a pedir antes de ofertar; y cómo negociar (argumentos concretos de esta casa).',
    '',
    'FORMATO DE LA RESPUESTA:',
    '- Primero el INFORME en español, con un apartado por cada punto (1 a 8) y las fuentes enlazadas.',
    '- Al final, SIEMPRE, este bloque de datos (JSON válido entre ```json y ```; omite lo que no sepas; importes en euros, sin céntimos):',
    '```json',
    JSON.stringify({
      veredicto: 'comprar|condiciones|no', nota: '0-10', resumen: '2-3 frases',
      motivos: ['…'], descartes: ['lo que la descartaría (si lo hay)'],
      precio: { justo: 0, oferta: 0, tope: 0 },
      reforma: { estado: Object.keys(REFORM_STATE).join('|'), partidas: [`solo claves de: ${Object.keys(PARTIDA).filter(k => k !== 'otros').join(', ')}`], min: 0, max: 0, nota: '' },
      catastro: { ref: '', m2: 0, parcela: 0, ano: 0, coincide: true, nota: 'diferencias con el anuncio' },
      checks: [{ clave: DEEP_CHECKS.join('|'), estado: 'ok|warn|bad', nota: 'qué has encontrado y fuente' }],
      costes: { ibi_ano: 0, comunidad_mes: 0, basuras_ano: 0, energia_mes: 0 },
      trabajo: { minutos_coche: 0, minutos_transporte: 0, nota: '' },
      colegios: [{ nombre: '', tipo: 'público|concertado|privado', distancia_m: 0, nota: '' }],
      preguntas: ['…'], documentos: ['…'], negociacion: ['…']
    }, null, 1),
    '```'
  ].join('\n')
}

/** Lee la respuesta: el informe (todo lo de antes del bloque) y los datos (el último bloque JSON) */
export function parseDeepAnalysis(text: string): { report: string; data: DeepData | null; error?: string } {
  const t = text.trim()
  if (t.length < 200) return { report: '', data: null, error: 'La respuesta es muy corta: copia el informe entero de la IA.' }
  const blocks = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  const last = blocks[blocks.length - 1]
  let data: DeepData | null = null
  let report = t
  if (last) {
    try {
      data = clean(JSON.parse(last[1]))
      report = (t.slice(0, last.index) + t.slice(last.index! + last[0].length)).trim()
    } catch { data = null }
  }
  return { report: report.slice(0, 60000), data }
}

function clean(x: Record<string, unknown>): DeepData {
  const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) : Number(v); return Number.isFinite(n) && n > 0 ? n : undefined }
  const str = (v: unknown, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
  const list = (v: unknown, n = 12) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim().slice(0, 300)).slice(0, n) : undefined)
  const obj = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
  const ver = str(x.veredicto)?.toLowerCase()
  const p = obj(x.precio), rf = obj(x.reforma), ca = obj(x.catastro), co = obj(x.costes), tr = obj(x.trabajo)
  const state = str(rf.estado) as ReformState | undefined
  return {
    veredicto: ver === 'comprar' || ver === 'condiciones' || ver === 'no' ? ver : ver?.startsWith('no') ? 'no' : ver?.includes('condic') ? 'condiciones' : undefined,
    nota: (() => { const n = num(x.nota); return n != null && n <= 10 ? n : undefined })(),
    resumen: str(x.resumen, 800), motivos: list(x.motivos), descartes: list(x.descartes),
    precio: { justo: num(p.justo), oferta: num(p.oferta), tope: num(p.tope) },
    reforma: {
      estado: state && state in REFORM_STATE ? state : undefined,
      partidas: list(rf.partidas, 25)?.filter(k => k in PARTIDA && k !== 'otros'), min: num(rf.min), max: num(rf.max), nota: str(rf.nota)
    },
    catastro: { ref: str(ca.ref, 30)?.replace(/\s/g, ''), m2: num(ca.m2), parcela: num(ca.parcela), ano: (() => { const n = num(ca.ano); return n && n > 1700 && n < 2100 ? Math.round(n) : undefined })(), coincide: typeof ca.coincide === 'boolean' ? ca.coincide : undefined, nota: str(ca.nota) },
    checks: (Array.isArray(x.checks) ? x.checks : []).map(obj)
      .map(c => ({ clave: String(c.clave ?? ''), estado: String(c.estado ?? '') as HealthStatus, nota: str(c.nota) }))
      .filter(c => DEEP_CHECKS.includes(c.clave) && ['ok', 'warn', 'bad'].includes(c.estado)),
    costes: { ibi_ano: num(co.ibi_ano), comunidad_mes: num(co.comunidad_mes), basuras_ano: num(co.basuras_ano), energia_mes: num(co.energia_mes) },
    trabajo: { minutos_coche: num(tr.minutos_coche), minutos_transporte: num(tr.minutos_transporte), nota: str(tr.nota) },
    colegios: (Array.isArray(x.colegios) ? x.colegios : []).map(obj).filter(c => str(c.nombre))
      .map(c => ({ nombre: str(c.nombre, 120)!, tipo: str(c.tipo, 30), distancia_m: num(c.distancia_m), nota: str(c.nota, 200) })).slice(0, 8),
    preguntas: list(x.preguntas, 15), documentos: list(x.documentos, 15), negociacion: list(x.negociacion, 10)
  }
}
