// Hipoteca elegida en Compramos (purchase.loan_cents) para las cuentas de Vendemos y los análisis con IA
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function usePurchaseLoan() {
  const [loan, setLoan] = useState<number | null>(null)
  useEffect(() => {
    let on = true
    void supabase.from('purchase').select('loan_cents').maybeSingle().then(({ data }) => { if (on) setLoan((data as { loan_cents: number | null } | null)?.loan_cents ?? null) })
    return () => { on = false }
  }, [])
  return loan
}
