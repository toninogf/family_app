// Grupos plegables con una línea resumen (fichas de Buscamos y de Vendemos): mismo aspecto en las dos
import { useState, type ReactNode } from 'react'

/** Qué grupos están abiertos (se recuerda en este móvil, por clave); «go» abre uno y baja hasta él */
export function useOpenGroups<K extends string>(storageKey: string, initial: K[], alwaysOpen: K[] = []) {
  const [open, setOpen] = useState<Set<K>>(() => {
    try { const v = localStorage.getItem(storageKey); if (v) return new Set([...(JSON.parse(v) as K[]), ...alwaysOpen]) } catch { /* nada */ }
    return new Set([...initial, ...alwaysOpen])
  })
  const persist = (n: Set<K>) => { try { localStorage.setItem(storageKey, JSON.stringify([...n])) } catch { /* nada */ } }
  const toggle = (k: K) => setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); persist(n); return n })
  const go = (k: K) => {
    setOpen(o => { const n = new Set(o); n.add(k); persist(n); return n })
    setTimeout(() => document.getElementById(`grupo-${k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }
  return { isOpen: (k: K) => open.has(k), toggle, go }
}

export function GroupBox({ id, icon, title, line, open, onToggle, extra, lineAlways, children }: {
  id: string; icon: string; title: string; line?: ReactNode; open: boolean; onToggle: () => void; extra?: ReactNode; lineAlways?: boolean; children: ReactNode
}) {
  return (
    <section id={`grupo-${id}`} className="flex flex-col gap-2 scroll-mt-3">
      <div className="flex items-center gap-1 border-b border-line pb-1">
        <button onClick={onToggle} aria-expanded={open} className="flex-1 min-w-0 min-h-11 flex items-center gap-2 text-left">
          <span className="text-[16px]" aria-hidden="true">{icon}</span>
          <span className="flex flex-col min-w-0">
            <span className="font-bold text-[16px] leading-tight">{title}</span>
            {(!open || lineAlways) && line ? <span className="text-[12px] text-muted truncate">{line}</span> : null}
          </span>
          <span className="ml-auto text-muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        {open && extra}
      </div>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  )
}

/** Casilla de resumen (verde bien, ámbar aviso, rojo problema) */
export function Tile({ label, value, tone = 'none', onClick }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'none'; onClick?: () => void }) {
  const cls = `rounded-2xl p-3 text-left flex flex-col gap-0.5 min-w-0 ${tone === 'ok' ? 'bg-accent-soft' : tone === 'warn' ? 'bg-[#C77A12]/12' : tone === 'bad' ? 'bg-danger/10' : 'bg-card'}`
  const inner = <><span className="text-[12px] text-muted">{label}</span><span className="text-[17px] font-bold truncate">{value}</span></>
  return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>
}
