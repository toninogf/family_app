// Avisos push: agenda del día (cada mañana), resumen semanal (domingo) y aviso de prueba desde la app.
// - mode "test": requiere sesión del usuario con 2FA (Authorization: Bearer <jwt>)
// - mode "daily" | "weekly": solo con la cabecera x-cron-secret (la llama pg_cron)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Sub = { id: string; household_id: string; member_id: string; endpoint: string; p256dh: string; auth: string; daily: boolean; weekly: boolean }
type Member = { id: string; household_id: string; display_name: string; kind: string; user_id: string | null }

const madridDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d)
function addDays(d: string, n: number) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function isoWeekday(d: string) { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w }
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
const eur0 = (c: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c / 100)
const eur = (c: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: cfg } = await db.rpc('push_config')
  if (!cfg?.private) return json({ error: 'Sin configuración' }, 500)
  webpush.setVapidDetails(APP_URL, cfg.public, cfg.private)
  const body = await req.json().catch(() => ({}))
  const mode = body?.mode as string

  async function send(subs: Sub[], payload: { title: string; body: string; url: string; tag?: string }) {
    let sent = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 6 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return sent
  }

  // ---------- Prueba desde la app ----------
  if (mode === 'test') {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await db.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'No autorizado' }, 401)
    try {
      const claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (claims.aal !== 'aal2') return json({ error: 'Falta la verificación en dos pasos' }, 403)
    } catch { return json({ error: 'No autorizado' }, 401) }
    const { data: m } = await db.from('members').select('id').eq('user_id', u.user.id).maybeSingle()
    if (!m) return json({ error: 'Sin miembro' }, 403)
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('member_id', m.id)
    const sent = await send((subs ?? []) as Sub[], { title: 'Family App', body: 'Los avisos funcionan ✅', url: '/', tag: 'test' })
    return json({ sent })
  }

  // ---------- Programados ----------
  if (req.headers.get('x-cron-secret') !== cfg.cron) return json({ error: 'No autorizado' }, 401)
  if (mode !== 'daily' && mode !== 'weekly') return json({ error: 'Modo no válido' }, 400)

  const { data: allSubs } = await db.from('push_subscriptions').select('*').eq(mode, true)
  const subs = (allSubs ?? []) as Sub[]
  if (!subs.length) return json({ sent: 0 })
  const households = [...new Set(subs.map(s => s.household_id))]
  const today = madridDate()
  let total = 0

  for (const hh of households) {
    const from = mode === 'daily' ? today : addDays(today, 1)
    const to = mode === 'daily' ? today : addDays(today, 7)
    const [{ data: members }, { data: events }, { data: exceptions }, { data: tasks }, { data: completions }] = await Promise.all([
      db.from('members').select('id, household_id, display_name, kind, user_id').eq('household_id', hh),
      db.from('events').select('*').eq('household_id', hh).lte('start_date', to),
      db.from('event_exceptions').select('*').eq('household_id', hh).gte('occurrence_date', from).lte('occurrence_date', to),
      db.from('tasks').select('*').eq('household_id', hh).eq('active', true),
      db.from('task_completions').select('task_id, occurrence_date').eq('household_id', hh).eq('occurrence_date', today)
    ])
    const { data: menuRows } = await db.from('school_menu').select('day, holiday, first_course, second_course, first_type, second_type')
      .eq('household_id', hh).gte('day', today).lte('day', addDays(today, 7))
    const menuOf = (d: string) => (menuRows ?? []).find(r => r.day === d)
    // Ofertas de la mudanza con plazo de respuesta hoy o mañana
    const [{ data: bOffers }, { data: hOffers }] = await Promise.all([
      db.from('buyer_offers').select('amount_cents, buyer_name, response_deadline').eq('household_id', hh).in('status', ['pending', 'countered'])
        .gte('response_deadline', today).lte('response_deadline', addDays(today, 1)),
      db.from('home_offers').select('amount_cents, response_deadline, homes(title)').eq('household_id', hh).in('status', ['pending', 'countered'])
        .gte('response_deadline', today).lte('response_deadline', addDays(today, 1))
    ])
    const when = (d: string) => (d === today ? 'hoy' : 'mañana')
    const offerLines = [
      ...(bOffers ?? []).map(o => `Oferta de ${o.buyer_name || 'un comprador'} (${eur0(o.amount_cents)}): responder ${when(o.response_deadline)}`),
      ...(hOffers ?? []).map(o => {
        const h = o.homes as { title: string } | { title: string }[] | null
        const title = Array.isArray(h) ? h[0]?.title : h?.title
        return `Nuestra oferta por ${title ?? 'el piso'}: esperamos respuesta ${when(o.response_deadline)}`
      })
    ]
    const ms = (members ?? []) as Member[]
    const name = (id: string | null) => ms.find(m => m.id === id)?.display_name ?? ''

    // Actividades por día con cambios puntuales aplicados
    const agenda = (date: string) => (events ?? [])
      .filter(e => date >= e.start_date && (!e.until || date <= e.until) && (e.repeat === 'none' ? date === e.start_date : (e.weekdays as number[]).includes(isoWeekday(date))))
      .map(e => {
        const x = (exceptions ?? []).find(x => x.event_id === e.id && x.occurrence_date === date)
        return {
          title: e.title as string, child: name(e.child_id), start: (x?.start_time ?? e.start_time) as string,
          drop: (x?.override_drivers ? x.drop_off_id : e.drop_off_id) as string | null,
          pick: (x?.override_drivers ? x.pick_up_id : e.pick_up_id) as string | null,
          cancelled: !!x?.cancelled, date, origin: (e.origin ?? null) as string | null
        }
      })
      .filter(a => !a.cancelled)
      .sort((a, b) => a.start.localeCompare(b.start))

    const tasksToday = (tasks ?? []).filter(t => {
      if (today < t.start_date) return false
      if (t.repeat === 'none') return t.start_date === today
      if (t.repeat === 'daily') return true
      if (t.repeat === 'weekly') return (t.weekdays as number[]).includes(isoWeekday(today))
      const day = Number(today.slice(8)), last = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
      return day === Math.min(t.month_day ?? 1, last)
    }).filter(t => !(completions ?? []).some(c => c.task_id === t.id))

    let money = ''
    if (mode === 'weekly') {
      const { data: bal } = await db.from('money_balances').select('party_a, party_b, owed_cents').eq('household_id', hh)
      const debts = (bal ?? []).filter(b => Number(b.owed_cents) !== 0).map(b => {
        const owed = Number(b.owed_cents)
        const [debtor, creditor] = owed > 0 ? [b.party_b, b.party_a] : [b.party_a, b.party_b]
        const n = (p: string) => (p === 'common' ? 'la cuenta común' : name(p))
        return `${n(debtor).replace(/^la/, 'La')} debe ${eur(Math.abs(owed))} a ${n(creditor)}`
      })
      money = debts.length ? debts.join('. ') + '.' : 'Saldos al día.'
    }

    for (const s of subs.filter(s => s.household_id === hh)) {
      if (mode === 'daily') {
        const todays = agenda(today)
        const items = todays.map(a => {
          if (a.origin === 'venta') return `${hhmm(a.start)} 🏠 ${a.title}${a.drop === s.member_id ? ' · atiendes tú' : ''}`
          if (a.origin === 'compra') return `${hhmm(a.start)} 🏠 ${a.title}${!a.drop ? ' · vais los dos' : a.drop === s.member_id ? ' · vas tú' : ''}`
          const roles = [a.drop === s.member_id ? 'llevas tú' : '', a.pick === s.member_id ? 'recoges tú' : ''].filter(Boolean).join(' y ')
          return `${hhmm(a.start)} ${a.title}${a.child ? ` (${a.child})` : ''}${roles ? ` · ${roles}` : ''}`
        })
        if (todays.some(a => a.origin === 'venta')) items.push('Prepara la casa antes de la visita (en Casa → Vendemos tienes la lista)')
        const mine = tasksToday.filter(t => !t.assignee_id || t.assignee_id === s.member_id).map(t => t.title)
        const mt = menuOf(today)
        const comedor = mt && !mt.holiday && mt.first_course ? `Comedor: ${shortDish(mt.first_course)} y ${shortDish(mt.second_course ?? '')}` : ''
        const cena = mt && !mt.holiday ? dinnerTip(mt.first_type, mt.second_type) : ''
        if (!items.length && !mine.length && !comedor && !offerLines.length) continue
        const lines = [...items, ...offerLines, mine.length ? `Tareas: ${mine.join(', ')}` : '', comedor, cena].filter(Boolean)
        total += await send([s], { title: 'Hoy', body: lines.join('\n'), url: '/', tag: `daily-${today}` })
      } else {
        const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
        const all = days.flatMap(d => agenda(d))
        const mineDrive = all.filter(a => a.drop === s.member_id || a.pick === s.member_id).length
        const bodyText = [
          `La semana que viene: ${all.length} actividad${all.length === 1 ? '' : 'es'}${mineDrive ? `, en ${mineDrive} llevas o recoges tú` : ''}.`,
          money,
          menuMissing(days.filter(d => isoWeekday(d) <= 5), menuOf)
        ].filter(Boolean).join('\n')
        total += await send([s], { title: 'Resumen de la semana', body: bodyText, url: '/ninos', tag: `weekly-${today}` })
      }
    }
  }
  return json({ sent: total })
})

