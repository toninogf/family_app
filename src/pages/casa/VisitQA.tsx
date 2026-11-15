// «📋 Cuestionario de la visita»: lista por secciones, cada respuesta se guarda al tocarla (y en el móvil si no hay cobertura)
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Home, Mudanza } from '../../lib/mudanza'
import {
  SECTIONS, answerText, isLater, laterPatch, noteOf, patchFor, qaProgress, questions, valueOf,
  type CustomQ, type Q, type VisitQA as VQA, type VisitTemplate
} from '../../lib/visitQA'

const KEY = (id: string) => `vqa:${id}`
const load = (id: string): Partial<Home> => { try { return JSON.parse(localStorage.getItem(KEY(id)) ?? '{}') } catch { return {} } }
const save = (id: string, p: Partial<Home>) => { try { if (Object.keys(p).length) localStorage.setItem(KEY(id), JSON.stringify(p)); else localStorage.removeItem(KEY(id)) } catch { /* sin almacenamiento */ } }

/** Sube lo que quedó guardado en el móvil (de cualquier casa) */
async function flushAll(reload: () => unknown) {
  let any = false
  try {
    for (const k of Object.keys(localStorage).filter(k => k.startsWith('vqa:'))) {
      const id = k.slice(4)
      const p = load(id)
      if (!Object.keys(p).length) continue
      const { error } = await supabase.from('homes').update(p).eq('id', id)
      if (!error) { localStorage.removeItem(k); any = true }
    }
  } catch { /* sin almacenamiento o sin red */ }
  if (any) await reload()
}

export function VisitQA({ h, m }: { h: Home; m: Mudanza }) {
  const [pending, setPending] = useState<Partial<Home>>(() => load(h.id))
  const [offline, setOffline] = useState(false)
  const [onlyPending, setOnlyPending] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const eff = { ...h, ...pending } as Home

  useEffect(() => {
    void flushAll(m.reload).then(() => setPending(load(h.id)))
    const on = () => { setOffline(false); void flushAll(m.reload).then(() => setPending(load(h.id))) }
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.id])

  async function change(patch: Partial<Home>) {
    const next = { ...pending, ...patch }
    setPending(next); save(h.id, next)
    const { error } = await supabase.from('homes').update(next).eq('id', h.id)
    if (error) { setOffline(true); return }
    setOffline(false)
    // Solo se quita lo que se ha subido tal cual (por si mientras tanto se ha tocado otra cosa)
    setPending(cur => {
      const n = { ...cur } as Record<string, unknown>
      for (const k of Object.keys(next)) if (n[k] === (next as Record<string, unknown>)[k]) delete n[k]
      save(h.id, n as Partial<Home>)
      return n as Partial<Home>
    })
    await m.reload()
  }
  const answer = (q: Q, v: string | number | boolean | null, note?: string) => void change(patchFor(q, eff, v, note))
  const later = (q: Q) => void change(laterPatch(q, eff, !isLater(q, eff)))

  const tpl = (m.criteria?.visit_questions ?? {}) as VisitTemplate
  async function writeTpl(t: VisitTemplate) {
    if (!m.criteria) return
    const { error } = await supabase.from('search_criteria').update({ visit_questions: t }).eq('household_id', m.criteria.household_id)
    if (!error) await m.reload()
  }
  function remove(q: Q, scope: 'casa' | 'todas') {
    setRemoving(null)
    const qa = (eff.visit_qa ?? {}) as VQA
    if (q.custom === 'casa') { void change({ visit_qa: { ...qa, custom: (qa.custom ?? []).filter(c => c.id !== q.id) } }); return }
    if (q.custom === 'todas' && scope === 'todas') { void writeTpl({ ...tpl, custom: (tpl.custom ?? []).filter(c => c.id !== q.id) }); return }
    if (scope === 'todas') void writeTpl({ ...tpl, hidden: [...(tpl.hidden ?? []), q.id] })
    else void change({ visit_qa: { ...qa, hidden: [...(qa.hidden ?? []), q.id] } })
  }
  function add(text: string, type: CustomQ['type'], scope: 'casa' | 'todas') {
    const cq: CustomQ = { id: `c:${Date.now().toString(36)}`, q: text.trim().slice(0, 200), type }
    if (!cq.q) return
    setAdding(false)
    if (scope === 'todas') void writeTpl({ ...tpl, custom: [...(tpl.custom ?? []), cq] })
    else { const qa = (eff.visit_qa ?? {}) as VQA; void change({ visit_qa: { ...qa, custom: [...(qa.custom ?? []), cq] } }) }
  }
  function restoreAll() {
    const qa = (eff.visit_qa ?? {}) as VQA
    void change({ visit_qa: { ...qa, hidden: [] } })
  }

  const qs = questions(eff, m.criteria)
  const prog = qaProgress(eff, m.criteria)
  const hiddenHere = ((eff.visit_qa ?? {}) as VQA).hidden?.length ?? 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="flex justify-between items-baseline gap-2 text-[13px]">
          <b>📋 {prog.done} de {prog.total} respondidas</b>
          <span className="text-muted">{prog.later ? `🕓 ${prog.later} para luego` : prog.pending ? `faltan ${prog.pending}` : '¡todo respondido!'}</span>
        </span>
        <div className="h-2 rounded-full bg-bg overflow-hidden"><div className="h-full bg-accent" style={{ width: `${prog.total ? prog.done * 100 / prog.total : 0}%` }} /></div>
        <span className="flex justify-between items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] min-h-9"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} className="w-5 h-5 accent-[var(--app-accent)]" /> Solo pendientes</label>
          {offline && <span className="text-[12px] text-[#C77A12]">📴 Sin conexión: guardado en el móvil, se sube solo</span>}
        </span>
      </div>

      {SECTIONS.map(sec => {
        const all = qs.filter(q => q.section === sec.k)
        const list = onlyPending ? all.filter(q => valueOf(q, eff) === undefined) : all
        const done = all.filter(q => valueOf(q, eff) !== undefined).length
        if (!all.length && sec.k !== 'nuestras') return null
        return (
          <details key={sec.k} className="rounded-xl bg-card" open={done < all.length || sec.k === 'nuestras'}>
            <summary className="list-none cursor-pointer min-h-11 px-3 flex items-center justify-between gap-2">
              <span className="font-semibold text-[14px]">{sec.title} <span className="text-[11px] text-muted font-normal">{sec.help}</span></span>
              <span className={`text-[13px] font-semibold ${all.length && done === all.length ? 'text-accent' : 'text-muted'}`}>{done}/{all.length}</span>
            </summary>
            <div className="flex flex-col px-3 pb-3">
              {list.map(q => (
                <QRow key={q.id} q={q} h={eff} onAnswer={answer} onLater={later}
                  removing={removing === q.id} onRemove={() => setRemoving(removing === q.id ? null : q.id)} onRemoveScope={s => remove(q, s)} />
              ))}
              {onlyPending && !list.length && all.length > 0 && <span className="text-[12px] text-muted py-1">Todo respondido en esta sección.</span>}
              {sec.k === 'nuestras' && (adding ? <AddQ onAdd={add} onCancel={() => setAdding(false)} />
                : <button onClick={() => setAdding(true)} className="self-start min-h-10 px-3 mt-1 rounded-xl border border-line text-[13px] font-semibold">+ Añadir pregunta</button>)}
            </div>
          </details>
        )
      })}
      {hiddenHere > 0 && <button onClick={restoreAll} className="self-start text-[12px] text-muted min-h-9">↩️ Volver a mostrar {hiddenHere} quitada{hiddenHere > 1 ? 's' : ''} en esta casa</button>}
    </div>
  )
}

