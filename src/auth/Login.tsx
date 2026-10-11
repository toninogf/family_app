import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Centered, ErrorText, Field } from '../components/ui'

type Mode = 'login' | 'signup' | 'reset'

function friendlyError(message: string): string {
  if (/database error/i.test(message)) return 'Este email no está autorizado en la app.'
  if (/invalid login/i.test(message)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(message)) return 'Confirma tu email con el enlace que te hemos enviado.'
  if (/password/i.test(message)) return 'La contraseña debe tener al menos 12 caracteres.'
  return message
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(friendlyError(error.message))
      } else if (mode === 'signup') {
        if (password.length < 12) { setError('La contraseña debe tener al menos 12 caracteres.'); return }
        const { error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin }
        })
        if (error) setError(friendlyError(error.message))
        else setInfo('Cuenta creada. Revisa tu email para confirmarla y después entra.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) setError(friendlyError(error.message))
        else setInfo('Si el email está autorizado, recibirás un enlace para cambiar la contraseña.')
      }
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Recuperar contraseña'

  return (
    <Centered>
      <div className="flex flex-col gap-2">
        <div className="w-14 h-14 rounded-2xl bg-accent text-white dark:text-bg flex items-center justify-center text-2xl font-bold" aria-hidden="true">F</div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        <p className="text-muted text-[15px]">App privada de la familia. Solo para cuentas autorizadas.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== 'reset' && (
          <Field
            label="Contraseña"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'signup' ? 12 : undefined}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        )}
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-sm text-accent">{info}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Un momento…' : title}</Button>
      </form>
      <div className="flex flex-col gap-2 text-[15px]">
        {mode !== 'login' && <button className="text-accent font-semibold min-h-11 text-left" onClick={() => setMode('login')}>Ya tengo cuenta: entrar</button>}
        {mode !== 'signup' && <button className="text-accent font-semibold min-h-11 text-left" onClick={() => setMode('signup')}>Primera vez: crear cuenta</button>}
        {mode !== 'reset' && <button className="text-muted min-h-11 text-left" onClick={() => setMode('reset')}>He olvidado la contraseña</button>}
      </div>
    </Centered>
  )
}
