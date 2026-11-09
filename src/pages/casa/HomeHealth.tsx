import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { saleDocUrl, uploadDocFiles, type DocFile, type Home, type Mudanza } from '../../lib/mudanza'
import { NOTA_PROMPT, notaStatus, parseNota, pdfText } from '../../lib/notaSimple'
import {
  AI_CHECKS, MANUAL_CHECKS, STATUS_ICON, STATUS_LABEL, cadastreCheck, floodCheck, healthCounts, marketCheck, radonCheck,
  type Cadastre, type Health, type HealthItem, type HealthStatus
} from '../../lib/health'
import { Choice, Sheet, TextArea, TextField } from '../../components/Sheet'
import DocFiles from '../../components/DocFiles'

type Candidate = { rc: string; address: string; dis?: number }
type Unit = { rc: string; address: string; use: string | null; built_m2: number | null; year: number | null }
type CheckResult = { error?: string; candidates?: Candidate[]; units?: Unit[]; property?: Omit<Cadastre, 'at'> }

const tone = (s: HealthStatus) => (s === 'ok' ? 'text-accent' : s === 'bad' ? 'text-danger' : s === 'warn' ? 'text-[#C77A12]' : 'text-muted')

/** «Estado y riesgos» de un piso: semáforo con lo automático, lo de la IA y lo que hay que comprobar con papeles */
export default function HomeHealth({ h, m, householdId, embedded }: { h: Home; m: Mudanza; householdId: string; embedded?: boolean }) {
  // «embedded»: ya va dentro de un grupo plegable de la ficha, así que sin cabecera propia y siempre abierto
  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [edit, setEdit] = useState<{ key: string; title: string; hint: string; link?: { label: string; url: string } } | null>(null)
  const [catOpen, setCatOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const c = healthCounts(h)
  const health = (h.health ?? {}) as Health

  async function checkFlood() {
    if (h.lat == null || h.lng == null) { setError('Primero hay que situar el piso: pon la dirección o un enlace de Google Maps.'); return }
    setBusy('Consultando el mapa de zonas inundables…'); setError('')
    const { data, error: e } = await supabase.functions.invoke('property-check', { body: { mode: 'flood', lat: h.lat, lng: h.lng } })
    setBusy(null)
    const r = data as { t100?: number | null; t500?: number | null; error?: string } | null
    if (e || !r || r.error) { setError(r?.error ?? 'No se ha podido consultar el mapa de inundaciones. Prueba más tarde.'); return }
    await m.write('homes', { flood: { t100: r.t100 ?? null, t500: r.t500 ?? null, at: new Date().toISOString() } }, h.id)
  }

  /** Completa los huecos de la ficha con lo del Catastro (sin tocar lo que ya hay) */
  async function fillFromCadastre() {
    const cd = h.cadastre
    if (!cd) return
    const flat = /division horizontal/i.test(cd.kind ?? '')
    const patch: Record<string, unknown> = {}
    if (!h.plot_m2 && cd.plot_m2 && !flat) patch.plot_m2 = cd.plot_m2
    if (!h.year_built && cd.year) patch.year_built = cd.year
    if (!h.size_m2 && cd.built_m2) patch.size_m2 = cd.built_m2
    if (Object.keys(patch).length) await m.write('homes', patch, h.id)
  }

  const cad = cadastreCheck(h as never)
  const flood = floodCheck(h as never)
  const radon = radonCheck(h)
  const market = marketCheck(h, health)
  const cd = h.cadastre
  const flat = /division horizontal/i.test(cd?.kind ?? '')
  const canFill = !!cd && ((!h.plot_m2 && !!cd.plot_m2 && !flat) || (!h.year_built && !!cd.year) || (!h.size_m2 && !!cd.built_m2))

  return (
    <section className="flex flex-col gap-2">
      {!embedded && <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex justify-between items-center gap-2 text-left min-h-11">
        <span className="flex flex-col">
          <span className="font-bold text-[15px]">🩺 Estado y riesgos</span>
          <span className="text-[13px] text-muted">✅ {c.ok} · ⚠️ {c.warn}{c.bad ? ` · ⛔ ${c.bad}` : ''} · ❓ {c.unknown}</span>
        </span>
        <span className="text-muted text-lg" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>}
      {open && (
        <div className="flex flex-col gap-3">
          {/* Automático */}
          <div className="bg-card rounded-2xl p-3 flex flex-col gap-3">
            <Row icon={cad.s} title="Catastro" note={cd ? `${cd.rc} · ${[cd.built_m2 && `${cd.built_m2} m² construidos`, cd.plot_m2 && `${flat ? 'parcela del edificio' : 'parcela'} ${cd.plot_m2} m²`, cd.year && `de ${cd.year}`, cd.use].filter(Boolean).join(' · ')}` : undefined} detail={cad.n}>
              <button onClick={() => setCatOpen(true)} className="min-h-9 px-3 rounded-lg border border-line text-[13px] font-semibold">{cd ? 'Cambiar' : 'Consultar'}</button>
            </Row>
            {cd && (
              <div className="flex gap-1.5 flex-wrap -mt-1 pl-7">
                {canFill && <button onClick={fillFromCadastre} className="min-h-9 px-3 rounded-lg bg-accent-soft text-accent text-[12px] font-semibold">Completar huecos con el Catastro</button>}
                {cd.map && <a href={cd.map} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">Plano en el Catastro ↗</a>}
                <a href="https://www.sedecatastro.gob.es/" target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-lg border border-line text-[12px] font-semibold text-accent flex items-center">Valor de referencia (con Cl@ve) ↗</a>
              </div>
            )}
            {(cd || h.registry) && <SourcesTable h={h} />}
            <Row icon={flood.s} title="Zona inundable" detail={flood.n}>
              <button onClick={checkFlood} disabled={!!busy} className="min-h-9 px-3 rounded-lg border border-line text-[13px] font-semibold disabled:opacity-50">{h.flood ? 'Repetir' : 'Comprobar'}</button>
            </Row>
            <Row icon={radon.s} title="Radón" detail={radon.n} />
            <Row icon={market.s} title="Precio e historial" detail={market.n} />
            {busy && <p role="status" className="text-xs text-muted">{busy}</p>}
            {error && <p role="alert" className="text-xs text-danger">{error}</p>}
            <p className="text-[11px] text-muted">Datos públicos del Catastro y de los mapas oficiales de zonas inundables del Ministerio (solo las zonas estudiadas). El radón, según la lista de municipios de la Comunidad de Madrid.</p>
          </div>

          {/* La IA y los papeles */}
          <List title="Lo que dice el anuncio (a confirmar)" items={AI_CHECKS.filter(x => x.key !== 'precio_zona')} health={health} onOpen={setEdit} />
          <List title="Con papeles o visitándola" items={MANUAL_CHECKS} health={health} onOpen={setEdit} />
          <p className="text-[11px] text-muted -mt-1">Lo de la IA se rellena al pegar su respuesta (pídeselo otra vez con el botón de la IA). Toca cualquier punto para cambiarlo, añadir notas o subir el documento.</p>
        </div>
      )}
      {edit && <HealthSheet h={h} m={m} householdId={householdId} check={edit} onClose={() => setEdit(null)} />}
      {catOpen && <CatastroSheet h={h} m={m} onClose={() => setCatOpen(false)} />}
    </section>
  )
}

function Row({ icon, title, note, detail, children }: { icon: HealthStatus; title: string; note?: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-5 text-center shrink-0" aria-label={STATUS_LABEL[icon]}>{STATUS_ICON[icon]}</span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold">{title}</span>
        {note && <span className="text-[12px] text-muted break-words">{note}</span>}
        {detail && <span className={`text-[12px] ${tone(icon)}`}>{detail}</span>}
      </span>
      {children}
    </div>
  )
}

function List({ title, items, health, onOpen }: {
  title: string; items: { key: string; title: string; hint: string; link?: { label: string; url: string } }[]; health: Health
  onOpen: (x: { key: string; title: string; hint: string; link?: { label: string; url: string } }) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted">{title}</span>
      <ul className="bg-card rounded-2xl px-3">
        {items.map((x, i) => {
          const it: HealthItem = health[x.key] ?? { s: 'unknown' }
          return (
            <li key={x.key} className={i < items.length - 1 ? 'border-b border-line' : ''}>
              <button onClick={() => onOpen(x)} className="w-full py-2.5 flex items-start gap-2 text-left">
                <span className="w-5 text-center shrink-0">{STATUS_ICON[it.s]}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold">{x.title}{it.src === 'ia' ? <span className="text-[11px] font-normal text-muted"> · según la IA</span> : null}</span>
                  {it.n && <span className={`text-[12px] ${tone(it.s)} break-words`}>{it.n}</span>}
                </span>
                {it.files?.length ? <span className="text-[13px] shrink-0">📄{it.files.length > 1 ? it.files.length : ''}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function HealthSheet({ h, m, householdId, check, onClose }: {
  h: Home; m: Mudanza; householdId: string; check: { key: string; title: string; hint: string; link?: { label: string; url: string } }; onClose: () => void
}) {
  const current: HealthItem = ((h.health ?? {}) as Health)[check.key] ?? { s: 'unknown' }
  const [s, setS] = useState<HealthStatus>(current.s)
  const [n, setN] = useState(current.n ?? '')
  const [error, setError] = useState('')
  // Archivos: siempre la versión al día del piso
  const live = (m.homes.find(x => x.id === h.id)?.health ?? {}) as Health
  const files = live[check.key]?.files ?? []

  const put = (item: HealthItem) => m.write('homes', { health: { ...((m.homes.find(x => x.id === h.id)?.health ?? {}) as Health), [check.key]: item } }, h.id)

  async function save() {
    const err = await put({ ...current, files, s, n: n.trim() || undefined, src: 'manual' })
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={check.title} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted -mt-2">{check.hint}</p>
        {check.link && <a href={check.link.url} target="_blank" rel="noopener noreferrer" className="self-start min-h-10 px-3 rounded-xl border border-line text-sm font-semibold text-accent flex items-center">{check.link.label} ↗</a>}
        {current.src === 'ia' && <p className="text-xs text-[#C77A12] -mt-2">Esto lo ha dicho la IA: confírmalo antes de fiarte.</p>}
        <Choice<HealthStatus> label="Estado" value={s} onChange={setS}
          options={(['ok', 'warn', 'bad', 'unknown'] as HealthStatus[]).map(x => ({ value: x, label: `${STATUS_ICON[x]} ${STATUS_LABEL[x]}` }))} />
        <TextArea label="Notas" value={n} onChange={e => setN(e.target.value)} maxLength={500} />
        {check.key === 'nota_simple' && <NotaReader h={h} m={m} files={files} onDone={onClose} />}
        <DocFiles files={files}
          onAdd={async (list, onProgress) => {
            const { added, error: e } = await uploadDocFiles(`${householdId}/pisos/${h.id}`, list, 10 - files.length, onProgress)
            if (added.length) await put({ ...current, s, n: n.trim() || undefined, src: 'manual', files: [...files, ...added] })
            return e
          }}
          onRemove={async f => {
            await supabase.storage.from('sale-docs').remove([f.path])
            await put({ ...current, s, n: n.trim() || undefined, files: files.filter(x => x.path !== f.path) })
          }} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button onClick={save} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
      </div>
    </Sheet>
  )
}

/** Buscar el inmueble en el Catastro: por referencia o por la ubicación del piso (y elegir si hay varios) */
function CatastroSheet({ h, m, onClose }: { h: Home; m: Mudanza; onClose: () => void }) {
  const [rc, setRc] = useState(h.cadastral_ref ?? '')
  const [res, setRes] = useState<CheckResult | null>(null)
  const [busy, setBusy] = useState(false)
  const approx = h.geo_precision === 'zona' || h.geo_precision === 'localidad'

  async function ask(body: Record<string, unknown>) {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('property-check', { body: { mode: 'catastro', ...body } })
    setBusy(false)
    const r = (data ?? null) as CheckResult | null
    if (error || !r) { setRes({ error: 'No se ha podido consultar el Catastro. Prueba más tarde.' }); return }
    if (r.property) {
      await m.write('homes', { cadastral_ref: r.property.rc, cadastre: { ...r.property, at: new Date().toISOString() } }, h.id)
      onClose(); return
    }
    setRes(r)
  }

  return (
    <Sheet title="Catastro" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <TextField label="Referencia catastral" value={rc} onChange={e => setRc(e.target.value.toUpperCase())} maxLength={24} placeholder="20 caracteres (o 14 de la parcela)" />
          </div>
          <button onClick={() => ask({ rc })} disabled={busy || rc.replace(/\W/g, '').length < 14} className="min-h-12 px-3 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-40">Buscar</button>
        </div>
        {h.lat != null && h.lng != null && (
          <button onClick={() => ask({ lat: h.lat, lng: h.lng })} disabled={busy} className="min-h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-50">
            📍 Buscar por la ubicación del piso{approx ? ' (aproximada)' : ''}
          </button>
        )}
        {busy && <p role="status" className="text-sm text-muted">Consultando el Catastro…</p>}
        {res?.error && <p role="alert" className="text-sm text-danger">{res.error}</p>}
        {res?.candidates && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">¿Cuál es? (la más cercana primero)</span>
            {res.candidates.map(x => (
              <button key={x.rc} onClick={() => ask({ rc: x.rc })} className="bg-card rounded-xl p-3 text-left flex flex-col">
                <span className="text-[14px] font-semibold">{x.address || x.rc}</span>
                <span className="text-[12px] text-muted">{x.rc}{x.dis != null ? ` · a ${Math.round(x.dis)} m` : ''}</span>
              </button>
            ))}
          </div>
        )}
        {res?.units && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">En esa parcela hay {res.units.length} inmuebles: elige el piso</span>
            {res.units.map(x => (
              <button key={x.rc} onClick={() => ask({ rc: x.rc })} className="bg-card rounded-xl p-3 text-left flex flex-col">
                <span className="text-[14px] font-semibold">{x.address}</span>
                <span className="text-[12px] text-muted">{[x.use, x.built_m2 && `${x.built_m2} m²`, x.year && `de ${x.year}`].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">La referencia suele estar en el recibo del IBI o en la nota simple; a veces la pone el anuncio.</p>
      </div>
    </Sheet>
  )
}


/** Anuncio, Catastro y Registro lado a lado; lo que no cuadra, marcado */
function SourcesTable({ h }: { h: Home }) {
  const c = h.cadastre, r = h.registry
  const fmt = (v?: number | null) => (v ? `${Math.round(v).toLocaleString('es-ES')}` : '—')
  const off = (a?: number | null, b?: number | null, tol = 0.15) => !!a && !!b && Math.abs(a - b) / b > tol
  const ad = h.size_m2 ? Number(h.size_m2) : null, adPlot = h.plot_m2 ? Number(h.plot_m2) : null
  const flat = /division horizontal/i.test(c?.kind ?? '')
  const rows: [string, string, string, string, boolean][] = [
    ['Construidos (m²)', fmt(ad), fmt(c?.built_m2), fmt(r?.built_m2), off(ad, c?.built_m2) || off(ad, r?.built_m2)],
    ['Parcela (m²)', fmt(adPlot), flat ? 'edificio' : fmt(c?.plot_m2), fmt(r?.plot_m2), (!flat && off(adPlot, c?.plot_m2, 0.1)) || off(adPlot, r?.plot_m2, 0.1)],
    ['Útiles (m²)', fmt(h.useful_m2 ? Number(h.useful_m2) : null), '—', fmt(r?.useful_m2), false],
    ['Año', h.year_built ? String(h.year_built) : '—', c?.year ? String(c.year) : '—', '—', false],
    ['Ref. catastral', '', c?.rc ? '✓' : '—', r?.rc ? (c?.rc && r.rc.slice(0, 14) !== c.rc.slice(0, 14) ? 'otra ⚠️' : '✓') : '—', !!(c?.rc && r?.rc && r.rc.slice(0, 14) !== c.rc.slice(0, 14))]
  ]
  return (
    <div className="pl-7 -mt-1">
      <table className="w-full text-[12px]">
        <thead><tr className="text-muted"><th className="text-left font-medium py-1"></th><th className="font-medium">Anuncio</th><th className="font-medium">Catastro</th><th className="font-medium">Registro</th></tr></thead>
        <tbody>
          {rows.map(([label, a, b, c2, bad]) => (
            <tr key={label} className={bad ? 'text-[#C77A12] font-semibold' : ''}>
              <td className="py-0.5">{bad ? '⚠️ ' : ''}{label}</td><td className="text-center">{a}</td><td className="text-center">{b}</td><td className="text-center">{c2}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!r && <p className="text-[11px] text-muted mt-1">Sube la nota simple en «Nota simple (cargas)» para completar la columna del Registro.</p>}
      {r && <p className="text-[11px] text-muted mt-1">Lo que cuenta para la hipoteca y para vender en el futuro es lo <b>registrado</b>.</p>}
    </div>
  )
}

/** Leer la nota simple subida (PDF con texto) o, si es escaneada, la respuesta de una IA */
function NotaReader({ h, m, files, onDone }: { h: Home; m: Mudanza; files: DocFile[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const pdfs = files.filter(f => /\.pdf$/i.test(f.path))

  async function apply(text: string) {
    const r = parseNota(text)
    if (!r) { setMsg({ ok: false, text: 'No he encontrado los datos de la nota en ese texto.' }); return false }
    const st = notaStatus(r)
    const extra: string[] = []
    if (r.built_m2 && h.size_m2 && Number(h.size_m2) > r.built_m2 * 1.15) extra.push(`el anuncio dice ${Number(h.size_m2)} m² y el Registro ${r.built_m2} m²`)
    const health = { ...((m.homes.find(x => x.id === h.id)?.health ?? {}) as Health) }
    health.nota_simple = { s: extra.length && st.s === 'ok' ? 'warn' : st.s, n: [st.n, ...extra].join(' · ').slice(0, 480), src: 'auto', files }
    const err = await m.write('homes', { registry: r, health, ...(!h.cadastral_ref && r.rc ? { cadastral_ref: r.rc } : {}) }, h.id)
    if (err) { setMsg({ ok: false, text: err }); return false }
    onDone()
    return true
  }

  async function readPdf() {
    if (!pdfs.length) return
    setBusy('Leyendo la nota simple…'); setMsg(null)
    try {
      const url = await saleDocUrl(pdfs[0].path)
      if (!url) throw new Error('sin enlace')
      const text = await pdfText(await (await fetch(url)).blob())
      setBusy(null)
      if (text.replace(/\s/g, '').length < 200) { setAiOpen(true); setMsg({ ok: false, text: 'Esta nota parece escaneada (sin texto). Pásasela a una IA con los botones de abajo.' }); return }
      await apply(text)
    } catch {
      setBusy(null)
      setMsg({ ok: false, text: 'No se ha podido leer el PDF. Pásaselo a una IA con los botones de abajo.' }); setAiOpen(true)
    }
  }

  async function askAi(ai: 'chatgpt' | 'gemini' | 'claude') {
    try { await navigator.clipboard.writeText(NOTA_PROMPT) } catch { /* se abre igualmente */ }
    const q = encodeURIComponent(NOTA_PROMPT)
    window.open(ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app', '_blank', 'noopener')
    setMsg({ ok: true, text: 'Adjunta allí el PDF de la nota simple. Cuando conteste, copia la respuesta y pégala aquí.' })
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
      <span className="text-sm font-bold">📖 Leer la nota simple</span>
      <span className="text-xs text-muted">Saca metros, parcela, referencia catastral, cargas y cuántos titulares hay, y los compara con el anuncio y el Catastro. No se guardan nombres ni DNI.</span>
      <button type="button" onClick={readPdf} disabled={!pdfs.length || !!busy} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-40">
        {busy ?? (pdfs.length ? 'Leer el PDF subido' : 'Sube primero el PDF (abajo)')}
      </button>
      {!aiOpen && <button type="button" onClick={() => setAiOpen(true)} className="self-start min-h-10 text-sm text-accent font-semibold">¿Es una foto o un escaneo? Usar una IA</button>}
      {aiOpen && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => askAi(k)} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold">{l} ↗</button>
            ))}
          </div>
          <TextArea label="Respuesta de la IA" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={5000} placeholder="Pega aquí lo que conteste…" />
          <button type="button" onClick={() => apply(pasted)} disabled={!pasted.trim()} className="min-h-11 rounded-xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Usar esta respuesta</button>
        </div>
      )}
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-accent' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  )
}
