import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { HOME_STATUS, priceShort, type Home, type HomeStatus, type Mudanza } from '../../lib/mudanza'
import { geoQuery, locateHome } from '../../lib/geo'

const COLORS: Record<HomeStatus, string> = {
  interesa: '#5B6662', visita_pedida: '#C77A12', visitado: '#2F5FC4', favorito: '#2D4BB3', oferta: '#2E8B57', descartado: '#9AA19D'
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Mapa con los pisos filtrados: cada uno es una etiqueta con su precio; tocándola se ve y se abre la ficha */
export default function HomesMap({ homes, m, onOpen }: { homes: Home[]; m: Mudanza; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  // Solo se repinta (y se reencuadra) si cambian los pisos o sus datos visibles, no en cada render
  const drawKey = homes.map(h => [h.id, h.lat, h.lng, h.geo_precision, h.status, h.price_cents, h.title, h.municipality, h.zone].join(':')).join('|')

  // Crear el mapa una vez
  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([40.42, -3.7], 9)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Situar los que aún no lo están (de uno en uno, para no saturar el buscador de direcciones)
  useEffect(() => {
    let alive = true
    const pending = homes.filter(h => h.geo_query !== geoQuery(h) && (h.maps_url || h.address || h.zone || h.municipality))
    if (!pending.length) return
    ;(async () => {
      let changed = false
      for (let i = 0; i < pending.length && alive; i++) {
        setLocating(`Situando pisos en el mapa… ${i + 1} de ${pending.length}`)
        if (await locateHome(pending[i].id, pending[i])) changed = true
        await new Promise(r => setTimeout(r, 1100))
      }
      if (alive) setLocating(null)
      if (changed) await m.reload()
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homes.map(h => `${h.id}:${geoQuery(h)}:${h.geo_query}`).join()])

  // Pintar las etiquetas
  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    const placed = homes.filter(h => h.lat != null && h.lng != null)
    for (const h of placed) {
      const approx = h.geo_precision === 'localidad' || h.geo_precision === 'zona'
      const color = COLORS[h.status]
      const label = `${approx ? '≈ ' : ''}${h.price_cents ? priceShort(h.price_cents) : '?'}`
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform:translate(-50%,-100%);display:inline-block;white-space:nowrap;padding:3px 8px;border-radius:999px;font:700 12px system-ui,sans-serif;
          background:${approx ? '#fff' : color};color:${approx ? color : '#fff'};border:2px ${approx ? 'dashed' : 'solid'} ${color};box-shadow:0 1px 4px rgba(0,0,0,.3)">${esc(label)}</div>`,
        iconSize: [0, 0]
      })
      const popup = document.createElement('div')
      popup.style.minWidth = '170px'
      popup.innerHTML = `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(h.title)}</div>
        <div style="font-size:12px;color:#5B6662">📍 ${esc([h.municipality, h.zone].filter(Boolean).join(' · ') || 'Sin localidad')}</div>
        <div style="font-size:12px;margin:2px 0 6px">${esc([h.price_cents ? priceShort(h.price_cents) : '', h.size_m2 ? `${Number(h.size_m2)} m²` : '', h.rooms != null ? `${h.rooms} hab.` : '', HOME_STATUS[h.status]].filter(Boolean).join(' · '))}</div>
        ${approx ? `<div style="font-size:11px;color:#C77A12;margin-bottom:6px">Posición aproximada (${h.geo_precision === 'zona' ? 'zona' : 'centro de la localidad'}). Pon la calle o un enlace de Google Maps para afinarla.</div>` : ''}`
      const btn = document.createElement('button')
      btn.textContent = 'Abrir ficha'
      btn.style.cssText = 'width:100%;min-height:36px;border-radius:10px;background:#2D4BB3;color:#fff;font-weight:700;font-size:13px;border:0'
      btn.onclick = () => openRef.current(h.id)
      popup.appendChild(btn)
      L.marker([h.lat!, h.lng!], { icon, title: h.title }).bindPopup(popup).addTo(layer.current)
    }
    if (placed.length === 1) map.current.setView([placed[0].lat!, placed[0].lng!], 14)
    else if (placed.length > 1) map.current.fitBounds(L.latLngBounds(placed.map(h => [h.lat!, h.lng!] as [number, number])), { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])

  const missing = homes.filter(h => h.lat == null && h.geo_query === geoQuery(h)).length
  const noData = homes.filter(h => !h.maps_url && !h.address && !h.zone && !h.municipality).length

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="w-full h-[62vh] rounded-2xl overflow-hidden border border-line z-0" role="region" aria-label="Mapa de pisos" />
      <p className="text-xs text-muted">
        Toca un precio para ver el piso. <span className="font-semibold">≈</span> con borde discontinuo = posición aproximada (solo zona o localidad).
      </p>
      {locating && <p role="status" className="text-xs text-accent">{locating}</p>}
      {(missing > 0 || noData > 0) && !locating && (
        <p className="text-xs text-muted">
          {noData > 0 && `${noData} sin localidad ni dirección. `}
          {missing > 0 && `${missing} no se han podido situar. `}
          Añade la calle o un enlace de Google Maps en su ficha.
        </p>
      )}
    </div>
  )
}
