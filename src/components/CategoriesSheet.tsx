import { useState, type FormEvent } from 'react'
import type { Category } from '../lib/money'
import { Sheet } from './Sheet'

export default function CategoriesSheet({ categories, onCreate, onRename, onArchive, onClose }: {
  categories: Category[]
  onCreate: (name: string) => Promise<unknown>
  onRename: (id: string, name: string) => Promise<unknown>
  onArchive: (id: string, archived: boolean) => Promise<unknown>
  onClose: () => void
}) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const active = categories.filter(c => !c.archived)
  const hidden = categories.filter(c => c.archived)
  const exists = (n: string) => categories.some(c => c.name.toLowerCase() === n.trim().toLowerCase())

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || exists(newName)) return
    await onCreate(newName)
    setNewName('')
  }

  return (
    <Sheet title="Categorías de gasto" onClose={onClose}>
      <form onSubmit={add} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nueva categoría</span>
          <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={30} placeholder="Nueva categoría…"
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px]" />
        </label>
        <button type="submit" disabled={!newName.trim() || exists(newName)} className="min-h-12 px-4 rounded-xl bg-accent text-white dark:text-bg font-semibold disabled:opacity-40">Añadir</button>
      </form>
      {newName.trim() && exists(newName) && <p className="text-sm text-muted -mt-3">Ya existe una categoría con ese nombre.</p>}

      <ul className="flex flex-col bg-card rounded-2xl px-4">
        {active.map((c, i) => {
          const value = names[c.id] ?? c.name
          return (
            <li key={c.id} className={`flex items-center gap-2 min-h-14 ${i < active.length - 1 ? 'border-b border-line' : ''}`}>
              <label className="flex-1">
                <span className="sr-only">Nombre de la categoría</span>
                <input
                  value={value}
                  maxLength={30}
                  onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value }))}
                  onBlur={() => { if (value.trim() && value.trim() !== c.name) onRename(c.id, value) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-full min-h-11 px-2 rounded-lg border border-transparent focus:border-line bg-transparent text-[16px]"
                />
              </label>
              <button onClick={() => onArchive(c.id, true)} className="min-h-10 px-2 text-sm text-muted">Ocultar</button>
            </li>
          )
        })}
      </ul>

      {hidden.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted">Ocultas</h3>
          <ul className="flex flex-col bg-card rounded-2xl px-4">
            {hidden.map((c, i) => (
              <li key={c.id} className={`flex items-center justify-between min-h-12 ${i < hidden.length - 1 ? 'border-b border-line' : ''}`}>
                <span className="text-[15px] text-muted">{c.name}</span>
                <button onClick={() => onArchive(c.id, false)} className="min-h-10 px-2 text-sm text-accent font-semibold">Recuperar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">Ocultar una categoría no borra nada: los gastos antiguos la conservan y puedes recuperarla cuando quieras.</p>
    </Sheet>
  )
}
