import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadDocFiles, type Home, type Mudanza } from '../../lib/mudanza'
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
export default function HomeHealth({ h, m, householdId }: { h: Home; m: Mudanza; householdId: string }) {
  const [open, setOpen] = useState(false)
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
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex justify-between items-center gap-2 text-left min-h-11">
        <span className="flex flex-col">
          <span className="font-bold text-[15px]">🩺 Estado y riesgos</span>
          <span className="text-[13px] text-muted">✅ {c.ok} · ⚠️ {c.warn}{c.bad ? ` · ⛔ ${c.bad}` : ''} · ❓ {c.unknown}</span>
        </span>
        <span className="text-muted text-lg" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
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

