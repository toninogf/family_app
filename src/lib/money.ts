import { useCallback, useEffect, useState } from 'react'
import { supabase, type Member } from './supabase'

export type Category = { id: string; name: string; monthly_budget_cents: number; position: number; archived: boolean }
export type Expense = {
  id: string
  amount_cents: number
  description: string
  category_id: string | null
  spent_on: string
  payer_id: string | null
  beneficiary_id: string | null
  child_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}
export type Settlement = { id: string; from_id: string | null; to_id: string | null; amount_cents: number; settled_on: string; note: string | null; created_by: string | null }
export type BalanceRow = { party_a: string; party_b: string; owed_cents: number }
export type ExpenseInput = Omit<Expense, 'id' | 'created_by' | 'created_at'>

/** Una deuda pendiente entre dos partes. null = cuenta común. */
export type Debt = { debtor: string | null; creditor: string | null; cents: number }

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
export const formatEur = (cents: number) => eur.format(cents / 100)

/** "12,50" · "12.5" · "1.234,56" → céntimos. null si no es válido. */
export function parseEur(raw: string): number | null {
  let s = raw.trim().replace(/\s|€/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return cents > 0 ? cents : null
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function partyName(id: string | null, members: Member[], style: 'subject' | 'short' = 'short') {
  if (id === null) return style === 'subject' ? 'La cuenta común' : 'Cuenta común'
  return members.find(m => m.id === id)?.display_name ?? '¿?'
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  const s = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Qué deuda genera un gasto (para explicarlo al guardarlo). */
export function debtOf(payer: string | null, beneficiary: string | null, cents: number): Debt | null {
  if (payer === beneficiary) return null
  return { debtor: beneficiary, creditor: payer, cents }
}

function debtsFromRows(rows: BalanceRow[]): Debt[] {
  return rows
    .filter(r => r.owed_cents !== 0)
    .map(r => {
      const a = r.party_a === 'common' ? null : r.party_a
      const b = r.party_b === 'common' ? null : r.party_b
      return r.owed_cents > 0
        ? { debtor: b, creditor: a, cents: Number(r.owed_cents) }
        : { debtor: a, creditor: b, cents: -Number(r.owed_cents) }
    })
    .sort((x, y) => y.cents - x.cents)
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('expense_categories').select('id, name, monthly_budget_cents, position, archived').order('position')
    setCategories((data ?? []) as Category[])
  }, [])
  useEffect(() => { load() }, [load])

  async function setBudget(id: string, cents: number) {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, monthly_budget_cents: cents } : c))
    const { error } = await supabase.from('expense_categories').update({ monthly_budget_cents: cents }).eq('id', id)
    if (error) await load()
    return error
  }

  return { categories, setBudget, reload: load }
}

export function useBalances() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      supabase.from('money_balances').select('party_a, party_b, owed_cents'),
      supabase.from('settlements').select('id, from_id, to_id, amount_cents, settled_on, note, created_by').order('settled_on', { ascending: false }).order('created_at', { ascending: false }).limit(15)
    ])
    setDebts(debtsFromRows((b.data ?? []) as BalanceRow[]))
    setSettlements((s.data ?? []) as Settlement[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase.channel('money_balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function settle(householdId: string, debt: Debt, cents: number, note?: string) {
    const { error } = await supabase.from('settlements').insert({
      household_id: householdId, from_id: debt.debtor, to_id: debt.creditor, amount_cents: cents, settled_on: todayISO(), note: note || null
    })
    await load()
    return error
  }

  async function undoSettlement(id: string) {
    const { error } = await supabase.from('settlements').delete().eq('id', id)
    await load()
    return error
  }

  return { debts, settlements, loading, settle, undoSettlement, reload: load }
}

export function useExpenses(month: string) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { from, to } = monthRange(month)
    const { data, error } = await supabase.from('expenses')
      .select('id, amount_cents, description, category_id, spent_on, payer_id, beneficiary_id, child_id, note, created_by, created_at')
      .gte('spent_on', from).lte('spent_on', to)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false })
    if (error) setError(error.message)
    setExpenses((data ?? []) as Expense[])
    setLoading(false)
  }, [month])

  useEffect(() => {
    setLoading(true)
    load()
    const channel = supabase.channel(`expenses:${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => load())
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [month, load])

  async function save(householdId: string, input: ExpenseInput, id?: string) {
    const row = { ...input, household_id: householdId }
    const { error } = id
      ? await supabase.from('expenses').update(input).eq('id', id)
      : await supabase.from('expenses').insert(row)
    if (error) setError(error.message)
    await load()
    return error
  }

  async function remove(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { setError(error.message); await load() }
    return error
  }

  return { expenses, loading, error, save, remove, clearError: () => setError('') }
}

/** Resumen ligero para la pantalla Hoy */
export async function moneySummary(month: string) {
  const { from, to } = monthRange(month)
  const [b, e, c] = await Promise.all([
    supabase.from('money_balances').select('party_a, party_b, owed_cents'),
    supabase.from('expenses').select('amount_cents').is('beneficiary_id', null).gte('spent_on', from).lte('spent_on', to),
    supabase.from('expense_categories').select('monthly_budget_cents').eq('archived', false)
  ])
  return {
    debts: debtsFromRows((b.data ?? []) as BalanceRow[]),
    spentCents: (e.data ?? []).reduce((s, x) => s + (x as { amount_cents: number }).amount_cents, 0),
    budgetCents: (c.data ?? []).reduce((s, x) => s + (x as { monthly_budget_cents: number }).monthly_budget_cents, 0)
  }
}
