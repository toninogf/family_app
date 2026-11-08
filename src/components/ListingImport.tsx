import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { aiPrompt, parseAny, type ListingData } from '../lib/listingParse'
import { readImages } from '../lib/ocr'
import { portalName } from '../lib/mudanza'
import { TextArea, TextField } from './Sheet'

/**
 * «Rellenar desde el anuncio»: enlace (leer o pedírselo a una IA), pegar la respuesta o el texto del anuncio,
 * y capturas que se leen en el móvil. Llama a onApply con lo encontrado; las capturas las guarda quien lo usa.
 */
export default function ListingImport({ url, onUrl, onApply, shots, onShots, adPhotos, onAdPhotos, known }: {
  url: string; onUrl: (v: string) => void
  onApply: (d: ListingData) => { filled: string[]; diffs: ImportDiff[] }
  shots: File[]; onShots: (f: File[]) => void
  adPhotos: File[]; onAdPhotos: (f: File[]) => void
  /** Lo que ya está apuntado: la IA lo compara con el anuncio */
  known?: Record<string, string>
}) {
  const [photoLinks, setPhotoLinks] = useState<string[]>([])
  const [diffs, setDiffs] = useState<ImportDiff[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [changes, setChanges] = useState<string | undefined>()
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const full = url.trim() && (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)

  function fromText(text: string, intro = 'Rellenado') {
    const d = parseAny(text)
    const r = onApply(d)
    setDiffs(r.diffs)
    if (d.sources?.length) setSources(d.sources)
    if (d.changes) setChanges(d.changes)
    if (d.photo_urls?.length) setPhotoLinks(l => [...new Set([...l, ...d.photo_urls!])].slice(0, 20))
    setNote(importMessage(intro, r.filled, r.diffs.length))
  }

  async function read() {
    if (!full) return
    setBusy('Leyendo el anuncio…'); setNote(null)
    const { data, error } = await supabase.functions.invoke('listing-preview', { body: { url: full } })
    setBusy(null)
    const res = data as { blocked?: boolean; error?: string; title?: string; description?: string; text?: string } | null
    if (error || !res || res.blocked || res.error) {
      setNote({ ok: false, text: res?.error && !res.blocked ? res.error : 'El portal no deja leer el anuncio desde la app. Pídeselo a una IA con los botones de abajo, o sube capturas.' })
      return
    }
    fromText([res.title, res.description, res.text].filter(Boolean).join('\n'), 'Leído del anuncio')
  }

  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude') {
    if (!full) return
    const prompt = aiPrompt(full.replace(/\?.*$/, ''), known)
    try { await navigator.clipboard.writeText(prompt) } catch { /* sin permiso: se abre igualmente */ }
    const q = encodeURIComponent(prompt)
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setNote({ ok: true, text: ai === 'gemini'
      ? 'Petición copiada: pégala en Gemini. Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».'
      : 'Si no aparece escrita, pégala (está copiada). Cuando conteste, copia la respuesta y vuelve aquí a «Pegar respuesta de la IA».' })
    window.open(target, '_blank', 'noopener')
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('vacío')
      setPasted(text)
      fromText(text, 'Rellenado con la respuesta')
    } catch {
      setPasteOpen(true)
      setNote({ ok: false, text: 'No he podido leer lo copiado. Mantén pulsado el cuadro de abajo y elige «Pegar».' })
    }
  }

  async function addShots(list: File[]) {
    const imgs = list.filter(f => f.type.startsWith('image/')).slice(0, 10 - shots.length)
    if (!imgs.length) return
    onShots([...shots, ...imgs])
    try {
      setBusy('Preparando el lector de texto…')
      const text = await readImages(imgs, p => setBusy(`Leyendo captura ${p.image} de ${p.total}… ${p.pct}%`))
      setBusy(null)
      fromText(text, 'Leído de las capturas')
    } catch {
      setBusy(null)
      setNote({ ok: false, text: 'No se han podido leer las capturas. Se guardarán igualmente; puedes rellenar a mano o pegar el texto.' })
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
      <p className="text-sm font-bold">📥 Rellenar desde el anuncio</p>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <TextField label="Enlace del anuncio" type="url" inputMode="url" value={url} onChange={e => onUrl(e.target.value)} placeholder="https://www.idealista.com/inmueble/…" />
        </div>
        <button type="button" onClick={read} disabled={!full || !!busy}
          className="min-h-12 px-3 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold shrink-0 disabled:opacity-40">Leer</button>
      </div>
      {full && (portalName(full)
        ? <a href={full} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold">✓ Anuncio de {portalName(full)} · abrir ↗</a>
        : <span className="text-xs text-danger">Ese enlace no parece válido</span>)}
      {full && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Que una IA lea el anuncio y te dé los datos:</span>
          <div className="grid grid-cols-3 gap-2">
            {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => askAi(k)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">{l} ↗</button>
            ))}
          </div>
          <button type="button" onClick={pasteClipboard} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar respuesta de la IA</button>
        </div>
      )}
      <label className={`min-h-11 rounded-xl border border-dashed border-line flex items-center justify-center gap-2 text-sm font-semibold text-accent cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        📸 {shots.length ? `Añadir más capturas (${shots.length})` : 'Subir capturas del anuncio'}
        <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { void addShots(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </label>
      {shots.length > 0 && !busy && <p className="text-xs text-muted">Las capturas se guardan al pulsar «Guardar», como copia del anuncio.</p>}
      {pasteOpen ? (
        <div className="flex flex-col gap-2">
          <TextArea label="Texto del anuncio o respuesta de la IA" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={20000}
            placeholder="Pega aquí el texto del anuncio o la respuesta de la IA…" />
          <button type="button" onClick={() => fromText(pasted)} disabled={!pasted.trim()}
            className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Rellenar con este texto</button>
        </div>
      ) : (
        <button type="button" onClick={() => setPasteOpen(true)} className="self-start min-h-10 text-sm text-accent font-semibold">📋 Pegar el texto del anuncio</button>
      )}
      <AdPhotoFetch urls={photoLinks} photos={adPhotos} onPhotos={onAdPhotos} />
      {busy && <p role="status" className="text-xs text-muted">{busy}</p>}
      {note && <p role="status" className={`text-xs ${note.ok ? 'text-accent' : 'text-danger'}`}>{note.text}</p>}
      <ImportDiffs diffs={diffs} onChange={setDiffs} />
      <AiChanges text={changes} />
      <AiSources urls={sources} />
    </div>
  )
}

/** Tipo real de la imagen por sus primeros bytes (la función la manda como binario genérico) */
async function sniff(b: Blob): Promise<string | null> {
  const h = new Uint8Array(await b.slice(0, 12).arrayBuffer())
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg'
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image/png'
  if (String.fromCharCode(...h.slice(0, 4)) === 'RIFF' && String.fromCharCode(...h.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (String.fromCharCode(...h.slice(4, 12)).startsWith('ftypavi')) return 'image/avif'
  return null
}

/**
 * Fotos del anuncio a partir de los enlaces que haya dado la IA: se descargan a través de la app (función
 * «listing-photos», solo portales conocidos) y quedan listas para guardarse como fotos al pulsar «Guardar».
 */
export function AdPhotoFetch({ urls, photos, onPhotos }: { urls: string[]; photos: File[]; onPhotos: (f: File[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview] = useState(() => new Map<File, string>())
  if (!urls.length && !photos.length) return null

  async function fetchAll() {
    setNote(null)
    const got: File[] = []
    let failed = 0
    for (const [i, u] of urls.entries()) {
      setBusy(`Trayendo foto ${i + 1} de ${urls.length}…`)
      try {
        const { data, error } = await supabase.functions.invoke('listing-photos', { body: { url: u } })
        if (error || !(data instanceof Blob) || data.size < 2000) { failed++; continue }
        const type = await sniff(data)
        if (!type) { failed++; continue }
        got.push(new File([data], `anuncio-${i + 1}.${type.split('/')[1]}`, { type }))
      } catch { failed++ }
    }
    setBusy(null)
    onPhotos([...photos, ...got].slice(0, 20))
    setNote(got.length
      ? { ok: true, text: `${got.length} foto${got.length > 1 ? 's' : ''} lista${got.length > 1 ? 's' : ''}${failed ? ` (${failed} no se ha${failed > 1 ? 'n' : ''} podido traer)` : ''}. Se guardan al pulsar «Guardar».` }
      : { ok: false, text: 'El portal no deja descargar esas fotos desde fuera, o la IA ha dado enlaces que no existen. Usa capturas de pantalla o guarda las fotos del anuncio en el móvil y súbelas.' })
  }

  const url = (f: File) => { if (!preview.has(f)) preview.set(f, URL.createObjectURL(f)); return preview.get(f)! }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-bg p-2">
      {urls.length > 0 && (
        <button type="button" onClick={fetchAll} disabled={!!busy}
          className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-50">
          {busy ?? `🖼️ Traer ${urls.length} foto${urls.length > 1 ? 's' : ''} del anuncio`}
        </button>
      )}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((f, i) => (
            <div key={i} className="relative aspect-square">
              <img src={url(f)} alt="" className="w-full h-full object-cover rounded-lg" />
              <button type="button" onClick={() => onPhotos(photos.filter(x => x !== f))} aria-label="Quitar foto"
                className="absolute top-0.5 right-0.5 w-7 h-7 rounded-full bg-ink/70 text-bg text-sm">×</button>
            </div>
          ))}
        </div>
      )}
      {note && <p role="status" className={`text-xs ${note.ok ? 'text-accent' : 'text-danger'}`}>{note.text}</p>}
      {!note && urls.length > 0 && <p className="text-xs text-muted">La IA ha dado enlaces de fotos: pruébalos. Si el portal no las deja descargar, se usan capturas.</p>}
    </div>
  )
}

/** Un dato del anuncio que no coincide con lo que ya teníais: se ofrece, no se machaca */
export type ImportDiff = { label: string; now: string; next: string; use: () => void }

/**
 * Prepara la fusión con la ficha: rellena lo vacío y apunta como diferencia lo que ya tenía otro valor.
 * Uso: const f = merger(); f.put('precio', amount, nuevo, setAmount); … luego f.filled y f.diffs
 */
export function merger() {
  const filled: string[] = []
  const diffs: ImportDiff[] = []
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')
  function put(label: string, now: string | null | undefined, next: string | null | undefined, set: (v: string) => void, opts: { diff?: boolean } = {}) {
    if (next == null || !String(next).trim()) return
    const cur = now ?? ''
    if (!cur.trim()) { set(next); filled.push(label) }
    else if (opts.diff !== false && norm(cur) !== norm(next)) diffs.push({ label, now: cur, next, use: () => set(next) })
  }
  return { put, filled, diffs }
}

/** Mensaje tras leer el anuncio */
export function importMessage(intro: string, filled: string[], diffs: number) {
  if (!filled.length && !diffs) return { ok: false, text: 'No he encontrado datos nuevos en ese texto. Prueba a copiar el bloque de precio y características del anuncio.' }
  const a = filled.length ? `${intro}: ${filled.join(', ')}.` : 'Lo que ya teníais no se ha tocado.'
  const b = diffs ? ` ${diffs} dato${diffs > 1 ? 's' : ''} del anuncio no coincide${diffs > 1 ? 'n' : ''} con lo que teníais: míralos abajo.` : ''
  return { ok: true, text: `${a}${b} Revísalo antes de guardar.` }
}

/** Datos del anuncio distintos de los que ya había: se puede usar cada uno o todos */
export function ImportDiffs({ diffs, onChange }: { diffs: ImportDiff[]; onChange: (d: ImportDiff[]) => void }) {
  if (!diffs.length) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-2.5">
      <span className="text-xs font-semibold">El anuncio dice otra cosa (lo vuestro no se ha cambiado):</span>
      {diffs.map(d => (
        <div key={d.label} className="flex items-center gap-2 text-[13px]">
          <span className="flex-1 min-w-0">
            <b>{d.label}</b>: <span className="text-muted line-through">{d.now}</span> → {d.next}
          </span>
          <button type="button" onClick={() => { d.use(); onChange(diffs.filter(x => x !== d)) }} className="min-h-9 px-3 rounded-lg border border-line bg-card text-[13px] font-semibold shrink-0">Usar</button>
        </div>
      ))}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => onChange([])} className="min-h-9 px-3 text-[13px] text-muted">Dejar lo nuestro</button>
        {diffs.length > 1 && <button type="button" onClick={() => { diffs.forEach(d => d.use()); onChange([]) }} className="min-h-9 px-3 rounded-lg bg-accent text-white dark:text-bg text-[13px] font-semibold">Usar todos</button>}
      </div>
    </div>
  )
}

/** Otras webs que la IA dice haber usado: se enseñan para poder comprobar que es la misma vivienda */
export function AiSources({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg p-2.5">
      <span className="text-xs font-semibold">🔎 La IA ha completado con otras webs:</span>
      <span className="flex gap-1.5 flex-wrap">
        {urls.map(u => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="min-h-8 px-2.5 rounded-full bg-card border border-line text-[12px] font-semibold text-accent flex items-center">{host(u)} ↗</a>
        ))}
      </span>
      <span className="text-[11px] text-muted">Échales un vistazo para confirmar que es la misma casa (fotos, metros, dirección) antes de guardar.</span>
    </div>
  )
}

/** Lo que la IA dice que ha cambiado respecto a lo que teníais (bajadas de precio, datos nuevos…) */
export function AiChanges({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg p-2.5">
      <span className="text-xs font-semibold">🔁 Lo que dice la IA al compararlo con lo vuestro:</span>
      <span className="text-[13px] whitespace-pre-line">{text}</span>
    </div>
  )
}

/** Datos ya apuntados que se le pasan a la IA para que los compruebe (nunca notas privadas ni contactos) */
export function knownForAi(x: Record<string, string | number | null | undefined | false>) {
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && v !== false && String(v).trim()).map(([k, v]) => [k, String(v)]))
}
