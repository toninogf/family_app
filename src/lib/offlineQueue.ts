// Cambios hechos sin conexión (en la visita, en un garaje…): se guardan en el móvil y se envían al volver la red.
// Solo actualizaciones de algo que ya existe (update por id o upsert con clave), que se pueden repetir sin duplicar.
export type Pending = { table: string; data: Record<string, unknown>; id?: string; onConflict?: string; at: number }

const KEY = 'mudanza-pending-v1'

export function loadPending(): Pending[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function savePending(q: Pending[]) {
  try { q.length ? localStorage.setItem(KEY, JSON.stringify(q)) : localStorage.removeItem(KEY) } catch { /* sin almacenamiento: queda en memoria */ }
}

/** Clave que identifica la fila: el id, o los campos del upsert (p. ej. home_id + member_id) */
export function rowKey(p: Pick<Pending, 'table' | 'data' | 'id' | 'onConflict'>) {
  if (p.id) return `${p.table}#${p.id}`
  const cols = (p.onConflict ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return `${p.table}#${cols.map(c => String(p.data[c] ?? '')).join('|')}`
}

/** Añade un cambio: si ya había otro pendiente de la misma fila, se juntan (gana lo último) */
export function enqueue(q: Pending[], item: Pending): Pending[] {
  const k = rowKey(item)
  const i = q.findIndex(x => rowKey(x) === k)
  if (i < 0) return [...q, item]
  const next = q.slice()
  next[i] = { ...q[i], data: { ...q[i].data, ...item.data }, at: item.at }
  return next
}

/** Se puede guardar para luego: actualizaciones e upserts (no altas nuevas, que darían duplicados) */
export const canQueue = (id?: string, onConflict?: string) => !!id || !!onConflict

/** ¿El fallo es por falta de red (y no un error de datos)? */
export function isNetworkError(msg: string | undefined | null, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (!online) return true
  return !!msg && /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timeout/i.test(msg)
}

/** Aplica sobre los datos del servidor lo que aún no se ha enviado, para que la ficha muestre lo último */
export function overlay<T extends Record<string, unknown>>(rows: T[], q: Pending[], table: string, match: (row: T, p: Pending) => boolean = (r, p) => r.id === p.id): T[] {
  const mine = q.filter(p => p.table === table)
  if (!mine.length) return rows
  return rows.map(r => mine.filter(p => match(r, p)).reduce((acc, p) => ({ ...acc, ...p.data }), r))
}
