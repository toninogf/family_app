import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type ShoppingList = { id: string; name: string; position: number }
export type ShoppingItem = {
  id: string
  list_id: string
  name: string
  quantity: string | null
  category: string
  checked: boolean
  checked_at: string | null
  archived: boolean
  added_by: string | null
  created_at: string
}
export type Frequent = { list_id: string; key: string; name: string; category: string; times: number }

// Orden de recorrido típico de un súper
export const CATEGORIES = [
  'Frutas y verduras',
  'Panadería',
  'Carne y pescado',
  'Lácteos y huevos',
  'Despensa',
  'Bebidas',
  'Congelados',
  'Limpieza',
  'Higiene',
  'Farmacia',
  'Otros'
] as const

const KEYWORDS: Record<string, string[]> = {
  'Frutas y verduras': ['tomate', 'lechuga', 'cebolla', 'ajo', 'patata', 'zanahoria', 'pimiento', 'calabac', 'berenjena', 'pepino', 'espinaca', 'brócoli', 'brocoli', 'coliflor', 'puerro', 'champiñ', 'seta', 'plátano', 'platano', 'manzana', 'pera', 'naranja', 'mandarina', 'limón', 'limon', 'fresa', 'uva', 'melón', 'melon', 'sandía', 'sandia', 'kiwi', 'aguacate', 'fruta', 'verdura', 'perejil', 'albahaca'],
  'Panadería': ['pan', 'barra', 'baguette', 'croissant', 'bollo', 'magdalena', 'tostada', 'biscote'],
  'Carne y pescado': ['pollo', 'ternera', 'cerdo', 'carne', 'filete', 'hamburguesa', 'salchicha', 'chorizo', 'jamón', 'jamon', 'pavo', 'lomo', 'bacon', 'beicon', 'pescado', 'merluza', 'salmón', 'salmon', 'atún fresco', 'gamba', 'langostino', 'calamar', 'sepia', 'mejillón', 'mejillon', 'bacalao', 'dorada', 'lubina'],
  'Lácteos y huevos': ['leche', 'yogur', 'queso', 'mantequilla', 'nata', 'huevo', 'kéfir', 'kefir', 'flan', 'natillas', 'bebida de avena', 'bebida vegetal'],
  'Despensa': ['arroz', 'pasta', 'macarr', 'espagueti', 'fideo', 'harina', 'azúcar', 'azucar', 'sal', 'aceite', 'vinagre', 'atún', 'atun', 'tomate frito', 'legumbre', 'lenteja', 'garbanzo', 'alubia', 'café', 'cafe', 'cacao', 'colacao', 'té', 'infusión', 'galleta', 'cereal', 'mermelada', 'miel', 'especia', 'pimienta', 'caldo', 'conserva', 'chocolate', 'patatas fritas', 'frutos secos'],
  'Bebidas': ['agua', 'zumo', 'refresco', 'cola', 'cerveza', 'vino', 'gaseosa', 'tónica', 'tonica'],
  'Congelados': ['congelad', 'helado', 'pizza', 'croqueta', 'empanadilla', 'guisantes'],
  'Limpieza': ['detergente', 'suavizante', 'lejía', 'lejia', 'friegasuelos', 'lavavajillas', 'fregona', 'estropajo', 'bayeta', 'papel de cocina', 'bolsas de basura', 'basura', 'limpia', 'amoniaco', 'pastillas lavavajillas'],
  'Higiene': ['champú', 'champu', 'gel', 'jabón', 'jabon', 'pasta de dientes', 'dentífrico', 'cepillo', 'desodorante', 'papel higiénico', 'papel higienico', 'compresa', 'tampón', 'pañal', 'panal', 'toallita', 'crema', 'colonia', 'cuchilla', 'algodón', 'bastoncillo'],
  'Farmacia': ['paracetamol', 'ibuprofeno', 'apiretal', 'dalsy', 'tirita', 'venda', 'termómetro', 'jarabe', 'suero', 'vitamina', 'antihistamínico', 'gasas', 'betadine', 'alcohol']
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function guessCategory(name: string, listName?: string): string {
  if (listName && normalize(listName).includes('farmacia')) return 'Farmacia'
  const n = normalize(name)
  // Las coincidencias más largas primero (p. ej. "tomate frito" antes que "tomate")
  const pairs = Object.entries(KEYWORDS)
    .flatMap(([cat, words]) => words.map(w => [cat, normalize(w)] as const))
    .sort((a, b) => b[1].length - a[1].length)
  for (const [cat, w] of pairs) {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    if (re.test(n)) return cat
  }
  return 'Otros'
}

// "2 kg tomates" → { quantity: "2 kg", name: "tomates" }; "leche x6" → { quantity: "6", name: "leche" }
export function parseEntry(raw: string): { name: string; quantity: string | null } {
  const text = raw.trim().replace(/\s+/g, ' ')
  const lead = text.match(/^(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|cl|uds?|unidades?|paquetes?|botes?|latas?|docenas?|bolsas?|cajas?)?)\s+(.+)$/i)
  if (lead) return { quantity: lead[1].trim(), name: capitalize(lead[2]) }
  const tail = text.match(/^(.+?)\s*[x×]\s*(\d+)$/i)
  if (tail) return { quantity: tail[2], name: capitalize(tail[1]) }
  return { quantity: null, name: capitalize(text) }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function useShoppingLists() {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('shopping_lists').select('id, name, position').order('position').order('created_at')
    setLists((data ?? []) as ShoppingList[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('shopping_lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function createList(name: string, householdId: string) {
    const position = lists.length
    const { error } = await supabase.from('shopping_lists').insert({ name: name.trim(), household_id: householdId, position })
    if (!error) await load()
    return error
  }

  async function renameList(id: string, name: string) {
    const clean = name.trim()
    if (!clean) return null
    setLists(prev => prev.map(l => l.id === id ? { ...l, name: clean } : l))
    const { error } = await supabase.from('shopping_lists').update({ name: clean }).eq('id', id)
    if (error) await load()
    return error
  }

  // Borra la lista y todos sus artículos (en cascada)
  async function deleteList(id: string) {
    setLists(prev => prev.filter(l => l.id !== id))
    const { error } = await supabase.from('shopping_lists').delete().eq('id', id)
    if (error) await load()
    return error
  }

  async function moveList(id: string, direction: -1 | 1) {
    const idx = lists.findIndex(l => l.id === id)
    const target = idx + direction
    if (idx < 0 || target < 0 || target >= lists.length) return
    const reordered = [...lists]
    ;[reordered[idx], reordered[target]] = [reordered[target], reordered[idx]]
    const withPos = reordered.map((l, i) => ({ ...l, position: i }))
    setLists(withPos)
    await Promise.all(withPos.map(l => supabase.from('shopping_lists').update({ position: l.position }).eq('id', l.id)))
  }

  return { lists, loading, createList, renameList, deleteList, moveList, reload: load }
}

export function useShoppingItems(listId: string | null) {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [frequent, setFrequent] = useState<Frequent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const listRef = useRef(listId)
  listRef.current = listId

  const load = useCallback(async () => {
    if (!listId) { setItems([]); setLoading(false); return }
    const [itemsRes, freqRes] = await Promise.all([
      supabase.from('shopping_items')
        .select('id, list_id, name, quantity, category, checked, checked_at, archived, added_by, created_at')
        .eq('list_id', listId).eq('archived', false).order('created_at'),
      supabase.from('shopping_frequent').select('list_id, key, name, category, times')
        .eq('list_id', listId).order('times', { ascending: false }).limit(12)
    ])
    if (listRef.current !== listId) return
    if (itemsRes.error) setError(itemsRes.error.message)
    setItems((itemsRes.data ?? []) as ShoppingItem[])
    setFrequent((freqRes.data ?? []) as Frequent[])
    setLoading(false)
  }, [listId])

  useEffect(() => {
    setLoading(true)
    load()
    if (!listId) return
    const channel = supabase
      .channel(`shopping_items:${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${listId}` }, () => load())
      .subscribe()
    // Al volver a la app (móvil en segundo plano) refresca por si se perdió algún evento
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [listId, load])

  async function addItem(raw: string, listName?: string) {
    if (!listId || !raw.trim()) return
    const { name, quantity } = parseEntry(raw)
    const category = guessCategory(name, listName)
    const temp: ShoppingItem = {
      id: `tmp-${crypto.randomUUID()}`, list_id: listId, name, quantity, category,
      checked: false, checked_at: null, archived: false, added_by: null, created_at: new Date().toISOString()
    }
    setItems(prev => [...prev, temp])
    const { error } = await supabase.from('shopping_items').insert({ list_id: listId, name, quantity, category })
    if (error) { setError(error.message); setItems(prev => prev.filter(i => i.id !== temp.id)) }
    await load()
  }

  async function toggle(item: ShoppingItem) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked, checked_at: !i.checked ? new Date().toISOString() : null } : i))
    const { error } = await supabase.from('shopping_items').update({ checked: !item.checked }).eq('id', item.id)
    if (error) { setError(error.message); await load() }
  }

  async function updateItem(item: ShoppingItem, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'category'>>) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...changes } : i))
    const { error } = await supabase.from('shopping_items').update(changes).eq('id', item.id)
    if (error) { setError(error.message); await load() }
  }

  async function remove(item: ShoppingItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    const { error } = await supabase.from('shopping_items').delete().eq('id', item.id)
    if (error) { setError(error.message); await load() }
  }

  // "Vaciar comprados": se archivan para alimentar la lista de frecuentes
  async function clearChecked() {
    if (!listId) return
    setItems(prev => prev.filter(i => !i.checked))
    const { error } = await supabase.from('shopping_items').update({ archived: true }).eq('list_id', listId).eq('checked', true).eq('archived', false)
    if (error) setError(error.message)
    await load()
  }

  return { items, frequent, loading, error, addItem, toggle, updateItem, remove, clearChecked, clearError: () => setError('') }
}

export async function countPending(): Promise<{ listName: string; count: number } | null> {
  const { data: lists } = await supabase.from('shopping_lists').select('id, name').order('position').limit(1)
  const first = lists?.[0]
  if (!first) return null
  const { count } = await supabase.from('shopping_items').select('id', { count: 'exact', head: true })
    .eq('list_id', first.id).eq('archived', false).eq('checked', false)
  return { listName: first.name, count: count ?? 0 }
}
