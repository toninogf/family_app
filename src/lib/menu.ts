import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type FirstType = 'verdura' | 'legumbre' | 'pasta_arroz'
export type SecondType = 'carne' | 'pescado' | 'huevo' | 'legumbre'
export type DessertType = 'fruta' | 'lacteo'

export type MenuDay = {
  day: string
  holiday: boolean
  first_course: string | null
  second_course: string | null
  side: string | null
  bread: string | null
  dessert: string | null
  first_type: FirstType | null
  second_type: SecondType | null
  dessert_type: DessertType | null
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  note: string | null
  source_url: string | null
}

const LABEL: Record<string, string> = {
  verdura: 'verdura', legumbre: 'legumbre', pasta_arroz: 'pasta o arroz',
  carne: 'carne', pescado: 'pescado', huevo: 'huevo', fruta: 'fruta', lacteo: 'lácteo'
}

// Recomendador de cenas del colegio (según lo que comieron a mediodía)
const DINNER_FIRST: Record<FirstType, string[]> = {
  verdura: ['pasta_arroz'],
  pasta_arroz: ['verdura'],
  legumbre: ['verdura', 'pasta_arroz']
}
const DINNER_SECOND: Record<SecondType, string[]> = {
  huevo: ['carne', 'pescado'],
  pescado: ['huevo', 'carne'],
  legumbre: ['verdura', 'huevo'],
  carne: ['huevo', 'pescado']
}

const orList = (xs: string[]) => xs.map(x => LABEL[x]).join(' o ')

export type DinnerTip = { first: string | null; second: string | null; dessert: string }

export function dinnerFor(m: MenuDay | undefined): DinnerTip | null {
  if (!m || m.holiday || (!m.first_type && !m.second_type)) return null
  return {
    first: m.first_type ? orList(DINNER_FIRST[m.first_type]) : null,
    second: m.second_type ? orList(DINNER_SECOND[m.second_type]) : null,
    dessert: 'fruta o lácteo'
  }
}

export function useSchoolMenu(from: string, to: string) {
  const [days, setDays] = useState<MenuDay[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('school_menu')
      .select('day, holiday, first_course, second_course, side, bread, dessert, first_type, second_type, dessert_type, kcal, protein_g, fat_g, carbs_g, note, source_url')
      .gte('day', from).lte('day', to).order('day')
    setDays((data ?? []) as MenuDay[])
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return { days, loading, byDay: (d: string) => days.find(x => x.day === d) }
}

export function monthName(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 15))
}

const num = (n: number | null) => (n == null ? '–' : Math.round(Number(n)).toLocaleString('es-ES'))
export const nutrients = (m: MenuDay) =>
  m.kcal == null ? null : `${num(m.kcal)} kcal · proteínas ${num(m.protein_g)} g · grasas ${num(m.fat_g)} g · hidratos ${num(m.carbs_g)} g`
