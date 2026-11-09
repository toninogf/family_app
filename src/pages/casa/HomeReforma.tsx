import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parsePrice, price, priceInput, uploadDocFiles, type Home, type Mudanza } from '../../lib/mudanza'
import {
  DEFAULT_CONTINGENCY, GROUP_LABEL, IN_INTEGRAL, PARTIDA, PARTIDAS, REFORM_STATE, STATE_ITEMS, TIER, UNIT_LABEL,
  itemCost, rangeK, readyPrice, reformKnown, reformTotal, suggestions,
  type Reform, type ReformItem, type ReformState, type Tier
} from '../../lib/reforma'
import { Sheet, TextArea } from '../../components/Sheet'
import DocFiles from '../../components/DocFiles'

const STATES = Object.keys(REFORM_STATE) as ReformState[]

/** Bloque «Reforma» de la ficha: estado, coste estimado y precio para entrar a vivir */
export function HomeReforma({ h, m, householdId }: { h: Home; m: Mudanza; householdId: string }) {
  const [open, setOpen] = useState(false)
  const r = h.reform ?? {}
  const total = reformTotal(r, h)
  const known = reformKnown(r)
  const ready = readyPrice(h)

  async function quick(state: ReformState) {
    const items = STATE_ITEMS[state].map(k => ({ k, src: 'auto' as const }))
    await m.write('homes', { reform: { ...r, state, items: r.items?.length ? r.items : items } }, h.id)
    if (state !== 'listo') setOpen(true)
  }

  return (
    <section className="bg-card rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <span className="font-bold text-[15px]">🔨 Reforma</span>
        {known && <button onClick={() => setOpen(true)} aria-label="Editar la reforma" className="min-h-9 px-2 text-sm">✏️</button>}
      </div>
      {!known ? (
        <>
          <p className="text-[13px] text-muted">¿Cómo está para entrar a vivir? Elige y ajusta las partidas: el coste se suma al precio para comparar todas igual.</p>
          <div className="grid grid-cols-2 gap-2">
            {STATES.map(s => (
              <button key={s} onClick={() => quick(s)} className="min-h-12 px-2 rounded-xl border border-line text-[13px] font-semibold text-left">
                {REFORM_STATE[s].icon} {REFORM_STATE[s].label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={() => setOpen(true)} className="text-left flex flex-col gap-1">
          <span className="text-[14px] font-semibold">
            {r.state ? `${REFORM_STATE[r.state].icon} ${REFORM_STATE[r.state].label}` : '🔨 Con reforma'}
            {total ? <span className="text-muted font-normal"> · {total.count} partida{total.count === 1 ? '' : 's'}{total.quoted ? ` (${total.quoted} presupuestada${total.quoted === 1 ? '' : 's'})` : ''}</span> : null}
          </span>
          {total && <span className="text-[13px]">Coste estimado: <b>{rangeK(total.lo, total.hi)}</b></span>}
          {ready != null && (
            <span className="text-[13px] rounded-xl bg-bg px-3 py-2 mt-1 flex justify-between gap-2">
              <span className="text-muted">Para entrar a vivir</span>
              <b>{price(ready)}</b>
            </span>
          )}
          {total?.pending.length ? <span className="text-[12px] text-[#C77A12]">Faltan metros u otros datos para calcular: {total.pending.join(', ')}</span> : null}
          {(r.items ?? []).some(i => i.src === 'ia') && <span className="text-[12px] text-muted">✨ Hay partidas propuestas por la IA: revísalas tras la visita.</span>}
        </button>
      )}
      {open && <ReformaSheet h={h} m={m} householdId={householdId} onClose={() => setOpen(false)} />}
    </section>
  )
}

const SRC_LABEL: Record<string, string> = { ia: '✨ IA', auto: 'propuesta', visita: '👀 visita', manual: '' }

function ReformaSheet({ h, m, householdId, onClose }: { h: Home; m: Mudanza; householdId: string; onClose: () => void }) {
  const live = () => m.homes.find(x => x.id === h.id) ?? h
  const [r, setR] = useState<Reform>(() => ({ ...(h.reform ?? {}) }))
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = r.items ?? []
  const total = reformTotal(r, h)
  const sugg = suggestions({ ...h, reform: r })
  const integral = items.some(i => i.k === 'integral')
  const ready = h.price_cents != null ? h.price_cents + (total?.mid ?? 0) : null

  const setItems = (next: ReformItem[]) => setR(x => ({ ...x, items: next }))
  const patch = (k: string, p: Partial<ReformItem>) => setItems(items.map(i => (i.k === k ? clean({ ...i, ...p }) : i)))
  const add = (k: string, src: ReformItem['src'] = 'manual') => {
    if (items.some(i => i.k === k)) return
    setItems([...items, { k, src }])
    setR(x => ({ ...x, state: x.state === 'listo' || !x.state ? (k === 'integral' ? 'integral' : 'parcial') : x.state }))
  }
  const remove = (k: string) => setItems(items.filter(i => i.k !== k))

  async function write(next: Reform) {
    const err = await m.write('homes', { reform: next }, h.id)
    if (err) setError(err)
    return err
  }
  async function save() {
    setBusy(true)
    const err = await write({ ...r, items: (r.items ?? []).slice(0, 40) })
    setBusy(false)
    if (!err) onClose()
  }

  return (
    <Sheet title="Reforma" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-muted mb-1.5">Estado para entrar a vivir</legend>
          <div className="grid grid-cols-2 gap-2">
            {STATES.map(s => (
              <button type="button" key={s} aria-pressed={r.state === s}
                onClick={() => setR(x => ({ ...x, state: s, items: x.items?.length || s === 'listo' ? x.items : STATE_ITEMS[s].map(k => ({ k, src: 'auto' as const })) }))}
                className={`min-h-12 px-2 rounded-xl border text-[13px] font-semibold text-left ${r.state === s ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>
                {REFORM_STATE[s].icon} {REFORM_STATE[s].label}
                <span className={`block text-[11px] font-normal ${r.state === s ? 'opacity-80' : 'text-muted'}`}>{REFORM_STATE[s].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {r.state === 'listo' && items.length > 0 && <p className="text-[13px] text-muted -mt-3">Con «Para entrar a vivir» las partidas no se suman (se guardan por si cambias de idea).</p>}

        {r.state !== 'listo' && (
          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-[15px]">Partidas</h3>
            {items.length === 0 && <p className="text-[13px] text-muted">Añade lo que haya que hacer. Las cantidades salen de los metros, baños y habitaciones del piso.</p>}
            {items.map(it => {
              const p = PARTIDA[it.k]
              const c = itemCost(it, h)
              const included = integral && IN_INTEGRAL.includes(it.k)
              const isOpen = openItem === it.k
              return (
                <div key={it.k} className={`rounded-2xl border border-line ${included ? 'opacity-60' : ''}`}>
                  <button type="button" onClick={() => setOpenItem(isOpen ? null : it.k)} aria-expanded={isOpen} className="w-full min-h-12 px-3 py-2 flex items-center gap-2 text-left">
                    <span aria-hidden="true">{p?.icon ?? '➕'}</span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[14px] font-semibold truncate">{it.k === 'otros' ? it.label || 'Otra cosa' : p?.label ?? it.k}</span>
                      <span className="text-[12px] text-muted truncate">
                        {included ? 'Incluido en la integral' : [
                          c.q != null && p && p.unit !== 'global' && it.own_cents == null && it.quote_cents == null ? `${c.q.toLocaleString('es-ES')} ${UNIT_LABEL[p.unit]}` : null,
                          it.quote_cents != null ? '✔ presupuestado' : it.own_cents != null ? 'precio vuestro' : `gama ${TIER[it.tier ?? 'media'].label.toLowerCase()}`,
                          SRC_LABEL[it.src ?? 'manual'] || null,
                          it.files?.length ? `📄${it.files.length}` : null
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold shrink-0">{included ? '—' : c.q == null && !c.fixed ? '¿?' : rangeK(c.lo, c.hi)}</span>
                    <span className="text-muted" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && (
                    <ItemEditor it={it} h={h} householdId={householdId}
                      onChange={p2 => patch(it.k, p2)} onRemove={() => { remove(it.k); setOpenItem(null) }}
                      onFiles={async files => {
                        const next = { ...r, items: items.map(i => (i.k === it.k ? { ...i, files } : i)) }
                        setR(next)
                        await write(next)
                      }} />
                  )}
                </div>
              )
            })}

            {sugg.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                <span className="text-[13px] font-semibold text-muted">💡 Sugerencias por el año, el certificado y la calefacción</span>
                {sugg.map(s => (
                  <button type="button" key={s.k} onClick={() => add(s.k, 'auto')} className="min-h-11 px-3 rounded-xl border border-dashed border-line text-left text-[13px]">
                    <b>+ {PARTIDA[s.k].icon} {PARTIDA[s.k].label}</b> <span className="text-muted">· {s.why}</span>
                  </button>
                ))}
              </div>
            )}

            {adding ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                {(['interior', 'instalaciones', 'exterior', 'otros'] as const).map(g => {
                  const opts = PARTIDAS.filter(p => p.group === g && !items.some(i => i.k === p.k))
                  if (!opts.length) return null
                  return (
                    <div key={g} className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold">{GROUP_LABEL[g]}</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {opts.map(p => (
                          <button type="button" key={p.k} onClick={() => { add(p.k); setAdding(false); if (p.k === 'otros') setOpenItem('otros') }}
                            className="min-h-10 px-3 rounded-xl border border-line bg-card text-[13px] font-semibold">{p.icon} {p.label}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <button type="button" onClick={() => setAdding(false)} className="self-end min-h-10 px-3 text-sm text-muted">Cerrar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-xl border border-line text-sm font-semibold text-accent">+ Añadir partida</button>
            )}
          </section>
        )}

        {r.state !== 'listo' && total && (
          <section className="rounded-2xl bg-card p-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]"><span className="text-muted">Obra</span><span>{rangeK(total.works.lo, total.works.hi)}</span></div>
            {total.extras.map(e => <div key={e.label} className="flex justify-between text-[13px]"><span className="text-muted">{e.label}</span><span>{rangeK(e.lo, e.hi)}</span></div>)}
            <div className="flex justify-between text-[15px] font-bold border-t border-line pt-1.5"><span>Total reforma</span><span>{rangeK(total.lo, total.hi)}</span></div>
            {ready != null && <div className="flex justify-between text-[14px] font-semibold text-accent"><span>Para entrar a vivir (precio + reforma)</span><span>{price(ready)}</span></div>}
            <div className="flex gap-2 items-center flex-wrap mt-1">
              <label className="flex items-center gap-1.5 text-[13px]">
                <span className="text-muted">Imprevistos</span>
                <select value={r.contingency ?? DEFAULT_CONTINGENCY} onChange={e => setR(x => ({ ...x, contingency: Number(e.target.value) }))} className="min-h-10 px-2 rounded-lg border border-line bg-card text-[14px]">
                  {[0, 5, 10, 15, 20].map(v => <option key={v} value={v}>{v} %</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[13px] min-h-10">
                <input type="checkbox" checked={!r.no_vat} onChange={e => setR(x => ({ ...x, no_vat: !e.target.checked || undefined }))} className="w-5 h-5" />
                <span>Sumar IVA (10 %)</span>
              </label>
            </div>
            <p className="text-[11px] text-muted">Precios orientativos de gama media en Madrid (2026). Un presupuesto real manda sobre la estimación; ponlo ya con IVA.</p>
          </section>
        )}

        <TextArea label="Notas" value={r.note ?? ''} onChange={e => setR(x => ({ ...x, note: e.target.value.slice(0, 600) || undefined }))} maxLength={600} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          {reformKnown(live().reform) && (
            <button type="button" onClick={async () => { if (!(await write({}))) onClose() }} className="min-h-12 px-4 rounded-xl border border-line text-sm font-semibold text-danger">Borrar</button>
          )}
          <button type="button" onClick={save} disabled={busy} className="flex-1 py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </Sheet>
  )
}

/** Quita las claves vacías (para que la validación no se queje) */
function clean(i: ReformItem): ReformItem {
  const o = { ...i } as Record<string, unknown>
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k]
  return o as ReformItem
}

function ItemEditor({ it, h, householdId, onChange, onRemove, onFiles }: {
  it: ReformItem; h: Home; householdId: string
  onChange: (p: Partial<ReformItem>) => void; onRemove: () => void; onFiles: (files: NonNullable<ReformItem['files']>) => Promise<void>
}) {
  const p = PARTIDA[it.k]
  const auto = p?.auto(h)
  const [q, setQ] = useState(it.q != null ? String(it.q) : '')
  const [own, setOwn] = useState(priceInput(it.own_cents))
  const [quote, setQuote] = useState(priceInput(it.quote_cents))
  const files = it.files ?? []
  const money = (v: string) => (v.trim() ? parsePrice(v) ?? undefined : undefined)

  return (
    <div className="px-3 pb-3 flex flex-col gap-3">
      {it.k === 'otros' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Qué es</span>
          <input value={it.label ?? ''} onChange={e => onChange({ label: e.target.value.slice(0, 80) || undefined })} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]" />
        </label>
      )}
      {p && p.unit !== 'global' && it.k !== 'otros' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Cantidad ({UNIT_LABEL[p.unit]})</span>
          <input inputMode="decimal" value={q} placeholder={auto != null ? `${auto} (calculado)` : 'Falta el dato'}
            onChange={e => { setQ(e.target.value); const n = Number(e.target.value.replace(',', '.')); onChange({ q: e.target.value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined }) }}
            className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]" />
        </label>
      )}
      {it.k !== 'otros' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Gama</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(TIER) as Tier[]).map(t => (
              <button type="button" key={t} aria-pressed={(it.tier ?? 'media') === t} onClick={() => onChange({ tier: t === 'media' ? undefined : t })}
                className={`min-h-10 rounded-xl border text-[13px] font-semibold ${(it.tier ?? 'media') === t ? 'bg-ink text-bg border-ink' : 'bg-card border-line'}`}>{TIER[t].label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-sm font-medium text-muted truncate">Precio vuestro (€)</span>
          <input inputMode="decimal" value={own} placeholder="Opcional" onChange={e => { setOwn(e.target.value); onChange({ own_cents: money(e.target.value) }) }}
            className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]" />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-sm font-medium text-muted truncate">Presupuesto real (€)</span>
          <input inputMode="decimal" value={quote} placeholder="Con IVA" onChange={e => { setQuote(e.target.value); onChange({ quote_cents: money(e.target.value) }) }}
            className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Nota</span>
        <input value={it.n ?? ''} onChange={e => onChange({ n: e.target.value.slice(0, 300) || undefined })} placeholder="Ej. reformista Pérez, incluye derribo" className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]" />
      </label>
      <label className="flex items-center gap-2 text-[13px] min-h-10">
        <input type="checkbox" checked={it.src === 'visita'} onChange={e => onChange({ src: e.target.checked ? 'visita' : 'manual' })} className="w-5 h-5" />
        <span>Confirmado en la visita</span>
      </label>
      <DocFiles files={files}
        onAdd={async (list, onProgress) => {
          const { added, error } = await uploadDocFiles(`${householdId}/pisos/${h.id}`, list, 10 - files.length, onProgress)
          if (added.length) await onFiles([...files, ...added])
          return error
        }}
        onRemove={async f => {
          await supabase.storage.from('sale-docs').remove([f.path])
          await onFiles(files.filter(x => x.path !== f.path))
        }} />
      <button type="button" onClick={onRemove} className="self-start min-h-10 px-3 rounded-xl border border-line text-sm font-semibold text-danger">Quitar partida</button>
    </div>
  )
}
