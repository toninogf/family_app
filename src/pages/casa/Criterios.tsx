// «Qué buscamos»: tarjeta, formulario de criterios y pesos de la nota
import { useState, type FormEvent } from 'react'

import { CRITERIA_GROUPS, CRITERIA_BOXES, ACCESS_KEYS, critItems, criteriaLabel, parsePrice, priceInput, priceShort, type Mudanza } from '../../lib/mudanza'
import { Sheet, TextField } from '../../components/Sheet'
import Combobox from '../../components/Combobox'
import { DEFAULT_WEIGHTS, SCORE_BLOCKS, weightsOf, type ScoreKey, type ScoreWeights } from '../../lib/score'
import { FEATURE_ICON, GroupedChips } from '../../components/FormKit'
import { ALL_MUNICIPALITIES, Chip } from './BuscamosComun'

/** «Qué buscamos» en la portada: lo básico siempre a la vista y el detalle al desplegar */
export function CriteriaCard({ c, onEdit }: { c: Mudanza['criteria']; onEdit: () => void }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('buscamos.criterios') === '1' } catch { return false } })
  const toggle = () => setOpen(o => { try { localStorage.setItem('buscamos.criterios', o ? '0' : '1') } catch { /* sin almacenamiento */ } return !o })
  const nice = critItems(c?.nice_to_haves ?? [])
  const access = c?.access_items ?? []
  // Igual que «Cumple X de Y» de las fichas: presupuesto, habitaciones, metros, parcela y localidad también cuentan
  const mustN = c ? [c.max_price_cents, c.min_rooms, c.min_m2, c.min_plot_m2, c.municipalities?.length ? 1 : 0].filter(Boolean).length + critItems(c.must_haves).length : 0
  const has = c && (c.max_price_cents || c.min_rooms || c.min_m2 || c.min_plot_m2 || c.zones.length || c.municipalities?.length || c.must_haves.length || nice.length)
  if (!has) {
    return (
      <button onClick={onEdit} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1.5">
        <span className="flex justify-between items-baseline">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-sm text-accent font-semibold">Editar</span>
        </span>
        <span className="text-sm text-muted">Presupuesto, zonas, imprescindibles, lo que valoramos y accesibilidad. Cada piso marcará cuáles cumple.</span>
      </button>
    )
  }
  const basics = [
    c.max_price_cents ? `Hasta ${priceShort(c.max_price_cents)} para entrar a vivir` : null,
    c.min_rooms ? `${c.min_rooms}+ hab.` : null,
    c.min_m2 ? `${c.min_m2}+ m²` : null,
    c.min_plot_m2 ? `parcela ${c.min_plot_m2.toLocaleString('es-ES')}+ m²` : null
  ].filter(Boolean).join(' · ')
  const places = [...(c.municipalities ?? []), ...c.zones]
  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <button onClick={toggle} aria-expanded={open} className="flex-1 min-h-10 text-left flex items-center gap-2">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-muted" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <button onClick={onEdit} className="min-h-10 px-1 text-sm text-accent font-semibold">Editar</button>
      </div>
      <button onClick={toggle} className="text-left flex flex-col gap-1">
        {basics && <span className="text-[14px] font-semibold">{basics}</span>}
        {places.length > 0 && <span className="text-[13px] text-muted truncate">📍 {places.join(', ')}</span>}
        {!open && (mustN > 0 || nice.length > 0 || access.length > 0) && (
          <span className="flex gap-1.5 flex-wrap mt-0.5">
            {mustN > 0 && <Chip>🎯 {mustN} imprescindible{mustN === 1 ? '' : 's'}</Chip>}
            {nice.length > 0 && <Chip>⭐ {nice.length} que valoramos</Chip>}
            {access.length > 0 && <Chip>♿ {access.length} de accesibilidad</Chip>}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          {c.must_haves.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-muted">🎯 Imprescindibles</span>
              <span className="flex gap-1.5 flex-wrap">{c.must_haves.map(k => <Chip key={k}>{FEATURE_ICON[k] ? `${FEATURE_ICON[k]} ` : ''}{criteriaLabel(k)}</Chip>)}</span>
            </div>
          )}
          {nice.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-muted">⭐ Valoramos</span>
              <span className="flex gap-1.5 flex-wrap">{nice.map(k => <Chip key={k}>{FEATURE_ICON[k] ? `${FEATURE_ICON[k]} ` : ''}{criteriaLabel(k)}</Chip>)}</span>
            </div>
          )}
          {access.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-muted">♿ Accesibilidad</span>
              <span className="flex gap-1.5 flex-wrap">{access.map(k => <Chip key={k}>{FEATURE_ICON[k] ? `${FEATURE_ICON[k]} ` : ''}{criteriaLabel(k)}</Chip>)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export const SECTIONS = [
  { id: 'casa', title: 'La casa' }, { id: 'dinero', title: 'Gastos e impuestos' }, { id: 'zona', title: 'La zona' }, { id: 'contacto', title: 'Contacto' }
]

export function CriteriaSheet({ m, householdId, onClose }: { m: Mudanza; householdId: string; onClose: () => void }) {
  const c = m.criteria
  const [max, setMax] = useState(priceInput(c?.max_price_cents))
  const [rooms, setRooms] = useState(c?.min_rooms?.toString() ?? '')
  const [m2, setM2] = useState(c?.min_m2?.toString() ?? '')
  const [plotMin, setPlotMin] = useState(c?.min_plot_m2?.toString() ?? '')
  const [m2Ideal, setM2Ideal] = useState(c?.ideal_m2?.toString() ?? '')
  const [plotIdeal, setPlotIdeal] = useState(c?.ideal_plot_m2?.toString() ?? '')
  const [work, setWork] = useState(c?.work_address ?? '')
  const [zones, setZones] = useState((c?.zones ?? []).join(', '))
  const [towns, setTowns] = useState<string[]>(c?.municipalities ?? [])
  const [pick, setPick] = useState(0)
  const [must, setMust] = useState<string[]>(c?.must_haves ?? [])
  const [nice, setNice] = useState<string[]>(c?.nice_to_haves ?? [])
  const [access, setAccess] = useState<string[]>(c?.access_items ?? [])
  const [weights, setWeights] = useState(weightsOf(c))
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const maxCents = max.trim() ? parsePrice(max) : null
    if (max.trim() && !maxCents) { setError('El presupuesto no es válido'); return }
    const err = await m.write('search_criteria', {
      household_id: householdId, max_price_cents: maxCents,
      min_rooms: rooms.trim() ? parseInt(rooms, 10) : null, min_m2: m2.trim() ? parseInt(m2, 10) : null,
      min_plot_m2: plotMin.trim() ? parseInt(plotMin.replace(/\./g, ''), 10) || null : null,
      work_address: work.trim().slice(0, 200) || null,
      ideal_m2: m2Ideal.trim() ? parseInt(m2Ideal.replace(/\./g, ''), 10) || null : null,
      ideal_plot_m2: plotIdeal.trim() ? parseInt(plotIdeal.replace(/\./g, ''), 10) || null : null,
      zones: zones.split(',').map(z => z.trim()).filter(Boolean).slice(0, 15).map(z => z.slice(0, 40)), municipalities: towns, must_haves: must.slice(0, 20), nice_to_haves: nice.filter(k => !must.includes(k) && !ACCESS_KEYS.includes(k)).slice(0, 40), access_items: access.filter(k => !must.includes(k)).slice(0, 20), score_weights: weights
    }, undefined, 'household_id')
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title="Qué buscamos" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Presupuesto máximo para entrar a vivir (€)" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="Ej. 650.000" />
        <p className="text-[12px] text-muted -mt-3">Lo que os cuesta en total: precio + reforma + impuestos y gastos. Así todos los pisos se comparan igual.</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Habitaciones mín." inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <span />
          <TextField label="m² casa mín." inputMode="numeric" value={m2} onChange={e => setM2(e.target.value)} />
          <TextField label="m² casa ideal" inputMode="numeric" value={m2Ideal} onChange={e => setM2Ideal(e.target.value)} placeholder="Más ya no suma" />
          <TextField label="m² parcela mín." inputMode="numeric" value={plotMin} onChange={e => setPlotMin(e.target.value)} placeholder="Ej. 500" />
          <TextField label="m² parcela ideal" inputMode="numeric" value={plotIdeal} onChange={e => setPlotIdeal(e.target.value)} placeholder="Más ya no suma" />
        </div>
        <p className="text-[12px] text-muted -mt-3">Las habitaciones cuentan la buhardilla y el sótano habitable. Si falla por poco (menos de un 10 % en metros o parcela) penaliza la mitad. Entre el mínimo y lo ideal, la nota de «📐 Espacio» sube de 5 a 10.</p>
        <TextField label="💼 Dirección de mi trabajo (para los trayectos del análisis con IA)" value={work} onChange={e => setWork(e.target.value)} placeholder="Calle, número, Madrid" />
        <div className="flex flex-col gap-2">
          <Combobox key={pick} label="Localidades (Comunidad de Madrid)" value={null} options={ALL_MUNICIPALITIES.filter(x => !towns.includes(x))}
            onChange={v => { if (v) { setTowns(ts => (ts.includes(v) ? ts : [...ts, v])); setPick(p => p + 1) } }} placeholder="Añadir localidad…" />
          {towns.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {towns.map(x => (
                <button type="button" key={x} onClick={() => setTowns(towns.filter(y => y !== x))} className="min-h-9 px-3 rounded-full bg-ink text-bg text-[13px] font-semibold">
                  {x} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <TextField label="Zonas o barrios (separados por comas)" value={zones} onChange={e => setZones(e.target.value)} placeholder="Ej. Chamberí, Salamanca" />
        <details className="rounded-2xl border border-line p-3" open={must.length > 0}>
          <summary className="font-bold text-[15px] cursor-pointer">🎯 Imprescindibles{must.length ? ` · ${must.length}` : ''}</summary>
          <p className="text-[12px] text-muted mt-1 mb-2">Sin esto no nos interesa. Cada piso dirá si lo cumple.</p>
          <GroupedChips label="" groups={CRITERIA_GROUPS} labels={criteriaLabel} sets={CRITERIA_BOXES} value={must} onChange={v => { setMust(v); setNice(n => n.filter(k => !v.includes(k))) }} />
        </details>
        <details className="rounded-2xl border border-line p-3" open={nice.length > 0}>
          <summary className="font-bold text-[15px] cursor-pointer">⭐ Valoramos{nice.length ? ` · ${nice.length}` : ''}</summary>
          <p className="text-[12px] text-muted mt-1 mb-2">Suma puntos pero no descarta. Las opciones en un recuadro discontinuo se excluyen entre sí: cuentan como una sola.</p>
          <GroupedChips label="" groups={CRITERIA_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => !must.includes(k) && !ACCESS_KEYS.includes(k)) })).filter(g => g.keys.length)} labels={criteriaLabel} sets={CRITERIA_BOXES} value={nice} onChange={setNice} />
        </details>
        <details className="rounded-2xl border border-line p-3" open={access.length > 0}>
          <summary className="font-bold text-[15px] cursor-pointer">♿ Accesibilidad{access.length ? ` · ${access.length}` : ''}</summary>
          <p className="text-[12px] text-muted mt-1 mb-2">Puntúa en su propio bloque de la nota (con su importancia en los pesos). Cada cosa que la casa tiene suma por igual; si no la tiene marcada, no suma. «Todo en una planta» cumple también «dormitorio en planta baja». Si alguna es eliminatoria, márcala en Imprescindibles.</p>
          <GroupedChips label="" groups={[{ title: '', keys: ACCESS_KEYS.filter(k => !must.includes(k)) }]} labels={criteriaLabel} value={access} onChange={setAccess} counts={false} />
        </details>
        <WeightsEditor w={weights} onChange={setWeights} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
      </form>
    </Sheet>
  )
}

/** Pesos de la nota 0–10 («Qué buscamos») */
export function WeightsEditor({ w, onChange }: { w: ScoreWeights; onChange: (w: ScoreWeights) => void }) {
  const base = SCORE_BLOCKS.filter(b => b.k !== 'opinion')
  const sum = base.reduce((a, b) => a + w[b.k], 0)
  const share = (k: ScoreKey, withOp: boolean) => (sum ? w[k] / sum * (withOp ? 100 - w.opinion : 100) : 0)
  const changed = (Object.keys(DEFAULT_WEIGHTS) as (keyof ScoreWeights)[]).some(k => w[k] !== DEFAULT_WEIGHTS[k])
  const COLORS = ['#3D6FD8', '#1F8A4C', '#E0A21B', '#8E5BD6', '#D9662B', '#2BA3B8', '#C2457A']
  const IMP = ['No cuenta', 'Muy poco', 'Poco', 'Normal', 'Bastante', 'Mucho']
  const rule = (k: 'niceFull' | 'penalty' | 'opinion', label: string, help: string, shown: string, max: number, min = 0) => (
    <label key={k} className="flex flex-col gap-0.5">
      <span className="flex justify-between text-[14px]"><span className="font-semibold">{label}</span><span className="font-bold">{shown}</span></span>
      <input type="range" min={min} max={max} step={5} value={w[k]} onChange={e => onChange({ ...w, [k]: Number(e.target.value) })} className="w-full accent-[var(--app-accent)]" />
      <span className="text-[11px] text-muted">{help}</span>
    </label>
  )
  const bar = (withOp: boolean) => (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted">{withOp ? `Con vuestra nota (pesa ${w.opinion} %)` : 'Sin vuestra nota (casas aún no puntuadas)'}</span>
      <div className="flex h-5 rounded-full overflow-hidden bg-bg text-[10px] font-bold text-white">
        {base.map((b, i) => { const p = share(b.k, withOp); return p > 0 ? <span key={b.k} title={`${b.label} ${Math.round(p)} %`} style={{ width: `${p}%`, background: COLORS[i] }} className="flex items-center justify-center overflow-hidden">{p >= 9 ? `${Math.round(p)}%` : ''}</span> : null })}
        {withOp && w.opinion > 0 && <span style={{ width: `${w.opinion}%` }} className="bg-ink text-bg flex items-center justify-center">{w.opinion >= 9 ? `${w.opinion}%` : ''}</span>}
      </div>
    </div>
  )
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="font-bold text-[15px] cursor-pointer">⚖️ Cómo se calcula la nota 0–10</summary>
      <p className="text-[12px] text-muted mt-1 mb-3">Dale a cada parte su importancia (0 a 5). Abajo ves cuánto pesa de verdad en la nota: siempre suma 100 %.</p>
      <div className="flex flex-col gap-3">
        {base.map((b, i) => (
          <div key={b.k} className="flex flex-col gap-1">
            <span className="flex justify-between items-baseline gap-2 text-[14px]">
              <span className="font-semibold flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[i] }} />{b.icon} {b.label}</span>
              <span className="text-[12px] text-muted shrink-0">{IMP[w[b.k]]} · <b className="text-ink">{Math.round(share(b.k, false))} %</b></span>
            </span>
            <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={`Importancia de ${b.label}`}>
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={w[b.k] === n} onClick={() => onChange({ ...w, [b.k]: n })}
                  className={`h-9 rounded-lg text-[13px] font-bold ${w[b.k] === n ? 'bg-ink text-bg' : n <= w[b.k] ? 'bg-accent-soft' : 'bg-bg text-muted'}`}>{n}</button>
              ))}
            </div>
            <span className="text-[11px] text-muted">{b.help}</span>
          </div>
        ))}
        {rule('opinion', '👨‍👩‍👧‍👦 Vuestra opinión', 'Cuando habéis puntuado la casa (1 a 10), pesa este % fijo y lo demás se reparte el resto', `${w.opinion} %`, 60)}
        <div className="rounded-xl bg-bg p-2 flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Reparto real de la nota</span>
          {bar(false)}
          {bar(true)}
        </div>
        <span className="text-[13px] font-bold mt-1">📏 Reglas</span>
        {rule('niceFull', '⭐ Lo que valoráis: cuánto hace falta para un 10', 'No hace falta tenerlo todo: con este % de lo que valoráis ese bloque ya saca un 10', `${w.niceFull} %`, 100, 30)}
        {rule('penalty', '❌ Penalización por imprescindible', 'Lo que se quita a la nota por cada imprescindible que no cumple ni con reforma. Si falla por poco (menos de un 10 %), la mitad', `−${w.penalty} %`, 60)}
        {changed && <button type="button" onClick={() => onChange({ ...DEFAULT_WEIGHTS })} className="self-start min-h-9 px-3 rounded-xl border border-line text-sm font-semibold">Volver a los de serie</button>}
      </div>
    </details>
  )
}