function QRow({ q, h, onAnswer, onLater, removing, onRemove, onRemoveScope }: {
  q: Q; h: Home; onAnswer: (q: Q, v: string | number | boolean | null, note?: string) => void; onLater: (q: Q) => void
  removing: boolean; onRemove: () => void; onRemoveScope: (s: 'casa' | 'todas') => void
}) {
  const v = valueOf(q, h)
  const lt = v === undefined && isLater(q, h)
  const [txt, setTxt] = useState(q.type === 'text' || q.type === 'number' ? (v === undefined ? '' : String(v)) : '')
  const [note, setNote] = useState(noteOf(q, h))
  const [info, setInfo] = useState(false)
  useEffect(() => { if (q.type === 'text' || q.type === 'number') setTxt(v === undefined ? '' : String(v)) }, [v, q.type])
  const btn = (on: boolean, extra = '') => `min-h-9 px-2.5 rounded-lg text-[13px] font-semibold border whitespace-nowrap ${on ? 'bg-ink text-bg border-ink' : 'bg-bg border-line'} ${extra}`
  const toggle = (val: string | boolean) => onAnswer(q, v === val ? null : val)
  const bad = v === 'warn' || v === 'bad' || (q.type === 'choice' && q.options!.find(o => o.v === v)?.s && q.options!.find(o => o.v === v)!.s !== 'ok')
  const ico = 'w-8 h-8 shrink-0 rounded-full text-[14px] flex items-center justify-center'

  return (
    <div className={`flex flex-col gap-1.5 py-2 border-t border-line first:border-0 ${lt ? 'bg-accent-soft -mx-3 px-3' : ''}`}>
      <span className="flex items-center gap-1">
        <span className="flex-1 text-[14px] font-semibold leading-snug">{v !== undefined ? <span className="text-accent">✓ </span> : lt ? '🕓 ' : ''}{q.label}</span>
        {q.hint && <button onClick={() => setInfo(!info)} aria-label="Más información" aria-expanded={info} className={`${ico} text-muted ${info ? 'bg-bg' : ''}`}>ⓘ</button>}
        {v === undefined && <button onClick={() => onLater(q)} aria-label={lt ? 'Quitar «para luego»' : 'No lo sé, preguntar luego'} title="Preguntar luego" className={`${ico} ${lt ? 'bg-card' : 'text-muted'}`}>🕓</button>}
        <button onClick={onRemove} aria-label={`Quitar «${q.label}»`} className={`${ico} text-muted`}>✕</button>
      </span>
      {info && q.hint && <span className="text-[12px] text-muted -mt-1">{q.hint}</span>}
      {removing && (
        <span className="flex gap-1.5 flex-wrap items-center text-[12px]">
          <span className="text-muted">Quitar:</span>
          {q.custom !== 'todas' && <button onClick={() => onRemoveScope('casa')} className="min-h-9 px-3 rounded-lg border border-line font-semibold">solo en esta casa</button>}
          {q.custom !== 'casa' && <button onClick={() => onRemoveScope('todas')} className="min-h-9 px-3 rounded-lg border border-danger text-danger font-semibold">en todas las casas</button>}
        </span>
      )}

      {q.type === 'estado' && (
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => toggle('ok')} className={btn(v === 'ok')}>✅ Bien</button>
          <button onClick={() => toggle('warn')} className={btn(v === 'warn')}>⚠️ Regular</button>
          <button onClick={() => toggle('bad')} className={btn(v === 'bad')}>⛔ Mal</button>
        </div>
      )}
      {q.type === 'yesno' && (
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => toggle(true)} className={btn(v === true)}>Sí</button>
          <button onClick={() => toggle(false)} className={btn(v === false)}>No</button>
        </div>
      )}
      {q.type === 'choice' && (
        <div className="flex gap-1.5 flex-wrap">
          {q.options!.map(o => <button key={o.v} onClick={() => toggle(o.v)} className={btn(v === o.v, q.options!.length > 4 ? 'w-9 px-0' : '')}>{o.label}</button>)}
        </div>
      )}
      {bad && q.bind.kind === 'health' && (
        <input value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== noteOf(q, h) && onAnswer(q, v as string, note)}
          placeholder="¿Qué habéis visto o qué os han dicho?" className="w-full min-h-9 px-3 rounded-lg border border-line bg-bg text-[13px]" />
      )}
      {q.type === 'number' && (
        <span className="flex items-center gap-2">
          <input inputMode="decimal" value={txt} onChange={e => setTxt(e.target.value)}
            onBlur={() => { const n = txt.trim() ? Number(txt.replace(/\./g, '').replace(',', '.')) : null; if (n === null || Number.isFinite(n)) { if (String(n ?? '') !== String(v ?? '')) onAnswer(q, n) } }}
            className="w-28 min-h-9 px-3 rounded-lg border border-line bg-bg text-[14px]" />
          <span className="text-[13px] text-muted">{q.unit}</span>
        </span>
      )}
      {q.type === 'text' && (
        <>
          {q.quick && (
            <div className="flex gap-1.5 flex-wrap">
              {q.quick.map(x => <button key={x} onClick={() => { setTxt(x); onAnswer(q, v === x ? null : x) }} className={btn(v === x, 'text-[12px] min-h-8')}>{x}</button>)}
            </div>
          )}
          <input value={txt} onChange={e => setTxt(e.target.value)} onBlur={() => txt.trim() !== String(v ?? '') && onAnswer(q, txt.trim() || null)}
            placeholder="…o escribe la respuesta" className="w-full min-h-9 px-3 rounded-lg border border-line bg-bg text-[13px]" />
        </>
      )}
      {v !== undefined && q.type !== 'text' && q.type !== 'number' && <span className="sr-only">{answerText(q, v)}</span>}
    </div>
  )
}

