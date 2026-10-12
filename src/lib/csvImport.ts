// Importación de movimientos bancarios desde CSV (formatos habituales de bancos españoles)

export type ParsedTable = { rows: string[][]; delimiter: string }
export type Movement = { date: string; description: string; cents: number; raw: string[] }

/** Lee el archivo probando UTF-8 y, si sale con caracteres rotos, Windows-1252 (típico de bancos) */
export async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return new TextDecoder('windows-1252').decode(buf)
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n')
  const counts = [';', ',', '\t', '|'].map(d => [d, sample.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

export function parseCsv(text: string): ParsedTable {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell.trim())
  if (row.some(x => x !== '')) rows.push(row)
  return { rows, delimiter }
}

/** "12/10/2026", "12-10-26", "2026-10-12" → "2026-10-12" */
export function parseDate(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return iso(y, +m[2], +m[1])
  }
  return null
}

function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "-1.234,56", "1234.56", "-12,5 €", "(12,50)" → céntimos con signo */
export function parseAmount(s: string): number | null {
  let t = s.trim().replace(/\s|€|EUR/gi, '')
  if (!t) return null
  let negative = false
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1) }
  if (t.startsWith('-') || t.startsWith('−')) { negative = true; t = t.slice(1) }
  if (t.endsWith('-')) { negative = true; t = t.slice(0, -1) }
  if (t.startsWith('+')) t = t.slice(1)
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.')
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const cents = Math.round(parseFloat(t) * 100)
  return negative ? -cents : cents
}

export type ColumnGuess = { date: number; description: number; amount: number; headerRow: number }

/** Adivina qué columna es la fecha, el concepto y el importe */
export function guessColumns(rows: string[][]): ColumnGuess | null {
  const width = Math.max(...rows.map(r => r.length))
  const sample = rows.slice(0, 200)
  const score = (fn: (s: string) => boolean) =>
    Array.from({ length: width }, (_, c) => sample.filter(r => r[c] !== undefined && fn(r[c])).length)
  const dateScores = score(s => parseDate(s) !== null)
  const amountScores = score(s => /\d[.,]\d{1,2}\s*(€|EUR)?$/i.test(s.trim()) && parseAmount(s) !== null)
  const date = dateScores.indexOf(Math.max(...dateScores))
  // El importe suele ser la primera columna numérica (la siguiente suele ser el saldo)
  const maxAmount = Math.max(...amountScores.filter((_, i) => i !== date))
  const amount = amountScores.findIndex((v, i) => i !== date && v >= maxAmount * 0.9)
  if (dateScores[date] < 1 || amount < 0) return null
  const textLen = Array.from({ length: width }, (_, c) =>
    c === date || c === amount ? -1 : sample.reduce((s, r) => s + (r[c]?.length ?? 0), 0))
  const description = textLen.indexOf(Math.max(...textLen))
  const headerRow = rows.findIndex(r => parseDate(r[date] ?? '') !== null && parseAmount(r[amount] ?? '') !== null)
  return { date, description, amount, headerRow: Math.max(0, headerRow) }
}

export function toMovements(rows: string[][], g: ColumnGuess): Movement[] {
  return rows.slice(g.headerRow).flatMap(r => {
    const date = parseDate(r[g.date] ?? '')
    const cents = parseAmount(r[g.amount] ?? '')
    if (!date || cents === null || cents === 0) return []
    const description = (r[g.description] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Movimiento'
    return [{ date, description, cents, raw: r }]
  })
}

const CATEGORY_HINTS: [string, string[]][] = [
  ['Supermercado', ['mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'eroski', 'dia ', 'supermerc', 'hipercor', 'consum', 'bonpreu', 'gadis', 'froiz', 'masymas', 'hiper']],
  ['Suministros', ['iberdrola', 'endesa', 'naturgy', 'repsol luz', 'holaluz', 'totalenergies', 'agua', 'canal de isabel', 'movistar', 'vodafone', 'orange', 'digi', 'jazztel', 'yoigo', 'pepephone', 'masmovil', 'lowi', 'o2 ']],
  ['Vivienda', ['alquiler', 'hipoteca', 'comunidad', 'ibi', 'prestamo']],
  ['Transporte', ['repsol', 'cepsa', 'galp', 'shell', 'bp ', 'gasolin', 'renfe', 'metro', 'emt ', 'cabify', 'uber', 'parking', 'peaje', 'autopista', 'itv', 'taller']],
  ['Salud', ['farmacia', 'clinica', 'dentist', 'optica', 'hospital', 'sanitas', 'adeslas', 'dkv']],
  ['Restaurantes y ocio', ['restaurante', 'bar ', 'cafeteria', 'glovo', 'just eat', 'uber eats', 'cine', 'netflix', 'spotify', 'hbo', 'disney', 'telepizza', 'burger', 'mcdonald']],
  ['Ropa', ['zara', 'primark', 'decathlon', 'h&m', 'mango', 'pull&bear', 'bershka', 'kiabi', 'el corte ingles']],
  ['Educación', ['colegio', 'academia', 'escuela', 'guarderia', 'libreria', 'material escolar', 'comedor']],
  ['Seguros', ['seguro', 'mapfre', 'axa', 'allianz', 'mutua', 'linea directa', 'generali', 'zurich']],
  ['Niños', ['juguet', 'toys', 'natacion', 'extraescolar', 'campamento']]
]

export function guessCategoryName(description: string): string | null {
  const d = ` ${description.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `
  for (const [cat, words] of CATEGORY_HINTS) if (words.some(w => d.includes(w))) return cat
  return null
}
