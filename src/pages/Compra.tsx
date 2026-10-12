import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../lib/household'
import { CATEGORIES, useShoppingItems, useShoppingLists, type ShoppingItem, type ShoppingList } from '../lib/shopping'
import { Card } from '../components/ui'

const LAST_LIST_KEY = 'compra:lastList'

function readLastList() {
  try { return localStorage.getItem(LAST_LIST_KEY) } catch { return null }
}
function saveLastList(id: string) {
  try { localStorage.setItem(LAST_LIST_KEY, id) } catch { /* sin almacenamiento */ }
}

export default function Compra() {
  const { me, members } = useHousehold()
  const navigate = useNavigate()
  const { lists, loading: listsLoading, createList, renameList, deleteList, moveList } = useShoppingLists()
  const [managing, setManaging] = useState(false)
  const [listId, setListId] = useState<string | null>(null)
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [entry, setEntry] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [showChecked, setShowChecked] = useState(true)

  useEffect(() => {
    if (!lists.length) return
    if (listId && lists.some(l => l.id === listId)) return
    const last = readLastList()
    setListId(lists.find(l => l.id === last)?.id ?? lists[0].id)
  }, [lists, listId])

  const current = lists.find(l => l.id === listId)
  const { items, frequent, loading, error, addItem, toggle, updateItem, remove, clearChecked, clearError } = useShoppingItems(listId)

  const memberName = (id: string | null) => members.find(m => m.id === id)?.display_name
  const pending = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked).sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''))

  const groups = useMemo(() => {
    const order = [...CATEGORIES] as string[]
    const map = new Map<string, ShoppingItem[]>()
    for (const item of pending) {
      const cat = order.includes(item.category) ? item.category : 'Otros'
      map.set(cat, [...(map.get(cat) ?? []), item])
    }
    return order.filter(c => map.has(c)).map(c => ({ category: c, items: map.get(c)! }))
  }, [pending])

  const pendingKeys = new Set(pending.map(i => i.name.toLowerCase()))
  const suggestions = frequent.filter(f => !pendingKeys.has(f.key)).slice(0, 8)

  function selectList(id: string) {
    setListId(id); saveLastList(id); setEditing(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = entry.trim()
    if (!value) return
    setEntry('')
    await addItem(value, current?.name)
  }

  async function submitList(e: FormEvent) {
    e.preventDefault()
    if (!newListName.trim() || !me) return
    const err = await createList(newListName, me.household_id)
    if (!err) { setNewListName(''); setNewListOpen(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex justify-between items-center">
        <h1 className="text-[26px] font-bold tracking-tight">Compra</h1>
        <span className="text-xs text-muted flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#2E9E5B]" aria-hidden="true" /> En directo
        </span>
      </header>

      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1" role="tablist" aria-label="Listas">
        {lists.map(l => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === listId}
            onClick={() => selectList(l.id)}
            className={`shrink-0 min-h-10 px-4 rounded-full text-sm font-semibold ${l.id === listId ? 'bg-ink text-bg' : 'bg-card border border-line text-ink'}`}
          >
            {l.name}
          </button>
        ))}
        {!newListOpen && (
          <button onClick={() => setNewListOpen(true)} className="shrink-0 min-h-10 px-4 rounded-full text-sm font-semibold bg-card border border-line text-accent">
            + Lista
          </button>
        )}
        <button
          onClick={() => setManaging(m => !m)}
          aria-expanded={managing}
          aria-label="Gestionar listas"
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border border-line ${managing ? 'bg-ink text-bg' : 'bg-card text-muted'}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </div>

      {managing && (
        <ManageLists
          lists={lists}
          onRename={renameList}
          onMove={moveList}
          onDelete={async id => {
            await deleteList(id)
            if (id === listId) setListId(lists.find(l => l.id !== id)?.id ?? null)
          }}
          onClose={() => setManaging(false)}
        />
      )}

      {newListOpen && (
        <form onSubmit={submitList} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Nombre de la nueva lista</span>
            <input autoFocus value={newListName} onChange={e => setNewListName(e.target.value)} maxLength={40} placeholder="Nombre de la lista"
              className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
          </label>
          <button type="submit" className="min-h-12 px-4 rounded-xl bg-accent text-white dark:text-bg font-semibold">Crear</button>
          <button type="button" onClick={() => setNewListOpen(false)} className="min-h-12 px-3 text-muted">Cancelar</button>
        </form>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Añadir artículo</span>
          <input
            value={entry}
            onChange={e => setEntry(e.target.value)}
            placeholder="Añadir… (ej. 2 kg tomates)"
            enterKeyHint="done"
            maxLength={100}
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </label>
        <button type="submit" aria-label="Añadir" disabled={!entry.trim() || !listId} className="w-12 h-12 rounded-xl bg-accent text-white dark:text-bg flex items-center justify-center disabled:opacity-40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-muted mr-1">Frecuentes:</span>
          {suggestions.map(s => (
            <button key={s.key} onClick={() => addItem(s.name, current?.name)} className="min-h-8 px-3 rounded-full bg-accent-soft text-accent text-[13px] font-semibold">
              + {s.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Card className="flex justify-between items-center gap-3">
          <p role="alert" className="text-danger text-sm">No se pudo guardar: {error}</p>
          <button onClick={clearError} className="text-sm text-muted min-h-10 px-2">Cerrar</button>
        </Card>
      )}

      {(loading || listsLoading) && !items.length ? (
        <p className="text-muted text-sm">Cargando…</p>
      ) : pending.length === 0 ? (
        <Card><p className="text-muted text-sm">{checked.length ? '¡Todo en el carro!' :'La lista está vacía. Añade lo que falte en casa.'}</p></Card>
      ) : (
        <Card className="py-1 flex flex-col">
          {groups.map(g => (
            <section key={g.category} aria-label={g.category}>
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider pt-3 pb-1">{g.category}</h2>
              <ul>
                {g.items.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    last={idx === g.items.length - 1}
                    addedBy={item.added_by && item.added_by !== me?.id ? memberName(item.added_by) : undefined}
                    editing={editing === item.id}
                    onEdit={() => setEditing(editing === item.id ? null : item.id)}
                    onToggle={() => toggle(item)}
                    onSave={changes => { updateItem(item, changes); setEditing(null) }}
                    onDelete={() => { remove(item); setEditing(null) }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </Card>
      )}

      {checked.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <button onClick={() => setShowChecked(s => !s)} aria-expanded={showChecked} className="min-h-10 text-sm font-semibold text-muted flex items-center gap-1">
              En el carro ({checked.length}) <span aria-hidden="true">{showChecked ? '▾' : '▸'}</span>
            </button>
            <span className="flex gap-1.5">
              <button
                onClick={() => navigate(`/dinero?nuevo=1&concepto=${encodeURIComponent(`Compra ${current?.name ?? ''}`.trim())}&categoria=${encodeURIComponent(current?.name.toLowerCase().includes('farmacia') ? 'Salud' : 'Supermercado')}`)}
                className="min-h-10 px-3 rounded-xl border border-line bg-card text-accent text-[13px] font-semibold"
              >
                Pasar a gasto
              </button>
              <button onClick={clearChecked} className="min-h-10 px-3 rounded-xl border border-line bg-card text-accent text-[13px] font-semibold">
                Vaciar comprados
              </button>
            </span>
          </div>
          {showChecked && (
            <Card className="py-1">
              <ul>
                {checked.map((item, idx) => (
                  <li key={item.id} className={`flex items-center gap-3 min-h-12 ${idx < checked.length - 1 ? 'border-b border-line' : ''}`}>
                    <label className="flex items-center gap-3 flex-1 min-h-12">
                      <input type="checkbox" checked onChange={() => toggle(item)} className="w-5 h-5 accent-[var(--app-accent)]" />
                      <span className="text-[15px] text-muted line-through">{item.name}</span>
                      {item.quantity && <span className="text-[13px] text-muted">{item.quantity}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

function ManageLists({ lists, onRename, onMove, onDelete, onClose }: {
  lists: ShoppingList[]
  onRename: (id: string, name: string) => Promise<unknown>
  onMove: (id: string, direction: -1 | 1) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="font-bold text-[15px]">Gestionar listas</h2>
        <button onClick={onClose} className="min-h-10 px-2 text-sm font-semibold text-accent">Hecho</button>
      </div>
      <ul className="flex flex-col gap-2">
        {lists.map((l, idx) => {
          const value = names[l.id] ?? l.name
          const changed = value.trim() && value.trim() !== l.name
          return (
            <li key={l.id} className="flex flex-col gap-2 border-b border-line last:border-b-0 pb-2">
              <div className="flex items-center gap-1.5">
                <label className="flex-1">
                  <span className="sr-only">Nombre de la lista</span>
                  <input
                    value={value}
                    maxLength={40}
                    onChange={e => setNames(n => ({ ...n, [l.id]: e.target.value }))}
                    onBlur={() => { if (changed) onRename(l.id, value) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]"
                  />
                </label>
                <button onClick={() => onMove(l.id, -1)} disabled={idx === 0} aria-label={`Subir ${l.name}`} className="w-10 h-11 flex items-center justify-center text-muted disabled:opacity-30">▲</button>
                <button onClick={() => onMove(l.id, 1)} disabled={idx === lists.length - 1} aria-label={`Bajar ${l.name}`} className="w-10 h-11 flex items-center justify-center text-muted disabled:opacity-30">▼</button>
                <button
                  onClick={() => setConfirming(confirming === l.id ? null : l.id)}
                  disabled={lists.length === 1}
                  aria-label={`Borrar ${l.name}`}
                  className="w-10 h-11 flex items-center justify-center text-danger disabled:opacity-30"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                </button>
              </div>
              {confirming === l.id && (
                <div className="flex items-center justify-between gap-2 bg-bg rounded-lg px-3 py-2">
                  <span className="text-sm">¿Borrar «{l.name}» y todos sus artículos?</span>
                  <span className="flex gap-1">
                    <button onClick={() => setConfirming(null)} className="min-h-10 px-2 text-sm text-muted">No</button>
                    <button onClick={async () => { setConfirming(null); await onDelete(l.id) }} className="min-h-10 px-3 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Borrar</button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {lists.length === 1 && <p className="text-xs text-muted">Siempre tiene que quedar al menos una lista.</p>}
    </Card>
  )
}

function ItemRow({ item, last, addedBy, editing, onEdit, onToggle, onSave, onDelete }: {
  item: ShoppingItem
  last: boolean
  addedBy?: string
  editing: boolean
  onEdit: () => void
  onToggle: () => void
  onSave: (changes: { name: string; quantity: string | null; category: string }) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [category, setCategory] = useState(item.category)
  const pendingSync = item.id.startsWith('tmp-')

  // Solo al abrir el editor: así un cambio en directo del otro móvil no borra lo que estás escribiendo
  useEffect(() => {
    if (editing) { setName(item.name); setQuantity(item.quantity ?? ''); setCategory(item.category) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  return (
    <li className={`${last ? '' : 'border-b border-line'}`}>
      <div className="flex items-center gap-3 min-h-12">
        <label className="flex items-center gap-3 flex-1 min-h-12 py-1.5">
          <input type="checkbox" checked={false} onChange={onToggle} disabled={pendingSync} className="w-5 h-5 accent-[var(--app-accent)]" />
          <span className="flex flex-col">
            <span className="text-[15px]">{item.name}</span>
            {addedBy && <span className="text-xs text-muted">Añadido por {addedBy}</span>}
          </span>
        </label>
        {item.quantity && <span className="text-[13px] text-muted">{item.quantity}</span>}
        <button onClick={onEdit} disabled={pendingSync} aria-label={`Editar ${item.name}`} aria-expanded={editing} className="w-10 h-10 -mr-2 flex items-center justify-center text-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </div>
      {editing && (
        <form
          onSubmit={e => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), quantity: quantity.trim() || null, category }) }}
          className="flex flex-col gap-2 pb-3"
        >
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Nombre</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={80} className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]" />
            </label>
            <label className="w-24">
              <span className="sr-only">Cantidad</span>
              <input value={quantity} onChange={e => setQuantity(e.target.value)} maxLength={20} placeholder="Cant." className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[16px]" />
            </label>
          </div>
          <label>
            <span className="sr-only">Categoría</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg text-[15px]">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="flex gap-2 justify-between">
            <button type="button" onClick={onDelete} className="min-h-11 px-3 text-danger text-sm font-semibold">Eliminar</button>
            <button type="submit" className="min-h-11 px-4 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold">Guardar</button>
          </div>
        </form>
      )}
    </li>
  )
}
