// Nota simple del Registro de la Propiedad: se lee en el móvil (PDF con texto) y se sacan metros, parcela, referencia
// catastral, cargas, nº de titulares y documentos pendientes. Nunca se guardan nombres ni DNI de los propietarios.

// Solo el tipo y el importe: el texto de la nota puede llevar nombres de personas y no se guarda
export type Charge = { kind: 'hipoteca' | 'embargo' | 'usufructo' | 'servidumbre' | 'condicion' | 'afeccion' | 'otra'; amount?: number }
export type Registry = {
  built_m2?: number | null; useful_m2?: number | null; plot_m2?: number | null; rc?: string | null
  charges: Charge[]; no_charges: boolean; owners?: number | null; pending?: boolean | null; at: string
}

/** Texto de un PDF (las notas simples de registradores.org llevan texto; si es una foto escaneada, no habrá) */
export async function pdfText(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    pages.push(tc.items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''))
  }
  await doc.destroy()
  return pages.join('\n')
}

/** «1.200,50» / «290» / «290,00» → número */
const toNum = (s: string) => Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
function areaAfter(text: string, label: RegExp) {
  const m = text.match(new RegExp(`(?:${label.source})[^\\d]{0,80}?(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)(?!\\d)`, 'i'))
  const v = m ? toNum(m[1]) : NaN
  return v > 5 && v < 1_000_000 ? v : null
}

/** Lee el texto de la nota simple (o la respuesta de la IA con el bloque pedido) */
export function parseNota(raw: string): Registry | null {
  const text = raw.replace(/\s+/g, ' ')
  if (!/registro|finca|titular|cargas|superficie/i.test(text)) return null
  const built = areaAfter(text, /superficie construida|construida de|SUPERFICIE CONSTRUIDA/)
  const useful = areaAfter(text, /superficie [uú]til|[uú]til de/)
  const plot = areaAfter(text, /superficie (?:del terreno|de la parcela|de suelo|del solar|total)|parcela de terreno(?: de)?|solar de|terreno de|SUPERFICIE PARCELA/)
  const rc = text.toUpperCase().match(/REFERENCIA CATASTRAL[:\s]*([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z](?:[0-9]{4}[A-Z]{2})?)/)?.[1] ?? null

  // Cargas: desde el apartado CARGAS hasta los documentos pendientes o el final
  const start = text.search(/\bCARGAS\b/)
  const end = text.slice(start + 6).search(/DOCUMENTOS PENDIENTES|ASIENTOS PENDIENTES|PRESENTACI[OÓ]N|ADVERTENCIA|AVISO|PROTECCI[OÓ]N DE DATOS/)
  const block = start >= 0 ? text.slice(start, end >= 0 ? start + 6 + end : start + 4000) : text
  const no_charges = /(no hay|no existen|no constan|sin|libre de) cargas|cargas:\s*(no|ninguna|libre)/i.test(block)
  const charges: Charge[] = []
  if (!no_charges) {
    const sentences = block.split(/(?<=[.;])\s+/)
    const add = (kind: Charge['kind'], re: RegExp) => {
      for (const s of sentences) {
        if (!re.test(s)) continue
        const money = s.match(/(?:principal|capital|importe|responder? de|por)[^\d]{0,40}(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,}(?:,\d{2})?)\s*(?:euros|€)/i)
        const amount = money ? toNum(money[1]) : undefined
        if (charges.some(c => c.kind === kind && c.amount === amount)) continue
        charges.push({ kind, ...(amount ? { amount } : {}) })
        if (charges.filter(c => c.kind === kind).length >= 3) break
      }
    }
    add('hipoteca', /\bhipoteca/i)
    add('embargo', /\bembargo|anotaci[oó]n preventiva/i)
    add('usufructo', /\busufructo/i)
    add('servidumbre', /\bservidumbre/i)
    add('condicion', /condici[oó]n resolutoria|prohibici[oó]n de (disponer|enajenar)/i)
    add('afeccion', /\bafect[ao]|afecci[oó]n/i)
  }
  // Titulares: cuántos (por los NIF/DNI que aparecen), sin guardar ninguno
  const own = text.slice(Math.max(0, text.search(/TITULAR/i)), start > 0 ? start : undefined)
  const ids = new Set((own.match(/\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b/g) ?? []))
  const ownersBlock = raw.match(/TITULARES?\s*:\s*(\d+)/i)
  const owners = ownersBlock ? Number(ownersBlock[1]) : ids.size || null
  const pendingLine = text.match(/DOCUMENTOS PENDIENTES\s*:\s*(s[ií]|no)\b/i)?.[1]
  const pending = pendingLine ? /^s/i.test(pendingLine) : /no (hay|existen|constan) (documentos|asientos) pendientes/i.test(text) ? false
    : /(documentos|asientos) pendientes de despacho|pendiente de despacho/i.test(text) ? true : null

  if (!built && !plot && !useful && !charges.length && !no_charges && !rc) return null
  return { built_m2: built, useful_m2: useful, plot_m2: plot, rc, charges, no_charges, owners, pending, at: new Date().toISOString() }
}

export const CHARGE_LABEL: Record<Charge['kind'], string> = {
  hipoteca: 'Hipoteca', embargo: 'Embargo', usufructo: 'Usufructo', servidumbre: 'Servidumbre',
  condicion: 'Condición o prohibición', afeccion: 'Afección fiscal', otra: 'Otra carga'
}

/** Estado de la nota simple para el semáforo */
export function notaStatus(r: Registry): { s: 'ok' | 'warn' | 'bad'; n: string } {
  const bad = r.charges.filter(c => c.kind === 'embargo' || c.kind === 'usufructo' || c.kind === 'condicion')
  const hip = r.charges.filter(c => c.kind === 'hipoteca')
  const serv = r.charges.filter(c => c.kind === 'servidumbre')
  const parts: string[] = []
  if (r.no_charges) parts.push('Sin cargas')
  if (hip.length) parts.push(`Hipoteca${hip[0].amount ? ` de ${Math.round(hip[0].amount).toLocaleString('es-ES')} €` : ''}: el vendedor la cancela en la firma`)
  for (const c of bad) parts.push(CHARGE_LABEL[c.kind])
  if (serv.length) parts.push('Servidumbre: mirad en qué consiste')
  if (r.charges.some(c => c.kind === 'afeccion')) parts.push('Afecciones fiscales (habituales, 5 años)')
  if (r.pending) parts.push('Hay documentos pendientes de inscribir')
  if (r.owners) parts.push(`${r.owners} titular${r.owners > 1 ? 'es' : ''}`)
  const s = bad.length ? 'bad' : hip.length || serv.length || r.pending ? 'warn' : 'ok'
  return { s, n: parts.join(' · ') || 'Leída' }
}

/** Petición a una IA para una nota simple escaneada (se adjunta el PDF en la propia IA) */
export const NOTA_PROMPT = `Te adjunto una nota simple del Registro de la Propiedad. Responde SOLO con este bloque, sin nombres ni DNI de nadie:
SUPERFICIE CONSTRUIDA: (m², solo el número)
SUPERFICIE UTIL: (m², solo el número)
SUPERFICIE PARCELA: (m² del terreno, solo el número)
REFERENCIA CATASTRAL:
TITULARES: (cuántos, solo el número)
CARGAS: (una frase por carga: hipoteca con el importe principal, embargos, usufructos, servidumbres, condiciones, afecciones fiscales; o «sin cargas»)
DOCUMENTOS PENDIENTES: (sí o no)`
