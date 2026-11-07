import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { firstUrl } from '../lib/listingParse'

/** Recibe lo compartido desde otra app (menú «Compartir» del móvil) y abre un piso nuevo en Mudanza → Buscamos */
export default function Compartir() {
  const navigate = useNavigate()
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const title = p.get('title') ?? ''
    const text = p.get('text') ?? ''
    const url = p.get('url') || firstUrl(text) || firstUrl(title)
    const rest = [title, text].join('\n').replace(url ?? '', '').trim()
    navigate('/mudanza?vista=buscamos', { replace: true, state: { share: { url, text: rest || null } } })
  }, [navigate])
  return <p className="text-muted text-sm p-4">Abriendo el anuncio…</p>
}
