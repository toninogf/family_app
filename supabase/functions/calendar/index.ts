// Calendario .ics de las actividades de la familia, para suscribirse desde Google o Apple Calendar.
// Acceso con un token secreto por persona (revocable desde la app). Sin token válido devuelve 404.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const TZ = 'Europe/Madrid'
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

type Ev = {
  id: string; child_id: string | null; title: string; location: string | null; start_time: string; end_time: string | null
  repeat: 'none' | 'weekly'; weekdays: number[]; start_date: string; until: string | null
  drop_off_id: string | null; pick_up_id: string | null; note: string | null
}
type Ex = {
  event_id: string; occurrence_date: string; cancelled: boolean; start_time: string | null; end_time: string | null
  override_drivers: boolean; drop_off_id: string | null; pick_up_id: string | null; note: string | null
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const ymd = (d: string) => d.replace(/-/g, '')
const hms = (t: string) => t.slice(0, 8).replace(/:/g, '').padEnd(6, '0')
const local = (d: string, t: string) => `${ymd(d)}T${hms(t)}`

function fold(line: string) {
  const out: string[] = []
  let rest = line
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

function isoWeekday(d: string) {
  const w = new Date(d + 'T12:00:00Z').getUTCDay()
  return w === 0 ? 7 : w
}
function addDays(d: string, n: number) {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
function plusHour(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${TZ}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
]

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Not found', { status: 404 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: tok } = await db.from('calendar_tokens').select('household_id').eq('token', token).maybeSingle()
  if (!tok) return new Response('Not found', { status: 404 })
  const hh = tok.household_id as string

  const [{ data: members }, { data: events }, { data: exceptions }] = await Promise.all([
    db.from('members').select('id, display_name').eq('household_id', hh),
    db.from('events').select('id, child_id, title, location, start_time, end_time, repeat, weekdays, start_date, until, drop_off_id, pick_up_id, note').eq('household_id', hh),
    db.from('event_exceptions').select('event_id, occurrence_date, cancelled, start_time, end_time, override_drivers, drop_off_id, pick_up_id, note').eq('household_id', hh)
  ])
  const name = (id: string | null) => (id ? (members ?? []).find(m => m.id === id)?.display_name ?? '' : '')
  const drivers = (drop: string | null, pick: string | null, note: string | null) => {
    const lines: string[] = []
    if (drop && drop === pick) lines.push(`Lleva y recoge: ${name(drop)}`)
    else {
      if (drop) lines.push(`Lleva: ${name(drop)}`)
      if (pick) lines.push(`Recoge: ${name(pick)}`)
    }
    if (note) lines.push(note)
    return lines.join('\n')
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const out: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family App//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Familia · actividades', `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE
  ]

  for (const e of (events ?? []) as Ev[]) {
    // Primera fecha real (DTSTART debe coincidir con un día de la regla)
    let first = e.start_date
    if (e.repeat === 'weekly') {
      for (let i = 0; i < 7 && !e.weekdays.includes(isoWeekday(first)); i++) first = addDays(first, 1)
      if (e.until && first > e.until) continue
    }
    const end = e.end_time ?? plusHour(e.start_time)
    const summary = e.child_id ? `${e.title} · ${name(e.child_id)}` : e.title
    const exs = ((exceptions ?? []) as Ex[]).filter(x => x.event_id === e.id)
    const uid = `${e.id}@family-app`

    out.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${local(first, e.start_time)}`, `DTEND;TZID=${TZ}:${local(first, end)}`,
      fold(`SUMMARY:${esc(summary)}`))
    if (e.location) out.push(fold(`LOCATION:${esc(e.location)}`))
    const desc = drivers(e.drop_off_id, e.pick_up_id, e.note)
    if (desc) out.push(fold(`DESCRIPTION:${esc(desc)}`))
    if (e.repeat === 'weekly') {
      const byday = [...e.weekdays].sort().map(d => DAYS[d - 1]).join(',')
      out.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday}${e.until ? `;UNTIL=${ymd(e.until)}T225959Z` : ''}`)
      const cancelled = exs.filter(x => x.cancelled).map(x => local(x.occurrence_date, e.start_time))
      if (cancelled.length) out.push(fold(`EXDATE;TZID=${TZ}:${cancelled.join(',')}`))
    }
    out.push('END:VEVENT')

    // Días cambiados: misma UID con RECURRENCE-ID
    for (const x of exs.filter(x => !x.cancelled && e.repeat === 'weekly')) {
      const s = x.start_time ?? e.start_time
      const en = x.end_time ?? (x.start_time ? plusHour(x.start_time) : end)
      const d = drivers(x.override_drivers ? x.drop_off_id : e.drop_off_id, x.override_drivers ? x.pick_up_id : e.pick_up_id, x.note ?? e.note)
      out.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
        `RECURRENCE-ID;TZID=${TZ}:${local(x.occurrence_date, e.start_time)}`,
        `DTSTART;TZID=${TZ}:${local(x.occurrence_date, s)}`, `DTEND;TZID=${TZ}:${local(x.occurrence_date, en)}`,
        fold(`SUMMARY:${esc(summary)}`))
      if (e.location) out.push(fold(`LOCATION:${esc(e.location)}`))
      if (d) out.push(fold(`DESCRIPTION:${esc(d)}`))
      out.push('END:VEVENT')
    }
  }
  out.push('END:VCALENDAR')

  return new Response(out.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="familia.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex'
    }
  })
})
