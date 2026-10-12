import { useEffect, type InputHTMLAttributes, type ReactNode } from 'react'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="bg-bg rounded-t-3xl max-h-[92vh] overflow-y-auto w-full max-w-xl mx-auto pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <div className="flex flex-col gap-5 p-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 -mr-2 flex items-center justify-center text-muted text-2xl">×</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Choice<T extends string | null>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string; color?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="text-sm font-medium text-muted mb-1.5">{label}</legend>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(o => (
          <button
            type="button"
            key={o.value ?? 'null'}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 border ${value === o.value ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}
          >
            {o.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} aria-hidden="true" />}
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function WeekdayPicker({ value, onChange, label = 'Días' }: { value: number[]; onChange: (v: number[]) => void; label?: string }) {
  const names = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const full = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  return (
    <fieldset className="flex flex-col">
      <legend className="text-sm font-medium text-muted mb-1.5">{label}</legend>
      <div className="grid grid-cols-7 gap-1.5">
        {names.map((n, i) => {
          const d = i + 1
          const on = value.includes(d)
          return (
            <button
              type="button"
              key={d}
              aria-pressed={on}
              aria-label={full[i]}
              onClick={() => onChange(on ? value.filter(x => x !== d) : [...value, d].sort())}
              className={`h-11 rounded-xl text-sm font-bold border ${on ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}
            >
              {n}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <input {...props} className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
    </label>
  )
}

export function ConfirmDelete({ label, onConfirm, confirming, setConfirming }: {
  label: string; onConfirm: () => void; confirming: boolean; setConfirming: (v: boolean) => void
}) {
  return confirming ? (
    <div className="flex items-center justify-between bg-card rounded-xl px-4 py-2">
      <span className="text-sm">¿Seguro?</span>
      <span className="flex gap-1">
        <button type="button" onClick={() => setConfirming(false)} className="min-h-10 px-2 text-sm text-muted">No</button>
        <button type="button" onClick={onConfirm} className="min-h-10 px-3 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Sí, eliminar</button>
      </span>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-danger text-sm font-semibold">{label}</button>
  )
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed right-5 bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] h-14 px-5 rounded-full bg-ink text-bg font-bold text-[15px] flex items-center gap-2 shadow-lg z-10"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  )
}
