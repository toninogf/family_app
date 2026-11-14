// «🔬 Análisis a fondo (IA)» en la ficha de Buscamos: lanza la investigación, guarda el informe y propone cambios para aceptar uno a uno
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Home, Mudanza } from '../../lib/mudanza'
import { STATUS_ICON } from '../../lib/health'
import { PARTIDA, REFORM_STATE, kEur } from '../../lib/reforma'
import { VERDICT, checkTitle, deepAnalysisPrompt, parseDeepAnalysis, type DeepAnalysis, type DeepData } from '../../lib/deepAnalysis'
import { saleNet } from './VentaGestion'
import { today } from '../../lib/dates'

const e = (n?: number) => (n == null ? '—' : `${Math.round(n).toLocaleString('es-ES')} €`)

/** Línea corta para el grupo plegado y el comparador */
export function deepLine(h: Home) {
  const a = h.deep_analysis
  if (!a) return h.address ? 'sin hacer' : 'falta la dirección'
  const v = a.data?.veredicto ? `${VERDICT[a.data.veredicto].icon} ${VERDICT[a.data.veredicto].label}` : 'informe guardado'
  return `${v}${a.data?.precio?.justo ? ` · justo ~${kEur(a.data.precio.justo * 100)}` : ''} · ${a.at.slice(8, 10)}/${a.at.slice(5, 7)}`
}

