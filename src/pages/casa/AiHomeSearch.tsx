// «🔎 Buscar casas con IA» en Buscamos: la petición va con vuestros criterios, pegáis la respuesta, revisáis y entran como «🤖 Propuesta»
import { useState } from 'react'
import { MUNICIPALITIES, fold } from '../../data/places'
import { locateHome } from '../../lib/geo'
import { homeSearchPrompt, parseHomeSearch, type HomeDraft } from '../../lib/homeSearch'
import { mustHaveCheck, price, type Home, type Mudanza } from '../../lib/mudanza'
import { kEur, readyPrice } from '../../lib/reforma'
import { sameUrl } from '../../lib/venta'
import { today } from '../../lib/dates'

const MADRID = new Set((MUNICIPALITIES['28'] ?? []).map(p => fold(p.name)))

/** El borrador como si fuera una ficha, para calcular «para entrar a vivir» y los imprescindibles */
function asHome(d: HomeDraft): Home {
  return {
    ...d, status: 'propuesta', links: [], health: {}, reform: d.reform_state ? { state: d.reform_state, items: d.reform_items.map(k => ({ k, src: 'ia' as const })) } : {},
    province: d.municipality && MADRID.has(fold(d.municipality)) ? 'Madrid' : null, new_build: false, ref_value_cents: null
  } as unknown as Home
}

