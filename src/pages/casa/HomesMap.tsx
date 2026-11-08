import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { HOME_STATUS, priceShort, type Home, type HomeStatus, type Mudanza } from '../../lib/mudanza'
import { geoQuery, locateHome } from '../../lib/geo'

const COLORS: Record<HomeStatus, string> = {
  interesa: '#5B6662', llamar: '#B3261E', visita_pedida: '#C77A12', visitado: '#2F5FC4', favorito: '#2D4BB3', oferta: '#2E8B57', descartado: '#9AA19D'
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Mapa con los pisos filtrados: cada uno es una etiqueta con su precio; tocándola se ve y se abre la ficha */
export default function HomesMap({ homes, m, onOpen }: { homes: Home[]; m: Mudanza; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const openRef = useRef(onOpen)
  // Al abrir una ficha desde el mapa a pantalla completa, se sale primero para que se vea la ficha
  openRef.current = (id: string) => { if (fullRef.current) exitFull(); onOpen(id) }
  const fullRef = useRef(false)
  fullRef.current = full

  /** Pantalla completa: el botón «atrás» del móvil también la cierra */
  function enterFull() {
    setFull(true)
    try { history.pushState({ ...history.state, mapFull: true }, '') } catch { /* sin historial: solo con el botón */ }
  }
  function exitFull() {
    if (history.state?.mapFull) history.back()
    else setFull(false)
  }
  useEffect(() => {
    const onPop = () => { if (fullRef.current) setFull(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && fullRef.current) exitFull() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => {
    document.body.style.overflow = full ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [full])
  // Solo se repinta (y se reencuadra) si cambian los pisos o sus datos visibles, no en cada render
  const drawKey = homes.map(h => [h.id, h.lat, h.lng, h.geo_precision, h.status, h.price_cents, h.title, h.municipality, h.zone].join(':')).join('|')

  // Crear el mapa una vez
  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([40.42, -3.7], 9)
    baseLayer().addTo(map.current)
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
    const placed = drawHomes(layer.current, homes, id => openRef.current(id))
    if (placed.length === 1) map.current.setView([placed[0].lat!, placed[0].lng!], 14)
    else if (placed.length > 1) map.current.fitBounds(L.latLngBounds(placed.map(h => [h.lat!, h.lng!] as [number, number])), { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])

  const missing = homes.filter(h => h.lat == null && h.geo_query === geoQuery(h)).length
  const noData = homes.filter(h => !h.maps_url && !h.address && !h.zone && !h.municipality).length

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div ref={box} className="w-full h-[62vh] rounded-2xl overflow-hidden border border-line z-0" role="region" aria-label="Mapa de pisos" />
        <button type="button" onClick={enterFull} aria-label="Ver el mapa a pantalla completa"
          className="absolute right-3 top-3 z-[1001] min-h-11 px-3 rounded-xl bg-card/95 border border-line shadow text-sm font-semibold">⛶ Pantalla completa</button>
      </div>
      {full && createPortal(
        // Mapa aparte, creado ya a pantalla completa (así carga bien el fondo), con el mismo encuadre
        <FullMap homes={homes} drawKey={drawKey} start={map.current ? { center: map.current.getCenter(), zoom: map.current.getZoom() } : null}
          onOpen={id => openRef.current(id)} onClose={exitFull} />,
        document.body
      )}
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

/** Fondo de OpenStreetMap (exige saber desde qué web se pide: la app no envía «referer» por defecto) */
function baseLayer() {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  })
}

/** Pinta los pisos como etiquetas con su precio; devuelve los que tienen posición */
function drawHomes(layer: L.LayerGroup, homes: Home[], onOpen: (id: string) => void) {
  layer.clearLayers()
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
    btn.onclick = () => onOpen(h.id)
    popup.appendChild(btn)
    L.marker([h.lat!, h.lng!], { icon, title: h.title }).bindPopup(popup).addTo(layer)
  }
  return placed
}

/** El mapa a pantalla completa (encima de todo, fuera del contenido de la página) */
function FullMap({ homes, drawKey, start, onOpen, onClose }: {
  homes: Home[]; drawKey: string; start: { center: L.LatLng; zoom: number } | null; onOpen: (id: string) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen

  useEffect(() => {
    if (!box.current) return
    const mp = L.map(box.current, { zoomControl: true }).setView(start?.center ?? [40.42, -3.7], start?.zoom ?? 9)
    baseLayer().addTo(mp)
    layer.current = L.layerGroup().addTo(mp)
    map.current = mp
    // Por si el tamaño definitivo llega un instante después (barras del navegador, giro del móvil)
    const ro = new ResizeObserver(() => mp.invalidateSize())
    ro.observe(box.current)
    const t = setTimeout(() => mp.invalidateSize(), 150)
    return () => { clearTimeout(t); ro.disconnect(); mp.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!layer.current) return
    const placed = drawHomes(layer.current, homes, id => openRef.current(id))
    if (!start && map.current && placed.length) map.current.fitBounds(L.latLngBounds(placed.map(h => [h.lat!, h.lng!] as [number, number])), { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])

  return (
    <div className="fixed inset-0 z-[60] bg-[#ddd]" role="dialog" aria-label="Mapa a pantalla completa">
      <div ref={box} className="absolute inset-0" />
      <button type="button" onClick={onClose} aria-label="Salir de pantalla completa"
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[1001] min-h-11 px-4 rounded-xl bg-card border border-line shadow text-sm font-semibold">✕ Cerrar</button>
    </div>
  )
}
