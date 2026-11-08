// Piezas para las fichas en modo edición: bloques plegables con contador, campos con unidad y resaltado de lo que
// acaba de rellenar la IA, desplegables compactos, barra de guardar fija y aviso de cambios sin guardar.
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

export type FlashKind = 'filled' | 'diff'
export type Flash = Record<string, FlashKind>

const ring = (f?: FlashKind) => (f === 'filled' ? 'ring-2 ring-accent' : f === 'diff' ? 'ring-2 ring-[#C77A12]' : '')

/** Campo de texto con unidad dentro (€, m², €/mes) y resaltado si lo acaba de tocar la IA */
export function Field({ label, suffix, flash, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; suffix?: string; flash?: FlashKind }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-sm font-medium text-muted truncate">{label}{flash === 'filled' ? ' ✨' : flash === 'diff' ? ' ⚠️' : ''}</span>
      <span className={`relative rounded-xl ${ring(flash)}`}>
        <input {...props} className={`w-full min-h-12 px-3 ${suffix ? 'pr-12' : ''} rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent`} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none">{suffix}</span>}
      </span>
    </label>
  )
}

/** Desplegable compacto (en lugar de una fila de botones) */
export function SelectField<T extends string>({ label, value, onChange, options, flash, empty = 'Sin saber' }: {
  label: string; value: T | null; onChange: (v: T | null) => void; options: { value: T; label: string }[]; flash?: FlashKind; empty?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-sm font-medium text-muted truncate">{label}{flash === 'filled' ? ' ✨' : flash === 'diff' ? ' ⚠️' : ''}</span>
      <select value={value ?? ''} onChange={e => onChange((e.target.value || null) as T | null)}
        className={`w-full min-h-12 px-3 rounded-xl border border-line bg-card text-[16px] ${ring(flash)}`}>
        <option value="">{empty}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Bloque plegable de la edición, con cuántos datos tiene rellenos */
export function EditSection({ id, icon, title, filled, total, open, onToggle, flashed, children }: {
  id: string; icon: string; title: string; filled?: number; total?: number; open: boolean; onToggle: () => void; flashed?: boolean; children: ReactNode
}) {
  const complete = total != null && filled === total
  return (
    <section id={`edit-${id}`} className={`rounded-2xl border ${flashed ? 'border-accent' : 'border-line'} scroll-mt-4`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-12 px-3 flex items-center gap-2 text-left">
        <span aria-hidden="true">{icon}</span>
        <span className="flex-1 font-bold text-[15px]">{title}</span>
        {total != null && <span className={`text-[12px] font-semibold ${complete ? 'text-accent' : 'text-muted'}`}>{complete ? '✓ ' : ''}{filled}/{total}</span>}
        {flashed && <span className="text-[12px]">✨</span>}
        <span className="text-muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-3 pb-3 flex flex-col gap-4">{children}</div>}
    </section>
  )
}

/** Qué bloques están abiertos; abrir uno lleva hasta él */
export function useSections(initial: string[]) {
  const [open, setOpen] = useState<Set<string>>(new Set(initial))
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const reveal = (keys: string[], scroll?: string) => {
    setOpen(s => new Set([...s, ...keys]))
    if (scroll) setTimeout(() => document.getElementById(`edit-${scroll}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
  }
  return { isOpen: (k: string) => open.has(k), toggle, reveal }
}

/** Resaltado temporal de lo que ha rellenado la IA (verde) y de lo que no coincide (naranja) */
export function useFlash(ms = 8000) {
  const [flash, setFlash] = useState<Flash>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const show = (filled: string[], diffs: string[]) => {
    const f: Flash = {}
    for (const k of filled) f[k] = 'filled'
    for (const k of diffs) f[k] = 'diff'
    setFlash(f)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(x => Object.fromEntries(Object.entries(x).filter(([, v]) => v === 'diff'))), ms)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return { flash, show, clearDiff: (k: string) => setFlash(x => { const n = { ...x }; delete n[k]; return n }) }
}

/** ¿Ha cambiado algo desde que se abrió? (se compara una «foto» de todos los valores) */
export function useDirty(snapshot: unknown) {
  const first = useRef(JSON.stringify(snapshot))
  return JSON.stringify(snapshot) !== first.current
}

/** Barra fija de guardar (siempre a mano) y el aviso al cerrar con cambios */
export function SaveBar({ dirty, busy, label = 'Guardar', status, error, leaving, onStay, onLeave }: {
  dirty: boolean; busy: boolean; label?: string; status?: string | null; error?: string
  leaving: boolean; onStay: () => void; onLeave: () => void
}) {
  return (
    <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 bg-bg border-t border-line flex flex-col gap-2 z-10">
      {leaving && (
        <div className="flex items-center gap-2 bg-card rounded-xl p-2.5" role="alert">
          <span className="flex-1 text-sm font-semibold">Tienes cambios sin guardar</span>
          <button type="button" onClick={onStay} className="min-h-10 px-3 text-sm font-semibold text-accent">Seguir</button>
          <button type="button" onClick={onLeave} className="min-h-10 px-3 rounded-lg border border-line text-sm font-semibold">Salir sin guardar</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {status && <p role="status" className="text-sm text-muted">{status}</p>}
      <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
        {busy ? 'Guardando…' : `${label}${dirty ? ' · cambios sin guardar' : ''}`}
      </button>
    </div>
  )
}

/** Resumen tras rellenar desde el anuncio: cuánto se ha rellenado, qué no coincide y qué falta (con acceso a cada bloque) */
export function ImportSummary({ filled, diffs, missing, onGo }: {
  filled: number; diffs: number; missing: { id: string; title: string; n: number }[]; onGo: (id: string) => void
}) {
  const totalMissing = missing.reduce((s, x) => s + x.n, 0)
  return (
    <div className="rounded-2xl bg-accent-soft p-3 flex flex-col gap-2" role="status">
      <span className="text-[14px] font-semibold">
        ✨ Rellenados {filled} dato{filled === 1 ? '' : 's'}{diffs ? ` · ⚠️ ${diffs} no coinciden` : ''}{totalMissing ? ` · faltan ${totalMissing}` : ' · ¡completo!'}
      </span>
      {missing.some(x => x.n) && (
        <span className="flex gap-1.5 flex-wrap">
          {missing.filter(x => x.n).map(x => (
            <button key={x.id} type="button" onClick={() => onGo(x.id)} className="min-h-8 px-2.5 rounded-full bg-card border border-line text-[12px] font-semibold">{x.title}: faltan {x.n}</button>
          ))}
        </span>
      )}
    </div>
  )
}

/** Iconos de los extras */
export const FEATURE_ICON: Record<string, string> = {
  ascensor: '🛗', garaje: '🚗', trastero: '📦', terraza: '☀️', exterior: '🪟', calefaccion: '🔥', aire: '❄️', jardin: '🌿',
  piscina: '🏊', reformado: '✨', placas_solares: '🔆', solar_termica: '♨️', cerca_cole: '🏫', transporte: '🚌'
}

/** Importe con puntos de miles al salir del campo («650000» → «650.000») */
export function thousands(v: string) {
  const t = v.trim()
  if (!/^\d{4,}$/.test(t)) return v
  return Number(t).toLocaleString('es-ES', { useGrouping: true, maximumFractionDigits: 0 }).replace(/\s/g, '.')
}
