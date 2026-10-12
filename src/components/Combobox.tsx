import { useId, useMemo, useState } from 'react'
import { fold } from '../data/places'

/** Desplegable con buscador: escribe unas letras y elige de la lista (sin acentos ni mayúsculas) */
export default function Combobox({ label, value, options, onChange, placeholder, max = 8 }: {
  label: string; value: string | null; options: string[]; onChange: (v: string | null) => void; placeholder?: string; max?: number
}) {
  const id = useId()
  const [text, setText] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const q = fold(text.trim())
    if (!q || (value && text === value)) return options.slice(0, max)
    const starts = options.filter(o => fold(o).startsWith(q))
    const contains = options.filter(o => !fold(o).startsWith(q) && fold(o).includes(q))
    return [...starts, ...contains].slice(0, max)
  }, [text, options, value, max])

  function pick(o: string) {
    onChange(o); setText(o); setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5 relative">
      <label htmlFor={id} className="text-sm font-medium text-muted">{label}</label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => {
            setOpen(false)
            // Si lo escrito no es una opción, se vuelve al valor guardado
            const exact = options.find(o => fold(o) === fold(text.trim()))
            if (exact) { if (exact !== value) onChange(exact); setText(exact) }
            else if (!text.trim()) onChange(null)
            else setText(value ?? '')
          }, 150)}
          onChange={e => { setText(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]) }
            if (e.key === 'Escape') setOpen(false)
          }}
          className="w-full min-h-12 pl-4 pr-10 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent"
        />
        {text && (
          <button type="button" aria-label="Borrar" onMouseDown={e => e.preventDefault()} onClick={() => { setText(''); onChange(null) }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 text-muted text-xl">×</button>
        )}
      </div>
      {open && matches.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-line rounded-xl shadow-lg overflow-hidden">
          {matches.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}
                className={`w-full text-left px-4 min-h-11 text-[15px] ${i === active ? 'bg-accent-soft' : ''}`}>{o}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
