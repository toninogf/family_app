import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Categorías con icono y color (actividades y tareas) */
export type IconCategory = { id: string; name: string; icon: string; color: string; position: number; archived: boolean; key?: string | null }
export type CategoryTable = 'event_categories' | 'task_categories'

export function useIconCategories(table: CategoryTable) {
  const [categories, setCategories] = useState<IconCategory[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const cols = table === 'event_categories' ? 'id, name, icon, color, position, archived, key' : 'id, name, icon, color, position, archived'
    const { data, error } = await supabase.from(table).select(cols).order('position').order('name')
    if (error) setError(error.message)
    setCategories((data ?? []) as unknown as IconCategory[])
  }, [table])

  useEffect(() => {
    load()
    const channel = supabase.channel(`${table}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load, table])

  async function create(name: string, icon: string, color: string) {
    const position = Math.max(0, ...categories.map(c => c.position)) + 1
    const { error } = await supabase.from(table).insert({ name: name.trim(), icon: icon || '📌', color, position })
    if (error) setError(error.message)
    await load()
  }

  async function update(id: string, patch: Partial<Pick<IconCategory, 'name' | 'icon' | 'color' | 'archived' | 'position'>>) {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  return { categories, active: categories.filter(c => !c.archived), error, clearError: () => setError(''), create, update, byId: (id: string | null | undefined) => categories.find(c => c.id === id) }
}
export type IconCategories = ReturnType<typeof useIconCategories>

export const CATEGORY_COLORS = ['#2E8B57', '#7A4FB3', '#2F5FC4', '#C77A12', '#B3261E', '#C2417A', '#0E8A8A', '#8A6A2F', '#5B6662', '#4CAF6E']
