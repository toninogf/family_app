// Recibe avisos push y abre la app en la pantalla correspondiente al tocarlos
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const show = () => self.registration.showNotification(data.title || 'Family App', {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag,
    lang: 'es',
    // Fin de descanso: una sola vibración (el aviso del servidor puede traer un patrón más largo)
    vibrate: data.kind === 'gym-rest' ? [1000] : data.vibrate,
    renotify: !!(data.renotify && data.tag),
    requireInteraction: !!data.requireInteraction,
    silent: false,
    data: { url: data.url || '/' }
  })
  // Fin de descanso: si la app está a la vista, avisa ella (vibración y pitidos); si no, notificación
  if (data.kind === 'gym-rest') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const visible = list.filter(c => c.visibilityState === 'visible')
        if (!visible.length) return show()
        visible.forEach(c => c.postMessage({ type: 'gym-rest' }))
      })
    )
    return
  }
  event.waitUntil(show())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})

// «Compartir» desde otra app (share_target por POST): se guardan las capturas en una caché temporal
// y se abre /compartir, que las recoge y abre un piso nuevo en Mudanza → Buscamos
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/compartir') return
  event.respondWith((async () => {
    const form = await event.request.formData()
    const cache = await caches.open('share-inbox')
    for (const k of await cache.keys()) await cache.delete(k)
    const files = form.getAll('shots').filter(f => f && typeof f !== 'string')
    await Promise.all(files.slice(0, 10).map((f, i) => cache.put(`/share-inbox/${i}`, new Response(f, {
      headers: { 'Content-Type': f.type || 'image/png', 'X-Name': encodeURIComponent(f.name || `captura-${i + 1}.png`) }
    }))))
    const q = new URLSearchParams()
    for (const k of ['title', 'text', 'url']) { const v = form.get(k); if (typeof v === 'string' && v) q.set(k, v) }
    if (files.length) q.set('capturas', String(Math.min(files.length, 10)))
    return Response.redirect(`/compartir?${q}`, 303)
  })())
})