// ---- Menú del comedor ----
const LABEL: Record<string, string> = { verdura: 'verdura', legumbre: 'legumbre', pasta_arroz: 'pasta o arroz', carne: 'carne', pescado: 'pescado', huevo: 'huevo' }
const DINNER_FIRST: Record<string, string[]> = { verdura: ['pasta_arroz'], pasta_arroz: ['verdura'], legumbre: ['verdura', 'pasta_arroz'] }
const DINNER_SECOND: Record<string, string[]> = { huevo: ['carne', 'pescado'], pescado: ['huevo', 'carne'], legumbre: ['verdura', 'huevo'], carne: ['huevo', 'pescado'] }

/** "Lentejas ecológicas estofadas con verduras (judía…)" → "Lentejas ecológicas estofadas con verduras" */
function shortDish(s: string) {
  const t = s.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  return t.charAt(0).toLowerCase() + t.slice(1)
}

function dinnerTip(first: string | null, second: string | null) {
  const f = first ? DINNER_FIRST[first]?.map(x => LABEL[x]).join(' o ') : ''
  const s = second ? DINNER_SECOND[second]?.map(x => LABEL[x]).join(' o ') : ''
  if (!f && !s) return ''
  return `Cena: ${[f, s].filter(Boolean).join(' + ')}`
}

function menuMissing(schoolDays: string[], menuOf: (d: string) => unknown) {
  const missing = schoolDays.filter(d => !menuOf(d))
  if (!missing.length) return ''
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(`${missing[0]}T12:00:00`))
  return `Falta el menú del comedor de ${month}: pásale el PDF a Claude.`
}
