import { useEffect, useState, type FormEvent } from 'react'
import type { Factor } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Card } from './ui'

/** Autenticadores de la cuenta: permite añadir uno de respaldo (otro móvil, 1Password…) y quitar los que sobren */
export default function AuthenticatorsCard() {
  const [factors, setFactors] = useState<Factor[]>([])
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []).filter(f => f.status === 'verified'))
  }
  useEffect(() => { load() }, [])

  async function start() {
    setError(''); setBusy(true)
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: `Respaldo ${new Date().toLocaleDateString('es-ES')} ${Math.random().toString(36).slice(2, 6)}`
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!enrolling) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.trim() })
    setBusy(false)
    if (error) { setError('Código incorrecto. Prueba con el que aparece ahora.'); return }
    setEnrolling(null); setCode('')
    await load()
  }

  async function cancel() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.id })
    setEnrolling(null); setCode(''); setError('')
  }

  async function remove(id: string) {
    setConfirmId(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    if (error) setError(error.message)
    await load()
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-bold text-[15px]">Autenticadores</h2>
        <p className="text-sm text-muted">Añade uno de respaldo (en otro móvil, una tablet o tu gestor de contraseñas) por si pierdes el teléfono.</p>
      </div>

      <ul className="flex flex-col">
        {factors.map((f, i) => (
          <li key={f.id} className={`flex items-center justify-between gap-2 min-h-12 ${i < factors.length - 1 ? 'border-b border-line' : ''}`}>
            <span className="flex flex-col">
              <span className="text-[15px]">{f.friendly_name || 'Autenticador'}</span>
              <span className="text-xs text-muted">Añadido el {new Date(f.created_at).toLocaleDateString('es-ES')}</span>
            </span>
            {factors.length > 1 && (confirmId === f.id ? (
              <span className="flex gap-1">
                <button onClick={() => setConfirmId(null)} className="min-h-10 px-2 text-sm text-muted">No</button>
                <button onClick={() => remove(f.id)} className="min-h-10 px-3 rounded-lg bg-danger text-white dark:text-bg text-sm font-semibold">Quitar</button>
              </span>
            ) : (
              <button onClick={() => setConfirmId(f.id)} className="min-h-10 px-2 text-sm text-danger">Quitar</button>
            ))}
          </li>
        ))}
      </ul>
      {factors.length === 1 && !enrolling && (
        <p className="text-xs text-muted">Solo tienes uno. Si pierdes ese móvil, el otro adulto puede restablecer tu verificación desde «Familia».</p>
      )}

      {enrolling ? (
        <form onSubmit={verify} className="flex flex-col gap-3 bg-bg rounded-xl p-3">
          <p className="text-sm">Escanea este código con la otra app autenticadora:</p>
          <div className="bg-white rounded-xl p-3 self-center"><img src={enrolling.qr} alt="Código QR del autenticador de respaldo" width={180} height={180} /></div>
          <p className="text-xs text-muted break-all">Clave manual: <span className="font-mono text-ink">{enrolling.secret}</span></p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Código que muestra la nueva app</span>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value)}
              className="min-h-12 px-4 rounded-xl border border-line bg-card text-[16px]" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancel} className="min-h-11 px-3 text-sm text-muted">Cancelar</button>
            <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg bg-accent text-white dark:text-bg text-sm font-semibold">Verificar</button>
          </div>
        </form>
      ) : (
        <button onClick={start} disabled={busy} className="min-h-11 rounded-xl border border-line bg-card text-accent text-sm font-semibold">
          Añadir autenticador de respaldo
        </button>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  )
}
