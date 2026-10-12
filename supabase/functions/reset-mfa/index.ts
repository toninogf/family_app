// Plan B: un adulto (con su 2FA activo) restablece la verificación en dos pasos del otro adulto de su hogar,
// por ejemplo si ha perdido el móvil. El afectado sigue necesitando su contraseña y el código de Cloudflare
// para entrar, y al hacerlo configurará un autenticador nuevo. Queda registrado en la auditoría.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://family-app.toninogf.workers.dev'
const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Quién llama: sesión válida y con 2FA completado
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await db.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'No autorizado' }, 401)
  try {
    const claims = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.aal !== 'aal2') return json({ error: 'Necesitas tener tu verificación en dos pasos activa' }, 403)
  } catch { return json({ error: 'No autorizado' }, 401) }

  const body = await req.json().catch(() => ({}))
  const targetMemberId = String(body?.member_id ?? '')

  const { data: caller } = await db.from('members').select('id, household_id, kind').eq('user_id', u.user.id).maybeSingle()
  const { data: target } = await db.from('members').select('id, household_id, kind, user_id, display_name').eq('id', targetMemberId).maybeSingle()
  if (!caller || caller.kind !== 'adult') return json({ error: 'No autorizado' }, 403)
  if (!target || target.household_id !== caller.household_id || target.kind !== 'adult' || !target.user_id) return json({ error: 'Persona no válida' }, 400)
  if (target.id === caller.id) return json({ error: 'Para tu propia cuenta usa «Autenticadores» en tu perfil' }, 400)

  const { data: factors, error: listErr } = await db.auth.admin.mfa.listFactors({ userId: target.user_id })
  if (listErr) return json({ error: 'No se pudo consultar la verificación' }, 500)
  let removed = 0
  for (const f of factors?.factors ?? []) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: target.user_id })
    if (!error) removed++
  }

  await db.from('audit_log').insert({
    household_id: caller.household_id, table_name: 'auth_mfa', row_id: target.id, action: 'reset',
    member_id: caller.id, new_data: { factors_removed: removed }
  })

  return json({ ok: true, removed, name: target.display_name })
})
