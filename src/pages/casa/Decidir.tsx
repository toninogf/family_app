// «🏁 Decidir»: las finalistas (⭐ favoritas y con oferta) para elegir entre ellas.
// Veredicto con el porqué, vuestras notas (y dónde no coincidís), si entra en el bolsillo, lo que la descarta y lo que falta antes de ofertar.
import { useMemo, useState } from 'react'
import type { Member } from '../../lib/supabase'
import { HOME_STATUS, price, type Home, type Mudanza } from '../../lib/mudanza'
import { finalists, headToHead, pickFinalists, verdict, type DecideCtx, type Finalist } from '../../lib/decide'
import { fmtScore, scoreTone, SCORE_BLOCKS } from '../../lib/score'
import { shortName } from '../../lib/compare'
import { readyPrice } from '../../lib/reforma'
import { recommend } from '../../lib/pricing'
import { AFFORD_ICON, affordBase, affordHome, type Finance } from '../../lib/afford'
import { useSchoolSummaries } from './HomeSchools'
import { VerdictChip } from './DeepAnalysis'
import { Sheet } from '../../components/Sheet'

const Rich = ({ text }: { text: string }) => <>{text.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>
const rTone = (s: number) => (s >= 8 ? 'bg-[#1F8A4C]' : s >= 6 ? 'bg-[#7BAE3F]' : s >= 5 ? 'bg-[#E0A21B]' : 'bg-[#C8452F]')

export function useDecideCtx(m: Mudanza, members: Member[], homes: Home[]): DecideCtx {
  const schools = useSchoolSummaries(homes)
  const adults = members.filter(x => x.kind === 'adult').map(a => ({ id: a.id, name: a.display_name }))
  const schoolDist = Object.fromEntries(Object.entries(schools).map(([id, s]) => [id, s ? (s.pubPri ?? s.closest)?.dist ?? null : null]))
  return { criteria: m.criteria, ratings: m.ratings, homes: m.homes, homeVisits: m.homeVisits, offers: m.offers, listing: m.listing, adults, schoolDist }
}

/** Botón de Buscamos: solo aparece si hay al menos 2 candidatas */
export function DecideButton({ m, members, onOpen }: { m: Mudanza; members: Member[]; onOpen: () => void }) {
  const ctx = useDecideCtx(m, members, [])
  const n = useMemo(() => pickFinalists(m.homes, ctx).length, [m.homes, m.ratings, m.criteria]) // eslint-disable-line react-hooks/exhaustive-deps
  if (n < 2) return null
  const fav = m.homes.filter(h => h.status === 'favorito' || h.status === 'oferta').length
  return (
    <button onClick={onOpen} className="rounded-2xl bg-card px-4 py-3 text-left flex items-center gap-2">
      <span className="text-[20px]" aria-hidden="true">🏁</span>
      <span className="flex-1 text-[14px]"><b>Decidir</b> entre {n} finalistas<span className="text-muted">{fav >= 2 ? ' (⭐ favoritas)' : ' (las mejores visitadas; marcad ⭐ las vuestras)'}</span></span>
      <span className="text-accent font-semibold" aria-hidden="true">›</span>
    </button>
  )
}

export function DecideSheet({ m, members, onOpenHome, onClose }: { m: Mudanza; members: Member[]; onOpenHome: (id: string) => void; onClose: () => void }) {
  const [extra, setExtra] = useState<string[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const base = useDecideCtx(m, members, m.homes.filter(h => !['descartado', 'propuesta', 'fuera'].includes(h.status)))
  const auto = pickFinalists(m.homes, base)
  const homes = [...auto, ...m.homes.filter(h => extra.includes(h.id) && !auto.includes(h))].filter(h => !removed.includes(h.id))
  const fs = finalists(homes, base)
  const lines = verdict(fs, shortName)
  const fin = (m.criteria?.finance ?? null) as Finance | null
  const b = affordBase(m, fin)
  const others = m.homes.filter(h => !homes.includes(h) && !['descartado', 'propuesta', 'fuera'].includes(h.status))

  async function star(h: Home) {
    if (h.status === 'oferta') return // con oferta hecha sigue siendo finalista
    const seen = m.homeVisits.some(v => v.home_id === h.id && v.status === 'done')
    await m.write('homes', { status: h.status === 'favorito' ? (seen ? 'visitado' : 'interesa') : 'favorito' }, h.id)
  }

  return (
    <Sheet title="🏁 Decidir" onClose={onClose} variant="wide">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-accent-soft p-4 flex flex-col gap-1.5">
          <span className="font-bold text-[15px]">Veredicto</span>
          {lines.map((t, i) => <p key={i} className="text-[14px] leading-snug"><Rich text={t} /></p>)}
          <p className="text-[12px] text-muted">Sale de la nota de cada casa (con vuestros pesos). Vuestra opinión ya cuenta dentro de ella.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {fs.map((f, i) => (
            <FinalistCard key={f.h.id} f={f} rank={i + 1} rival={fs[i === 0 ? 1 : 0]} m={m} b={b}
              onOpen={() => onOpenHome(f.h.id)} onStar={() => void star(f.h)} onRemove={() => setRemoved(r => [...r, f.h.id])} />
          ))}
        </div>

        {(others.length > 0 || removed.length > 0) && (
          <details className="rounded-2xl bg-card p-3">
            <summary className="cursor-pointer text-[14px] font-semibold">➕ Añadir otra casa a la comparación</summary>
            <div className="flex flex-col mt-2">
              {[...m.homes.filter(h => removed.includes(h.id)), ...others].map(h => (
                <button key={h.id} onClick={() => { setRemoved(r => r.filter(x => x !== h.id)); setExtra(e => [...e, h.id]) }}
                  className="min-h-11 text-left text-[14px] flex items-center gap-2 border-t border-line first:border-0">
                  <span className="flex-1 min-w-0 truncate">{shortName(h)}</span>
                  <span className="text-muted text-[12px]">{HOME_STATUS[h.status]}</span>
                  <span className="text-accent font-semibold">＋</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </Sheet>
  )
}

function FinalistCard({ f, rank, rival, m, b, onOpen, onStar, onRemove }: {
  f: Finalist; rank: number; rival?: Finalist; m: Mudanza; b: ReturnType<typeof affordBase>
  onOpen: () => void; onStar: () => void; onRemove: () => void
}) {
  const h = f.h
  const rec = recommend(h, m.homes)
  const af = h.price_cents ? affordHome(b, h, h.price_cents) : null
  const afTop = rec && rec.max < (h.price_cents ?? 0) ? affordHome(b, h, rec.max) : null
  const vs = rival ? headToHead(f, rival) : null
  const label = (k: string) => SCORE_BLOCKS.find(x => x.k === k)?.label.toLowerCase() ?? k
  return (
    <div className={`rounded-2xl bg-card p-4 flex flex-col gap-3 ${rank === 1 ? 'ring-2 ring-[var(--app-accent)]' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[18px] font-bold ${scoreTone(f.score.score)}`}>{fmtScore(f.score.score)}{f.score.provisional ? '*' : ''}</span>
        <div className="flex-1 min-w-0 flex flex-col">
          <button onClick={onOpen} className="text-left font-bold text-[15px] leading-tight">{rank}. {shortName(h)} ›</button>
          <span className="text-[12px] text-muted">{HOME_STATUS[h.status]} · {price(h.price_cents)}</span>
        </div>
        <button onClick={onStar} aria-label={h.status === 'favorito' ? 'Quitar de favoritas' : 'Marcar como favorita'} aria-pressed={h.status === 'favorito'}
          className="min-w-11 min-h-11 text-[20px]">{h.status === 'favorito' || h.status === 'oferta' ? '⭐' : '☆'}</button>
      </div>

      {/* Bloques de la nota en barras */}
      <div className="flex flex-col gap-1">
        {f.score.blocks.filter(x => x.weight > 0).map(x => (
          <div key={x.k} className="flex items-center gap-2 text-[12px]">
            <span className="w-28 shrink-0 truncate">{x.icon} {x.label}</span>
            <span className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
              {!x.missing && <span className={`block h-full ${scoreTone(x.score).split(' ')[0]}`} style={{ width: `${x.score * 10}%` }} />}
            </span>
            <span className="w-8 text-right tabular-nums">{x.missing ? '—' : fmtScore(x.score)}</span>
          </div>
        ))}
      </div>
      {vs && (vs.wins.length > 0 || vs.loses.length > 0) && (
        <p className="text-[13px] leading-snug">
          {vs.wins.length > 0 && <>👍 Mejor que {shortName(rival!.h)} en {vs.wins.map(label).join(', ')}. </>}
          {vs.loses.length > 0 && <>👎 Peor en {vs.loses.map(label).join(', ')}.</>}
        </p>
      )}

      {/* Vuestras notas */}
      <div className="flex flex-wrap gap-2 items-center text-[13px]">
        {f.ratings.map(r => (
          <span key={r.id}>{r.name}: {r.score != null ? <span className={`inline-block px-1.5 rounded-md text-white font-bold ${rTone(r.score)}`}>{r.score}</span> : <span className="text-muted">sin nota</span>}</span>
        ))}
        {f.gap != null && f.gap >= 2 && <span className="text-[#C77A12] font-semibold">🗣️ {f.gap} puntos de diferencia: habladlo</span>}
        <VerdictChip h={h} />
      </div>

      {/* Dinero */}
      <div className="rounded-xl bg-bg p-3 flex flex-col gap-1 text-[13px]">
        <span>🔑 Para entrar a vivir: <b>{price(readyPrice(h))}</b></span>
        {rec && <span>💬 Oferta: abrir en <b>{price(rec.open)}</b>, tope <b>{price(rec.max)}</b> <span className="text-muted">(fiabilidad {rec.confidence})</span></span>}
        {af
          ? <span>{AFFORD_ICON[af.status]} Al precio pedido {af.status === 'ok' ? 'entra' : af.status === 'justo' ? 'entra justo' : 'no entra'}{af.cuota ? `: cuota ${price(af.cuota)}/mes` : ''}{af.why ? ` · ${af.why}` : ''}</span>
          : <span className="text-muted">🧮 Rellenad «¿Hasta dónde podemos llegar?» para saber si entra.</span>}
        {afTop && af?.status !== 'ok' && <span>{AFFORD_ICON[afTop.status]} Al tope de oferta: {afTop.status === 'no' ? 'tampoco entra' : afTop.status === 'justo' ? 'entra justo' : 'entra'}{afTop.cuota ? ` (cuota ${price(afTop.cuota)}/mes)` : ''}</span>}
      </div>

      {f.problems.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">⛔ En contra</span>
          {f.problems.map(p => <span key={p} className="text-[13px] text-muted">· {p}</span>)}
        </div>
      )}
      {f.todo.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">📋 Antes de ofertar</span>
          {f.todo.map(p => <span key={p} className="text-[13px] text-muted">· {p}</span>)}
        </div>
      ) : <span className="text-[13px] text-[#1F8A4C] font-semibold">✅ Todo revisado: lista para ofertar</span>}

      <div className="flex gap-2">
        <button onClick={onOpen} className="min-h-11 px-4 rounded-xl border border-line text-accent text-sm font-semibold">Ver ficha</button>
        <button onClick={onRemove} className="min-h-11 px-3 text-sm text-muted">Quitar de aquí</button>
      </div>
    </div>
  )
}