function AddQ({ onAdd, onCancel }: { onAdd: (t: string, type: CustomQ['type'], scope: 'casa' | 'todas') => void; onCancel: () => void }) {
  const [t, setT] = useState('')
  const [type, setType] = useState<CustomQ['type']>('text')
  const [scope, setScope] = useState<'casa' | 'todas'>('todas')
  const pill = (on: boolean) => `min-h-9 px-3 rounded-lg text-[12px] font-semibold border ${on ? 'bg-ink text-bg border-ink' : 'bg-bg border-line'}`
  return (
    <div className="rounded-xl border border-line p-2.5 mt-1 flex flex-col gap-2">
      <input autoFocus value={t} onChange={e => setT(e.target.value)} maxLength={200} placeholder="Ej. ¿Cabe el coche grande en el garaje?"
        className="w-full min-h-10 px-3 rounded-lg border border-line bg-bg text-[14px]" />
      <span className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={() => setType('text')} className={pill(type === 'text')}>Texto</button>
        <button type="button" onClick={() => setType('yesno')} className={pill(type === 'yesno')}>Sí / No</button>
        <button type="button" onClick={() => setType('estado')} className={pill(type === 'estado')}>Bien / Revisar / Problema</button>
      </span>
      <span className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={() => setScope('todas')} className={pill(scope === 'todas')}>Para todas las casas</button>
        <button type="button" onClick={() => setScope('casa')} className={pill(scope === 'casa')}>Solo esta</button>
      </span>
      <span className="flex gap-2">
        <button type="button" disabled={!t.trim()} onClick={() => onAdd(t, type, scope)} className="min-h-10 px-4 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">Añadir</button>
        <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
      </span>
    </div>
  )
}
