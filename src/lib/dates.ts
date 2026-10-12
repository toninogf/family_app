// Fechas locales en formato ISO (YYYY-MM-DD), sin líos de zonas horarias

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(s: string, n: number) {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export const today = () => iso(new Date())

/** 1 = lunes … 7 = domingo */
export function isoWeekday(s: string) {
  const w = parseISO(s).getDay()
  return w === 0 ? 7 : w
}

export function startOfWeek(s: string) {
  return addDays(s, 1 - isoWeekday(s))
}

export function daysInMonth(s: string) {
  const d = parseISO(s)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export function longDate(s: string) {
  const t = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISO(s))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function shortDate(s: string) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISO(s))
}

export function relativeDay(s: string) {
  const t = today()
  if (s === t) return 'Hoy'
  if (s === addDays(t, 1)) return 'Mañana'
  if (s === addDays(t, -1)) return 'Ayer'
  return longDate(s)
}

/** "17:30:00" → "17:30" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

export function weekdaysLabel(days: number[]) {
  const sorted = [...days].sort()
  if (sorted.length === 7) return 'todos los días'
  if (sorted.join() === '1,2,3,4,5') return 'de lunes a viernes'
  if (sorted.join() === '6,7') return 'los fines de semana'
  const names = sorted.map(d => WEEKDAY_NAMES[d - 1])
  return 'los ' + (names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0])
}
