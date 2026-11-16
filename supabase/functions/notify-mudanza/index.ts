// Avisos de la mudanza (pg_cron cada 15 min, cabecera x-cron-secret):
// - casas nuevas propuestas por la búsqueda automática, bajadas de precio y pisos nuevos de la competencia (cola notify_queue, de 9 a 22 h)
// - a las 20:00, las visitas de mañana (una vez por persona y día)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
type Sub = { id: string; household_id: string; member_id: string; endpoint: string; p256dh: string; auth: string; mudanza: boolean }
type Q = { id: string; household_id: string; kind: 'propuesta' | 'bajada' | 'competidor'; ref_id: string | null; title: string; detail: string | null }

const madridDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d)
function addDays(d: string, n: number) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

const GROUPS = [
  { kind: 'propuesta', title: '🤖 Casas nuevas para revisar', url: '/mudanza' },
  { kind: 'bajada', title: '📉 Han bajado de precio', url: '/mudanza' },
  { kind: 'competidor', title: '🏘️ Pisos nuevos de la competencia', url: '/mudanza?vista=vendemos' }
] as const

Deno.serve(async (req: Request) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: cfg } = await db.rpc('push_config')
  if (!cfg?.private) return json({ error: 'Sin configuración' }, 500)
  if (req.headers.get('x-cron-secret') !== cfg.cron) return json({ error: 'No autorizado' }, 401)
  webpush.setVapidDetails(APP_URL, cfg.public, cfg.private)

  async function send(subs: Sub[], payload: { title: string; body: string; url: string; tag: string }) {
    let sent = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return sent
  }

  const now = new Date()
  const today = madridDate(now)
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number)
  const slot = `${String(h % 24).padStart(2, '0')}:${String(Math.floor(m / 15) * 15).padStart(2, '0')}`
  const { data: allSubs } = await db.from('push_subscriptions').select('id, household_id, member_id, endpoint, p256dh, auth, mudanza').eq('mudanza', true)
  const subs = (allSubs ?? []) as Sub[]
  let n = 0

  // Cola: de noche no se molesta, lo pendiente sale a partir de las 9
  if (h >= 9 && h < 22) {
    const { data: queue } = await db.from('notify_queue').select('id, household_id, kind, ref_id, title, detail').is('sent_at', null).order('created_at').limit(200)
    const rows = (queue ?? []) as Q[]
    for (const hh of new Set(rows.map(r => r.household_id))) {
      const mine = rows.filter(r => r.household_id === hh)
      const to = subs.filter(s => s.household_id === hh)
      for (const g of GROUPS) {
        const list = mine.filter(r => r.kind === g.kind)
        if (!list.length || !to.length) continue
        const body = list.slice(0, 4).map(r => `${r.title}${r.detail ? ` · ${r.detail}` : ''}`).join('\n') + (list.length > 4 ? `\n…y ${list.length - 4} más` : '')
        const url = list.length === 1 && g.kind !== 'competidor' && list[0].ref_id ? `/mudanza?piso=${list[0].ref_id}` : g.url
        n += await send(to, { title: g.title, body, url, tag: `mudanza-${g.kind}-${today}` })
      }
      await db.from('notify_queue').update({ sent_at: new Date().toISOString() }).in('id', mine.map(r => r.id))
    }
  }

  // Visitas de mañana, a las 20:00
  if (slot === '20:00') {
    const tomorrow = addDays(today, 1)
    for (const hh of new Set(subs.map(s => s.household_id))) {
      const [{ data: hv }, { data: bv }, { data: ms }] = await Promise.all([
        db.from('home_visits').select('start_time, attendee_id, homes(title, municipality)').eq('household_id', hh).eq('visit_date', tomorrow).eq('status', 'scheduled').order('start_time'),
        db.from('buyer_visits').select('start_time, contact_name, host_id').eq('household_id', hh).eq('visit_date', tomorrow).eq('status', 'scheduled').order('start_time'),
        db.from('members').select('id, display_name').eq('household_id', hh)
      ])
      if (!(hv ?? []).length && !(bv ?? []).length) continue
      for (const memberId of new Set(subs.filter(s => s.household_id === hh).map(s => s.member_id))) {
        const { error } = await db.from('notify_log').insert({ member_id: memberId, kind: 'visitas', day: today })
        if (error) continue // ya enviado hoy
        const who = (id: string | null) => (!id ? ' · vais los dos' : id === memberId ? ' · vas tú' : ` · va ${(ms ?? []).find(x => x.id === id)?.display_name ?? ''}`)
        const lines = [
          ...(hv ?? []).map(v => {
            const home = (Array.isArray(v.homes) ? v.homes[0] : v.homes) as { title: string; municipality: string | null } | null
            return `${hhmm(v.start_time)} 🔑 ${home?.title ?? 'Visita'}${home?.municipality ? ` (${home.municipality})` : ''}${who(v.attendee_id)}`
          }),
          ...(bv ?? []).map(v => `${hhmm(v.start_time)} 🏠 Enseñamos la casa${v.contact_name ? ` a ${v.contact_name}` : ''}${v.host_id === memberId ? ' · atiendes tú' : ''}`)
        ]
        n += await send(subs.filter(s => s.member_id === memberId), { title: 'Mañana, visitas', body: lines.join('\n'), url: '/mudanza?vista=visitas', tag: `visitas-${tomorrow}` })
      }
    }
  }
  return json({ sent: n, slot })
})