export function AiHomeSearch({ m, householdId }: { m: Mudanza; householdId: string }) {
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState('')
  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  const [items, setItems] = useState<HomeDraft[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const c = m.criteria

  // ¿Ya la tenemos o la rechazamos? (por enlace)
  const known = (d: HomeDraft): string | null => {
    if (!d.url) return null
    const h = m.homes.find(x => sameUrl(x.url, d.url) || x.links.some(l => sameUrl(l.url, d.url)))
    if (h) return `Ya la tenéis (${h.title})`
    if (m.rejections.some(r => sameUrl(r.url, d.url))) return 'La rechazasteis'
    return null
  }

  async function ask(ai: 'chatgpt' | 'gemini' | 'claude') {
    const prompt = homeSearchPrompt(c, m.homes, m.rejections, extra)
    let copied = true
    try { await navigator.clipboard.writeText(prompt) } catch { copied = false }
    const q = prompt.length < 6000 ? encodeURIComponent(prompt) : ''
    const target = ai === 'chatgpt' ? `https://chatgpt.com/${q ? `?q=${q}` : ''}` : ai === 'claude' ? `https://claude.ai/new${q ? `?q=${q}` : ''}` : 'https://gemini.google.com/app'
    setNote(copied ? `Petición copiada${q ? '' : ' (es larga: pégala tú en el chat)'}. Cuando conteste, copia su respuesta y pulsa «Pegar respuesta».` : 'No se ha podido copiar: dale permiso al portapapeles.')
    window.open(target, '_blank', 'noopener')
  }
  function load(t: string) {
    const r = parseHomeSearch(t)
    if (r.error) { setNote(r.error); setItems(null); return }
    setItems(r.items)
    // Por defecto, las nuevas (no las que ya tenéis o rechazasteis)
    setPicked(new Set(r.items.map((d, i) => [d, i] as const).filter(([d]) => !known(d)).map(([, i]) => i)))
    setNote(r.items.length ? `${r.items.length} casa${r.items.length > 1 ? 's' : ''} en la respuesta. Revisa y añade las que quieras.` : 'La respuesta no trae casas.')
  }
  async function paste() {
    try { const t = await navigator.clipboard.readText(); setText(t); load(t) } catch { setNote('No puedo leer el portapapeles: pega la respuesta en el recuadro.') }
  }
  async function add() {
    if (!items) return
    setBusy(true)
    let added = 0
    for (const [i, d] of items.entries()) {
      if (!picked.has(i)) continue
      const h = asHome(d)
      const notes = [`🤖 Búsqueda con IA (${today()})${d.published ? ` · anuncio del ${d.published}` : ''}`, d.note].filter(Boolean).join(': ')
      const r = await m.createHome({
        household_id: householdId, status: 'propuesta', title: d.title, url: d.url, price_cents: d.price_cents, size_m2: d.size_m2, useful_m2: d.useful_m2,
        plot_m2: d.plot_m2, rooms: d.rooms, baths: d.baths, year_built: d.year_built, municipality: d.municipality, province: h.province, zone: d.zone,
        address: d.address, floor: d.floor, features: d.features, heating_type: d.heating_type, cooling: d.cooling, energy: d.energy,
        advertiser: d.advertiser, agency: d.advertiser === 'particular' ? null : d.agency, listing_ref: d.listing_ref, contact_phone: d.contact_phone,
        notes: notes.slice(0, 2000), links: d.url ? [{ label: '', url: d.url, price_cents: d.price_cents }] : [],
        ...(d.reform_state ? { reform: h.reform } : {})
      })
      if (!r.error && r.id) {
        added++
        void locateHome(r.id, { address: d.address, zone: d.zone, municipality: d.municipality, province: h.province, maps_url: null })
      }
    }
    setBusy(false)
    setItems(null); setText('')
    setNote(`Hecho: ${added} casa${added === 1 ? '' : 's'} añadida${added === 1 ? '' : 's'} como «🤖 Propuesta».`)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-2xl border border-line p-3 text-left flex items-center gap-2">
        <span className="text-[20px]" aria-hidden="true">🔎</span>
        <span className="flex-1 text-[14px]"><b>Buscar casas con IA</b><span className="block text-[12px] text-muted">Con vuestros criterios; entran como propuesta para revisar</span></span>
        <span className="text-sm font-semibold text-accent">Abrir ›</span>
      </button>
    )
  }
  return (
    <section className="rounded-2xl bg-accent-soft p-3 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="font-bold text-[14px]">🔎 Buscar casas con IA</span>
        <button onClick={() => setOpen(false)} aria-label="Cerrar" className="min-h-9 px-2 text-muted">✕</button>
      </div>
      {!c && <p className="text-[12px] text-[#C77A12]">Rellena antes «Qué buscamos» (presupuesto, localidades, imprescindibles): la búsqueda sale de ahí.</p>}
      <input value={extra} onChange={e => setExtra(e.target.value)} maxLength={300} placeholder="Afinar solo esta búsqueda (opcional): «solo en Torrelodones», «parcela > 800 m²»…"
        className="w-full min-h-11 px-3 rounded-xl border border-line bg-card text-[14px]" />
      <div className="grid grid-cols-3 gap-2">
        {([['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude']] as const).map(([k, lb]) => (
          <button key={k} onClick={() => void ask(k)} className="min-h-10 rounded-xl border border-line bg-card text-sm font-semibold">{lb} ↗</button>
        ))}
      </div>
      <button onClick={() => void paste()} className="min-h-10 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold">📋 Pegar respuesta de la IA</button>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => text.trim() && load(text)} rows={2} placeholder="…o pégala aquí"
        className="w-full px-3 py-2 rounded-xl border border-line bg-card text-[14px]" />
      {note && <p role="status" className="text-[12px] text-muted">{note}</p>}

      {items && items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map((d, i) => {
            const h = asHome(d)
            const ready = readyPrice(h)
            const over = ready != null && c?.max_price_cents ? ready - c.max_price_cents : null
            const checks = mustHaveCheck(h, c)
            const fails = checks.filter(x => x.ok === false && !x.reform)
            const viaReform = checks.filter(x => x.ok === false && x.reform)
            const fit = !checks.length ? null : fails.length ? `🟡 Falla: ${fails.map(x => x.label.toLowerCase()).join(', ')}` : viaReform.length ? `🔨 Cumple con reforma (${viaReform.map(x => x.label.toLowerCase()).join(', ')})` : '✅ Cumple los imprescindibles'
            const dup = known(d)
            const on = picked.has(i)
            return (
              <label key={i} className={`rounded-xl bg-card p-3 flex gap-2 items-start ${dup ? 'opacity-60' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} className="w-5 h-5 mt-0.5 accent-[var(--app-accent)]" />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex justify-between gap-2 items-baseline">
                    <span className="font-semibold text-[14px] min-w-0 truncate">{d.title}</span>
                    <span className="font-bold shrink-0">{d.price_cents != null ? price(d.price_cents) : '—'}</span>
                  </span>
                  <span className="text-[12px] text-muted">
                    {[d.municipality, d.zone, d.size_m2 && `${d.size_m2} m²`, d.plot_m2 && `parcela ${d.plot_m2} m²`, d.rooms != null && `${d.rooms} hab.`, d.baths != null && `${d.baths} baños`, d.published && `anuncio ${d.published}`].filter(Boolean).join(' · ')}
                  </span>
                  {ready != null && (
                    <span className={`text-[12px] ${over != null && over > 0 ? 'text-danger' : ''}`}>
                      Para entrar a vivir ~{kEur(ready)}{over != null && over > 0 ? ` · se pasa ${kEur(over)}` : ''}{d.reform_state && d.reform_state !== 'listo' ? ` · reforma ${d.reform_state}${d.reform_items.length ? '' : ' (sin partidas: añádelas tras verla)'}` : ''}
                    </span>
                  )}
                  {fit && <span className="text-[12px]">{fit}</span>}
                  {d.note && <span className="text-[12px] text-muted">{d.note}</span>}
                  {dup && <span className="text-[12px] text-[#C77A12]">{dup}</span>}
                  {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="self-start text-[12px] font-semibold text-accent min-h-8 flex items-center">🔗 Ver anuncio ↗</a>}
                </span>
              </label>
            )
          })}
          <button disabled={busy || !picked.size} onClick={() => void add()} className="min-h-11 rounded-xl bg-accent text-white dark:text-bg text-sm font-semibold disabled:opacity-50">
            {busy ? 'Añadiendo…' : `Añadir ${picked.size} como propuesta${picked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </section>
  )
}
