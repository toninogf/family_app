import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useHousehold } from './household'

/** «casa» es la pestaña de Tareas (se mantiene la clave para no perder lo que cada uno tenía guardado) */
export type TabKey = 'compra' | 'casa' | 'mudanza' | 'agenda' | 'dinero' | 'gym'
export type SectionKey = 'saldo' | 'agenda' | 'comedor' | 'tareas' | 'mudanza' | 'gym' | 'compra'

export const ALL_TABS: TabKey[] = ['compra', 'casa', 'mudanza', 'agenda', 'dinero', 'gym']
export const ALL_SECTIONS: SectionKey[] = ['saldo', 'agenda', 'comedor', 'tareas', 'mudanza', 'gym', 'compra']
export const TAB_LABEL: Record<TabKey, string> = { compra: 'Compra', casa: 'Tareas', mudanza: 'Mudanza', agenda: 'Agenda', dinero: 'Dinero', gym: 'Gimnasio' }
export const SECTION_LABEL: Record<SectionKey, string> = {
  saldo: 'Saldos y gasto del mes', agenda: 'Agenda de hoy', comedor: 'Comedor de hoy', tareas: 'Tareas',
  mudanza: 'Mudanza', gym: 'Entreno de hoy', compra: 'Compra'
}

export type Prefs = {
  tabs: TabKey[]
  home_sections: SectionKey[]
  gym_share: boolean
  gym_days: number[]
  gym_start: string | null
  gym_end: string | null
}
const DEFAULTS: Prefs = { tabs: [...ALL_TABS], home_sections: [...ALL_SECTIONS], gym_share: false, gym_days: [], gym_start: null, gym_end: null }

type Ctx = { prefs: Prefs; loaded: boolean; save: (patch: Partial<Prefs>) => Promise<string | undefined> }
const PrefsContext = createContext<Ctx>({ prefs: DEFAULTS, loaded: false, save: async () => undefined })

/** Preferencias personales (pestañas, orden de Hoy, gimnasio). Solo las ve y cambia su dueño. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const { me } = useHousehold()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!me) return
    const { data } = await supabase.from('member_preferences')
      .select('tabs, home_sections, gym_share, gym_days, gym_start, gym_end').eq('member_id', me.id).maybeSingle()
    setPrefs(data ? { ...DEFAULTS, ...(data as Partial<Prefs>) } : DEFAULTS)
    setLoaded(true)
  }, [me])

  useEffect(() => { load() }, [load])

  async function save(patch: Partial<Prefs>) {
    if (!me) return 'Sin usuario'
    const next = { ...prefs, ...patch }
    setPrefs(next)
    const { error } = await supabase.from('member_preferences')
      .upsert({ member_id: me.id, household_id: me.household_id, ...next }, { onConflict: 'member_id' })
    if (error) { await load(); return error.message }
  }

  return <PrefsContext.Provider value={{ prefs, loaded, save }}>{children}</PrefsContext.Provider>
}

export const usePrefs = () => useContext(PrefsContext)

/** Mueve un elemento una posición arriba (-1) o abajo (+1) */
export function moveIn<T>(list: T[], item: T, dir: -1 | 1): T[] {
  const i = list.indexOf(item)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = list.slice()
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
