// Piezas pequeñas compartidas por Buscamos y la ficha de la casa (chips, nota, títulos, enlaces…)
import { useEffect, useState, type ReactNode } from 'react'
import { type Member } from '../../lib/supabase'

import { HOME_STATUS, portalName, priceShort, type Check, type Home, type Link, type HomeStatus } from '../../lib/mudanza'
import { nearbySchools, schoolSummary, type NearSchool } from '../../lib/colegios'
import { fmtScore, scoreTone, type HomeScore } from '../../lib/score'
import { MUNICIPALITIES, PROVINCES, fold } from '../../data/places'

export const PROVINCE_NAMES = PROVINCES.map(p => p.name)
export const municipalitiesOf = (province: string | null) => {
  const code = PROVINCES.find(p => p.name === province)?.code
  return code ? MUNICIPALITIES[code].map(x => x.name) : []
}
export const ALL_MUNICIPALITIES = PROVINCES.flatMap(p => MUNICIPALITIES[p.code].map(x => x.name))


/** Número para WhatsApp: con prefijo de España si no lo trae */
export const waNumber = (phone: string) => { const d = phone.replace(/\D/g, ''); return d.length === 9 ? `34${d}` : d.replace(/^00/, '') }
export const nameOf = (id: string | null, members: Member[]) => (id ? members.find(x => x.id === id)?.display_name ?? '' : '')
// Admite «1.200» (miles con punto) y «95,5» (decimales con coma)
export const num = (s: string) => {
  const t = s.trim().replace(/\s|m²|m2/gi, '')
  if (!t) return null
  return Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'))
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'bad' | 'unknown' | 'warn' }) {
  const cls = tone === 'ok' ? 'bg-accent-soft text-accent' : tone === 'bad' ? 'bg-danger/10 text-danger' : tone === 'warn' ? 'bg-[#C77A12]/15 text-[#C77A12]' : tone === 'unknown' ? 'bg-bg text-muted' : 'bg-bg'
  return <span className={`text-[12px] font-semibold px-2 py-1 rounded-lg ${cls}`}>{children}</span>
}

export function StatusBadge({ s }: { s: HomeStatus }) {
  // «Llamar para visita» es una tarea pendiente: se resalta para que no se olvide
  const cls = s === 'favorito' || s === 'oferta' ? 'bg-accent text-white dark:text-bg' : s === 'descartado' || s === 'fuera' ? 'bg-bg text-muted'
    : s === 'llamar' ? 'bg-danger text-white dark:text-bg' : 'bg-accent-soft text-accent'
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cls}`}>{s === 'favorito' ? '★ ' : s === 'llamar' ? '📞 ' : ''}{HOME_STATUS[s]}</span>
}

/** Chip de un criterio: ✓ verde, ✗ rojo, ? gris o 🔨 ámbar si no lo tiene pero está en la reforma */
export function CheckChip({ c }: { c: Check }) {
  if (c.ok === false && c.reform) return <Chip tone="warn">🔨 {c.label}: no tiene · {/piscina/i.test(c.label) ? 'hacerla' : 'con reforma'} ~{kShort(c.reform.cents)}</Chip>
  return <Chip tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>
}

/** Título sin repetir la zona ni la localidad (ya salen en la línea 📍) */
export function shortTitle(h: Home) {
  // Fuera lo que ya sale debajo: zona y localidad (aunque vengan partidas), habitaciones y metros
  const where = [h.zone, h.municipality].filter(Boolean).map(x => fold(x!))
  const parts = h.title.split(/\s+·\s+|\s+-\s+|,\s+/)
  const kept = parts.filter((p, i) => {
    if (i === 0) return true
    const f = fold(p.trim())
    if (!f) return false
    if (where.some(w => w === f || w.includes(f) || f.includes(w))) return false
    return !/^\d+\s*(hab|dorm|habitaciones|m2|m²|metros)/i.test(p.trim())
  })
  const first = kept[0].replace(/\s+\d+\s*(hab\.?|habitaciones|dormitorios)(\s|$)/i, ' ').replace(/\s+\d+\s*m²/i, '').trim()
  return [first, ...kept.slice(1)].join(' · ').replace(/\s+(en|·)\s*$/i, '') || h.title
}

/** Colegio más cercano (primaria) para la tarjeta, cuando hay ubicación */
export function useNearestSchool(h: Home) {
  const [s, setS] = useState<NearSchool | null>(null)
  useEffect(() => {
    if (h.lat == null || h.lng == null) return
    let alive = true
    nearbySchools(h.lat, h.lng).then(l => { if (alive) { const x = schoolSummary(l); setS(x.pubPri ?? x.closest ?? null) } }).catch(() => {})
    return () => { alive = false }
  }, [h.lat, h.lng])
  return s
}

/** Nota 0–10 (tarjeta y comparador) */
export function ScoreBadge({ s, big }: { s: HomeScore; big?: boolean }) {
  return (
    <span title={s.provisional ? 'Provisional: faltan datos' : 'Nota de 0 a 10'}
      className={`inline-flex items-baseline gap-0.5 rounded-full font-bold ${scoreTone(s.score)} ${big ? 'px-3 py-1 text-[22px]' : 'px-2 py-0.5 text-[14px]'}`}>
      {fmtScore(s.score)}{s.provisional && <span className={big ? 'text-[14px]' : 'text-[11px]'}>*</span>}
    </span>
  )
}

/** «**texto**» → negrita */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>
}

/** Enlaces extra de un piso (otros portales, la inmobiliaria), con su precio y aviso si es más barato */
export function LinkChips({ links, ourPrice, big }: { links: Link[]; ourPrice: number | null; big?: boolean }) {
  return (
    <span className="flex gap-1.5 flex-wrap items-center">
      <span className="text-[12px] text-muted">También en:</span>
      {links.map(l => {
        const low = l.price_cents != null && ourPrice != null && l.price_cents < ourPrice
        return (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            className={`${big ? 'min-h-10 px-3 text-[13px]' : 'min-h-8 px-2.5 text-[12px]'} rounded-full border font-semibold flex items-center gap-1 ${low ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-accent'}`}>
            {l.label || portalName(l.url)}{l.price_cents ? ` · ${priceShort(l.price_cents)}` : ''}{low ? ' ⬇️' : ''} ↗
          </a>
        )
      })}
    </span>
  )
}

/** «41,5 k€» */
export const kShort = (c: number) => `${(c / 100000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€`
