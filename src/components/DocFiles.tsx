import { useState } from 'react'
import { saleDocUrl, type DocFile } from '../lib/mudanza'

/** Abre un archivo privado de un documento (enlace temporal) */
export async function openDocFile(f: DocFile) {
  const u = await saleDocUrl(f.path)
  if (u) window.open(u, '_blank', 'noopener')
}

/** Lista de archivos de un documento: ver, quitar y añadir varios a la vez (PDF o fotos) */
export default function DocFiles({ files, onAdd, onRemove }: {
  files: DocFile[]
  onAdd: (list: File[], onProgress: (i: number) => void) => Promise<string | undefined>
  onRemove: (f: DocFile) => Promise<unknown>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const full = files.length >= 20

  async function add(list: File[]) {
    if (!list.length) return
    setError('')
    setBusy(list.length > 1 ? `Subiendo 1 de ${list.length}…` : 'Subiendo…')
    const err = await onAdd(list, i => setBusy(list.length > 1 ? `Subiendo ${i} de ${list.length}…` : 'Subiendo…'))
    setBusy(null)
    if (err) setError(err)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted">Archivos{files.length ? ` (${files.length})` : ''}</span>
      {files.map(f => (
        <div key={f.path} className="flex items-center gap-2">
          <button type="button" onClick={() => openDocFile(f)}
            className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-card text-sm font-semibold text-left truncate">
            {/\.pdf$/i.test(f.path) ? '📄' : '🖼️'} {f.name}
          </button>
          {confirm === f.path ? (
            <button type="button" onClick={async () => { await onRemove(f); setConfirm(null) }} className="min-h-11 px-3 rounded-xl bg-danger text-white dark:text-bg text-sm font-semibold">Quitar</button>
          ) : (
            <button type="button" onClick={() => setConfirm(f.path)} aria-label={`Quitar ${f.name}`} className="w-11 min-h-11 text-muted text-xl">×</button>
          )}
        </div>
      ))}
      {!full && (
        <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center text-sm font-semibold text-accent cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {busy ?? (files.length ? '+ Añadir más (PDF o fotos)' : '⬆️ Subir PDF o fotos')}
          <input type="file" accept="application/pdf,image/*" multiple className="sr-only" onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">Puedes elegir varios a la vez. Se guardan en privado, solo para vosotros; hasta 15 MB cada uno y 20 por documento.</p>
    </div>
  )
}
