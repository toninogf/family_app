import { useState, type FormEvent } from 'react'
import { CATEGORY_COLORS, type IconCategories, type IconCategory } from '../lib/categories'
import { Sheet } from './Sheet'

/** Editar categorías con icono y color: nombre, emoji, color, orden, ocultar */
export default function IconCategoriesSheet({ title, cats, onClose }: { title: string; cats: IconCategories; onClose: () => void }) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const active = cats.categories.filter(c => !c.archived)
  const hidden = cats.categories.filter(c => c.archived)
  const exists = (n: string) => cats.categories.some(c => c.name.toLowerCase() === n.trim().toLowerCase())

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || exists(newName)) return
    await cats.create(newName, newIcon.trim(), CATEGORY_COLORS[cats.categories.length % CATEGORY_COLORS.length])
    setNewName(''); setNewIcon('')
  }

  async function move(c: IconCategory, dir: -1 | 1) {
    const i = active.findIndex(x => x.id === c.id)
    const other = active[i + dir]
    if (!other) return
    await cats.update(c.id, { position: other.position })
    await cats.update(other.id, { position: c.position === other.position ? c.position + dir : c.position })
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={add} className="flex gap-2">
        <input value={newIcon} onChange={e => setNewIcon(e.target.value)} maxLength={8} placeholder="🙂" aria-label="Icono"
          className="w-14 min-h-12 rounded-xl border border-line bg-card text-center text-[20px]" />
        <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={30} placeholder="Nueva categoría…" aria-label="Nombre"
          className="flex-1 min-w-0 min-h-12 px-4 rounded-xl border border-line bg-card text-[16px]" />
        <button type="submit" disabled={!newName.trim() || exists(newName)} className="min-h-12 px-4 rounded-xl bg-accent text-white dark:text-bg font-semibold disabled:opacity-40">Añadir</button>
      </form>
      {cats.error && <p role="alert" className="text-sm text-danger">{cats.error}</p>}

      <ul className="flex flex-col bg-card rounded-2xl px-3">
        {active.map((c, i) => (
          <li key={c.id} className={`py-2 ${i < active.length - 1 ? 'border-b border-line' : ''}`}>
            {editing === c.id ? (
              <CategoryEditor c={c} cats={cats} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex items-center gap-2 min-h-11">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[18px]" style={{ background: `${c.color}22` }} aria-hidden="true">{c.icon}</span>
                <button onClick={() => setEditing(c.id)} className="flex-1 text-left text-[15px] font-semibold min-h-11">{c.name}</button>
                <button onClick={() => move(c, -1)} disabled={i === 0} aria-label="Subir" className="w-9 h-10 text-muted disabled:opacity-30">↑</button>
                <button onClick={() => move(c, 1)} disabled={i === active.length - 1} aria-label="Bajar" className="w-9 h-10 text-muted disabled:opacity-30">↓</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted">Ocultas</h3>
          <ul className="flex flex-col bg-card rounded-2xl px-3">
            {hidden.map((c, i) => (
              <li key={c.id} className={`flex items-center justify-between min-h-12 ${i < hidden.length - 1 ? 'border-b border-line' : ''}`}>
                <span className="text-[15px] text-muted">{c.icon} {c.name}</span>
                <button onClick={() => cats.update(c.id, { archived: false })} className="min-h-10 px-2 text-sm text-accent font-semibold">Recuperar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">Toca una categoría para cambiar su nombre, icono o color. Ocultarla no borra nada: lo que ya la usa la conserva.</p>
    </Sheet>
  )
}

function CategoryEditor({ c, cats, onDone }: { c: IconCategory; cats: IconCategories; onDone: () => void }) {
  const [name, setName] = useState(c.name)
  const [icon, setIcon] = useState(c.icon)
  const [color, setColor] = useState(c.color)

  async function save() {
    if (!name.trim()) return
    await cats.update(c.id, { name: name.trim(), icon: icon.trim() || '📌', color })
    onDone()
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex gap-2">
        <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={8} aria-label="Icono" className="w-14 min-h-11 rounded-lg border border-line bg-bg text-center text-[20px]" />
        <input value={name} onChange={e => setName(e.target.value)} maxLength={30} aria-label="Nombre" autoFocus className="flex-1 min-w-0 min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]" />
      </div>
      <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Color">
        {CATEGORY_COLORS.map(col => (
          <button key={col} role="radio" aria-checked={color === col} aria-label={col} onClick={() => setColor(col)}
            className={`w-8 h-8 rounded-full ${color === col ? 'ring-2 ring-offset-2 ring-ink ring-offset-card' : ''}`} style={{ background: col }} />
        ))}
      </div>
      <div className="flex justify-between">
        <button onClick={async () => { await cats.update(c.id, { archived: true }); onDone() }} className="min-h-10 px-1 text-sm text-muted">Ocultar</button>
        <span className="flex gap-2">
          <button onClick={onDone} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
          <button onClick={save} className="min-h-10 px-4 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold">Guardar</button>
        </span>
      </div>
    </div>
  )
}
