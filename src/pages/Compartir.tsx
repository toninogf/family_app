import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { firstUrl } from '../lib/listingParse'

/** Saca de la caché temporal las capturas que dejó el service worker al compartir */
async function takeSharedFiles(n: number): Promise<File[]> {
  if (!n || !('caches' in window)) return []
  const cache = await caches.open('share-inbox')
  const out: File[] = []
  for (let i = 0; i < n; i++) {
    const r = await cache.match(`/share-inbox/${i}`)
    if (!r) continue
    const blob = await r.blob()
    out.push(new File([blob], decodeURIComponent(r.headers.get('X-Name') ?? `captura-${i + 1}.png`), { type: blob.type || 'image/png' }))
  }
  await caches.delete('share-inbox')
  return out
}

/** Recibe lo compartido desde otra app (menú «Compartir» del móvil) y abre un piso nuevo en Mudanza → Buscamos */
export default function Compartir() {
  const navigate = useNavigate()
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const title = p.get('title') ?? ''
    const text = p.get('text') ?? ''
    const url = p.get('url') || firstUrl(text) || firstUrl(title)
    const rest = [title, text].join('\n').replace(url ?? '', '').trim()
    takeSharedFiles(Number(p.get('capturas') ?? 0)).catch(() => [] as File[]).then(files => {
      navigate('/mudanza?vista=buscamos', { replace: true, state: { share: { url, text: rest || null, files } } })
    })
  }, [navigate])
  return <p className="text-muted text-sm p-4">Abriendo lo compartido…</p>
}
