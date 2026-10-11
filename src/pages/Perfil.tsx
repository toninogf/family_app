import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { Button, Card, ErrorText, Field } from '../components/ui'

export default function Perfil() {
  const { me } = useHousehold()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setMsg(''); setError('')
    if (password.length < 12) { setError('Al menos 12 caracteres.'); return }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else { setMsg('Contraseña actualizada.'); setPassword('') }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-bold tracking-tight">Perfil</h1>
      <Card className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: me?.color }}>{me?.display_name.charAt(0)}</span>
        <span className="font-semibold">{me?.display_name}</span>
      </Card>
      <Card>
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          <Field label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          {msg && <p className="text-sm text-accent">{msg}</p>}
          <Button type="submit">Cambiar contraseña</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
      <Button variant="ghost" onClick={() => supabase.auth.signOut({ scope: 'global' })}>Cerrar sesión en todos los dispositivos</Button>
    </div>
  )
}
