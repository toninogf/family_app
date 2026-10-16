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
    vibrate: data.vibrate,
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
