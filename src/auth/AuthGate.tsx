import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import Login from './Login'
import { MfaSetup, MfaVerify } from './Mfa'
import { Centered } from '../components/ui'

type Stage = 'loading' | 'signedOut' | 'enroll' | 'verify' | 'ready'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [stage, setStage] = useState<Stage>('loading')

  const evaluate = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) { setStage('signedOut'); return }
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) { setStage('signedOut'); return }
    if (data.currentLevel === 'aal2') setStage('ready')
    else if (data.nextLevel === 'aal2') setStage('verify')
    else setStage('enroll')
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => evaluate(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Diferido para no bloquear el callback de Supabase
      setTimeout(() => evaluate(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [evaluate])

  const refresh = async () => {
    const { data } = await supabase.auth.getSession()
    await evaluate(data.session)
  }

  if (stage === 'loading') return <Centered><p className="text-muted text-center">Cargando…</p></Centered>
  if (stage === 'signedOut' || !session) return <Login />
  if (stage === 'enroll') return <MfaSetup onDone={refresh} />
  if (stage === 'verify') return <MfaVerify onDone={refresh} />
  return <>{children}</>
}
