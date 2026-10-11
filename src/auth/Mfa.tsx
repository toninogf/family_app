import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Centered, ErrorText, Field } from '../components/ui'

export function MfaSetup({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Limpia altas a medias de intentos anteriores
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: `Family App ${new Date().toISOString().slice(0, 10)}`
      })
      if (cancelled) return
      if (error) { setError(error.message); return }
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret)
    })()
    return () => { cancelled = true }
  }, [])

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    setBusy(false)
    if (error) setError('Código incorrecto. Prueba con el que aparece ahora en la app.')
    else onDone()
  }

  return (
    <Centered>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight">Activa la verificación en dos pasos</h1>
        <p className="text-muted text-[15px]">Escanea el código con Google Authenticator, Microsoft Authenticator o 1Password. Es obligatorio para proteger los datos de la familia.</p>
      </div>
      {qr ? (
        <div className="bg-white rounded-2xl p-4 self-center">
          <img src={qr} alt="Código QR para la app autenticadora" width={200} height={200} />
        </div>
      ) : !error && <p className="text-muted">Generando código…</p>}
      {secret && (
        <p className="text-sm text-muted break-all">¿No puedes escanear? Introduce esta clave: <span className="font-mono text-ink">{secret}</span></p>
      )}
      <form onSubmit={verify} className="flex flex-col gap-4">
        <Field label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !factorId}>Verificar y continuar</Button>
      </form>
      <button className="text-muted min-h-11" onClick={() => supabase.auth.signOut()}>Salir</button>
    </Centered>
  )
}

export function MfaVerify({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.[0]
    if (!factor) { setBusy(false); setError('No hay autenticador configurado.'); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    setBusy(false)
    if (error) setError('Código incorrecto o caducado.')
    else onDone()
  }

  return (
    <Centered>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight">Código de verificación</h1>
        <p className="text-muted text-[15px]">Introduce el código de tu app autenticadora.</p>
      </div>
      <form onSubmit={verify} className="flex flex-col gap-4">
        <Field label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus value={code} onChange={e => setCode(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>Entrar</Button>
      </form>
      <button className="text-muted min-h-11" onClick={() => supabase.auth.signOut()}>Salir</button>
    </Centered>
  )
}