export function VerdictChip({ h }: { h: Home }) {
  const v = h.deep_analysis?.data?.veredicto
  if (!v) return <span className="text-muted">—</span>
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-bold ${VERDICT[v].tone}`}>{VERDICT[v].icon} {VERDICT[v].label}</span>
}

export function DeepAnalysisPanel({ h, m }: { h: Home; m: Mudanza }) {
  const a = h.deep_analysis ?? null
  const [launch, setLaunch] = useState(!a)
  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  const [buy, setBuy] = useState<{ savings_cents: number | null; loan_cents: number | null } | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [askDel, setAskDel] = useState(false)
  useEffect(() => { void supabase.from('purchase').select('savings_cents, loan_cents').maybeSingle().then(({ data }) => setBuy(data as never)) }, [])

  if (!h.address) return <p className="text-sm text-muted">Añade la dirección de la casa (Editar → La zona) para poder lanzar el análisis a fondo.</p>

  async function ask(ai: 'chatgpt' | 'gemini' | 'claude') {
    const s = m.listing ? saleNet(m) : null
    const budget = m.criteria?.max_price_cents ?? null
    const need = budget != null ? budget - (buy?.savings_cents ?? 0) - (buy?.loan_cents ?? 0) : null
    const prompt = deepAnalysisPrompt(h, m, {
      workAddress: m.criteria?.work_address ?? null,
      sale: s ? { price: s.sale, net: s.net, need, accepted: s.fromOffer, status: s.fromOffer ? 'con oferta aceptada' : 'en venta' } : null
    })
    let copied = true
    try { await navigator.clipboard.writeText(prompt) } catch { copied = false }
    const short = 'Te voy a pegar una petición de análisis a fondo de una casa (la tengo copiada). Espera a que la pegue y entonces investiga.'
    const q = encodeURIComponent(prompt.length < 6000 ? prompt : short)
    const target = ai === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : ai === 'claude' ? `https://claude.ai/new?q=${q}` : 'https://gemini.google.com/app'
    setNote(copied ? 'Petición copiada. Pégala en el chat y activa el modo de investigación (Deep Research / Research): tarda 10–30 min. Cuando termine, copia la respuesta entera y pulsa «Pegar el informe».' : 'No se ha podido copiar: dale permiso al portapapeles.')
    window.open(target, '_blank', 'noopener')
  }
  async function save(t: string) {
    const r = parseDeepAnalysis(t)
    if (r.error) { setNote(r.error); return }
    const next: DeepAnalysis = { at: today(), report: r.report, data: r.data, applied: [] }
    const err = await m.write('homes', { deep_analysis: next }, h.id)
    if (err) { setNote(err); return }
    setText(''); setLaunch(false)
    setNote(r.data ? 'Informe guardado. Revisa abajo los cambios que propone para la ficha.' : 'Informe guardado, pero sin el bloque de datos del final: no hay cambios que proponer.')
  }
  async function paste() {
    try { const t = await navigator.clipboard.readText(); setText(t); await save(t) } catch { setNote('No puedo leer el portapapeles: pega el informe en el recuadro y pulsa Guardar.') }
  }
  const mark = (key: string) => m.write('homes', { deep_analysis: { ...a!, applied: [...(a!.applied ?? []), key] } }, h.id)
  const isDone = (key: string) => (a?.applied ?? []).includes(key)

  const launcher = (
    <div className="rounded-xl bg-accent-soft p-3 flex flex-col gap-2">
      <span className="text-[13px]">La IA investiga catastro, urbanismo, riesgos, estado, precio, costes, colegios y trayecto al trabajo, y da un veredicto. Mejor con el modo de investigación (Deep Research de ChatGPT o Gemini, Research de Claude).</span>
      {!m.criteria?.work_address && <span className="text-[12px] text-[#C77A12]">Pon la dirección de tu trabajo en «Qué buscamos» para que calcule el trayecto exacto.</span>}
      <div className="grid grid-cols-3 gap-2">
        {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, lb]) => (
          <button key={k} onClick={() => void ask(k)} className="min-h-10 rounded-xl border border-line bg-card text-sm font-semibold">{lb} ↗</button>
        ))}
      </div>
      <button onClick={() => void paste()} className="min-h-10 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar el informe</button>
      <textarea value={text} onChange={ev => setText(ev.target.value)} rows={2} placeholder="…o pégalo aquí"
        className="w-full px-3 py-2 rounded-xl border border-line bg-card text-[14px]" />
      {text.trim() && <button onClick={() => void save(text)} className="min-h-10 rounded-xl border border-line bg-card text-sm font-semibold">Guardar informe</button>}
      {a && <button onClick={() => setLaunch(false)} className="self-start text-sm text-muted min-h-9">Cancelar</button>}
    </div>
  )

  if (!a || launch) return <div className="flex flex-col gap-2">{launcher}{note && <p role="status" className="text-[12px] text-muted">{note}</p>}</div>

  const d: DeepData = a.data ?? {}
  const v = d.veredicto ? VERDICT[d.veredicto] : null
  const list = (title: string, xs?: string[]) => xs?.length ? (
    <div className="flex flex-col gap-0.5"><span className="text-[13px] font-semibold">{title}</span>{xs.map(x => <span key={x} className="text-[13px] text-muted">· {x}</span>)}</div>
  ) : null

  // Cambios que propone para la ficha (se aceptan o ignoran uno a uno)
  type Prop = { key: string; text: string; apply: () => Promise<unknown> }
  const props: Prop[] = []
  for (const c of d.checks ?? []) {
    const cur = h.health?.[c.clave]
    if (cur?.s === c.estado) continue
    props.push({
      key: `check:${c.clave}`, text: `${STATUS_ICON[c.estado]} ${checkTitle(c.clave)}${c.nota ? `: ${c.nota}` : ''}`,
      apply: () => m.write('homes', { health: { ...(h.health ?? {}), [c.clave]: { s: c.estado, n: `🔬 ${c.nota ?? ''}`.trim().slice(0, 500), src: 'ia' } }, deep_analysis: { ...a, applied: [...(a.applied ?? []), `check:${c.clave}`] } }, h.id)
    })
  }
  const ca = d.catastro
  if (ca && ((ca.ref && ca.ref !== h.cadastral_ref) || (ca.ano && ca.ano !== h.year_built))) {
    props.push({
      key: 'catastro', text: `🏛️ Catastro: ${[ca.ref && `ref. ${ca.ref}`, ca.ano && `año ${ca.ano}`].filter(Boolean).join(' · ')}`,
      apply: () => m.write('homes', { ...(ca.ref ? { cadastral_ref: ca.ref } : {}), ...(ca.ano ? { year_built: ca.ano } : {}), deep_analysis: { ...a, applied: [...(a.applied ?? []), 'catastro'] } }, h.id)
    })
  }
  const rf = d.reforma
  const have = new Set((h.reform?.items ?? []).map(i => i.k))
  const newItems = (rf?.partidas ?? []).filter(k => !have.has(k))
  if (rf && ((rf.estado && rf.estado !== h.reform?.state) || newItems.length)) {
    props.push({
      key: 'reforma', text: `🔨 Reforma: ${[rf.estado && REFORM_STATE[rf.estado].label, newItems.length && `añadir ${newItems.map(k => PARTIDA[k]?.label ?? k).join(', ')}`].filter(Boolean).join(' · ')}`,
      apply: () => m.write('homes', { reform: { ...(h.reform ?? {}), ...(rf.estado ? { state: rf.estado } : {}), items: [...(h.reform?.items ?? []), ...newItems.map(k => ({ k, src: 'ia' as const }))] }, deep_analysis: { ...a, applied: [...(a.applied ?? []), 'reforma'] } }, h.id)
    })
  }
  const co = d.costes
  if (co && ((co.ibi_ano && h.ibi_cents == null) || (co.comunidad_mes && h.community_fee_cents == null))) {
    props.push({
      key: 'costes', text: `💶 Gastos: ${[co.ibi_ano && h.ibi_cents == null && `IBI ${e(co.ibi_ano)}/año`, co.comunidad_mes && h.community_fee_cents == null && `comunidad ${e(co.comunidad_mes)}/mes`].filter(Boolean).join(' · ')}`,
      apply: () => m.write('homes', { ...(co.ibi_ano && h.ibi_cents == null ? { ibi_cents: Math.round(co.ibi_ano * 100) } : {}), ...(co.comunidad_mes && h.community_fee_cents == null ? { community_fee_cents: Math.round(co.comunidad_mes * 100) } : {}), deep_analysis: { ...a, applied: [...(a.applied ?? []), 'costes'] } }, h.id)
    })
  }
  const pending = props.filter(p => !isDone(p.key))

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
        <span className="flex items-center gap-2 flex-wrap">
          {v ? <span className={`px-3 py-1 rounded-full text-[14px] font-bold ${v.tone}`}>{v.icon} {v.label}</span> : <span className="font-bold">Informe</span>}
          {d.nota != null && <span className="text-[13px] font-semibold">nota IA {d.nota.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span>}
          <span className="text-[12px] text-muted ml-auto">{a.at.split('-').reverse().join('/')}</span>
        </span>
        {d.resumen && <p className="text-[14px]">{d.resumen}</p>}
        {(d.precio?.justo || d.precio?.oferta) && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Oferta inicial', d.precio?.oferta], ['Precio justo', d.precio?.justo], ['Tope', d.precio?.tope]] as const).map(([lb, n]) => (
              <span key={lb} className="rounded-xl bg-bg p-2 flex flex-col"><span className="text-[11px] text-muted">{lb}</span><b className="text-[14px]">{e(n)}</b></span>
            ))}
          </div>
        )}
        {list('👍 Lo que más pesa', d.motivos)}
        {list('⛔ La descartaría', d.descartes)}
        {(rf?.min || rf?.max) && <span className="text-[13px]">🔨 Reforma realista: {e(rf?.min)} – {e(rf?.max)}{rf?.nota ? ` · ${rf.nota}` : ''}</span>}
        {ca && (ca.m2 || ca.parcela || ca.coincide != null) && <span className="text-[13px]">🏛️ Catastro: {[ca.m2 && `${ca.m2} m²`, ca.parcela && `parcela ${ca.parcela} m²`, ca.ano && `año ${ca.ano}`].filter(Boolean).join(' · ')}{ca.coincide === false ? <b className="text-danger"> · no coincide con el anuncio</b> : ca.coincide ? ' · coincide' : ''}{ca.nota ? ` — ${ca.nota}` : ''}</span>}
        {(d.trabajo?.minutos_coche || d.trabajo?.minutos_transporte) && <span className="text-[13px]">💼 Al trabajo: {[d.trabajo?.minutos_coche && `🚗 ${d.trabajo.minutos_coche} min`, d.trabajo?.minutos_transporte && `🚆 ${d.trabajo.minutos_transporte} min`].filter(Boolean).join(' · ')}{d.trabajo?.nota ? ` · ${d.trabajo.nota}` : ''}</span>}
        {(co?.ibi_ano || co?.energia_mes || co?.comunidad_mes || co?.basuras_ano) && <span className="text-[13px]">🧾 Al año: {[co?.ibi_ano && `IBI ${e(co.ibi_ano)}`, co?.basuras_ano && `basuras ${e(co.basuras_ano)}`, co?.comunidad_mes && `comunidad ${e(co.comunidad_mes)}/mes`, co?.energia_mes && `energía ~${e(co.energia_mes)}/mes`].filter(Boolean).join(' · ')}</span>}
        {d.colegios?.length ? (
          <div className="flex flex-col gap-0.5"><span className="text-[13px] font-semibold">🏫 Colegios</span>
            {d.colegios.map(c => <span key={c.nombre} className="text-[13px] text-muted">· {c.nombre}{c.tipo ? ` (${c.tipo})` : ''}{c.distancia_m ? ` · ${c.distancia_m < 1000 ? `${Math.round(c.distancia_m)} m` : `${(c.distancia_m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`}` : ''}{c.nota ? ` · ${c.nota}` : ''}</span>)}
          </div>
        ) : null}
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl border border-accent p-3 flex flex-col gap-2">
          <span className="text-[14px] font-bold">✍️ Propone cambiar en la ficha ({pending.length})</span>
          {pending.map(p => (
            <div key={p.key} className="flex flex-col gap-1 border-t border-line pt-2 first-of-type:border-0 first-of-type:pt-0">
              <span className="text-[13px]">{p.text}</span>
              <span className="flex gap-2">
                <button onClick={() => void p.apply()} className="min-h-9 px-3 rounded-lg bg-accent text-white dark:text-bg text-[13px] font-semibold">Aplicar</button>
                <button onClick={() => void mark(p.key)} className="min-h-9 px-3 rounded-lg border border-line text-[13px] font-semibold">Ignorar</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <details className="bg-card rounded-2xl p-4">
        <summary className="font-semibold text-[14px] cursor-pointer">🗣️ Preguntas, documentos y negociación</summary>
        <div className="flex flex-col gap-2 mt-2">
          {list('Preguntar a la agencia o al vendedor', d.preguntas)}
          {list('Pedir antes de ofertar', d.documentos)}
          {list('Para negociar', d.negociacion)}
        </div>
      </details>

      <div className="bg-card rounded-2xl p-4 flex flex-col gap-2">
        <button onClick={() => setShowReport(s => !s)} className="text-left font-semibold text-[14px] flex justify-between">📄 Informe completo <span className="text-accent text-sm">{showReport ? 'Ocultar' : 'Ver'}</span></button>
        {showReport && <div className="text-[13px] whitespace-pre-wrap break-words">{a.report}</div>}
      </div>

      <span className="flex gap-2">
        <button onClick={() => setLaunch(true)} className="min-h-10 px-3 rounded-xl border border-line text-sm font-semibold">🔄 Rehacer el análisis</button>
        {askDel
          ? <button onClick={() => { setAskDel(false); void m.write('homes', { deep_analysis: null }, h.id) }} className="min-h-10 px-3 rounded-xl bg-danger text-white text-sm font-semibold">Sí, borrar el análisis</button>
          : <button onClick={() => setAskDel(true)} className="min-h-10 px-3 rounded-xl border border-line text-sm text-muted">Borrar</button>}
      </span>
      {note && <p role="status" className="text-[12px] text-muted">{note}</p>}
    </div>
  )
}
