import { supabase } from './supabase'

// Clave pública VAPID (la privada está en el Vault de Supabase)
const VAPID_PUBLIC = 'BP7mZL2RaVVcjnxvORFi3tK8BmtdSBtQhmU39PhfYF8Ki_8MGCXDRuFNc84me-E7Dkj8fhbR5QFDC4AWQuHLS1E'

export type PushPrefs = { daily: boolean; weekly: boolean }
export type PushStatus =
  | { state: 'unsupported'; reason: 'ios-browser' | 'no-support' }
  | { state: 'denied' }
  | { state: 'off' }
  | { state: 'on'; prefs: PushPrefs }

function toUint8(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export async function pushStatus(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { state: 'unsupported', reason: isIOS() && !isStandalone() ? 'ios-browser' : 'no-support' }
  }
  if (Notification.permission === 'denied') return { state: 'denied' }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { state: 'off' }
  const { data } = await supabase.from('push_subscriptions').select('daily, weekly').eq('endpoint', sub.endpoint).maybeSingle()
  if (!data) return { state: 'off' }
  return { state: 'on', prefs: data as PushPrefs }
}

export async function enablePush(): Promise<string | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'No has dado permiso para mostrar avisos.'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC) as BufferSource }))
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    { onConflict: 'endpoint' }
  )
  return error ? error.message : null
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function updatePushPrefs(prefs: PushPrefs) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').update(prefs).eq('endpoint', sub.endpoint)
}

/** Aviso de fin de descanso del gimnasio en este dispositivo (activado salvo que se apague) */
export function gymPushOn() { try { return localStorage.getItem('gym-push') !== 'off' } catch { return true } }
export function setGymPushOn(v: boolean) { try { localStorage.setItem('gym-push', v ? 'on' : 'off') } catch { /* nada */ } }

export async function sendTestPush(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { mode: 'test' } })
  if (error) return 'No se pudo enviar el aviso de prueba.'
  return (data as { sent?: number })?.sent ? null : 'No hay ningún dispositivo con avisos activos.'
}
