import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type Member } from './supabase'

type HouseholdState = {
  loading: boolean
  error: string
  members: Member[]
  me: Member | null
  reload: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [me, setMe] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('members').select('id, household_id, kind, display_name, color, user_id').order('kind').order('display_name')
    ])
    if (error) setError(error.message)
    const list = (data ?? []) as Member[]
    setMembers(list)
    setMe(list.find(m => m.user_id === userData.user?.id) ?? null)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  return <HouseholdContext.Provider value={{ loading, error, members, me, reload }}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold fuera de HouseholdProvider')
  return ctx
}
