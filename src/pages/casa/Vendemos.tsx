import { useMemo, useState, type FormEvent } from 'react'
import type { Member } from '../../lib/supabase'
import { addDays, hhmm, longDate, parseISO, relativeDay, shortDate, startOfWeek, today } from '../../lib/dates'
import {
  FINANCING, INTEREST, INTEREST_COLOR, OBJECTION_PRESETS, OFFER_STATUS, PREP_ITEMS, SOURCES, VISIT_STATUS,
  parsePrice, price, priceInput,
  type BuyerOffer, type BuyerVisit, type Financing, type Interest, type Mudanza, type OfferStatus, type VisitStatus
} from '../../lib/mudanza'
import { Card } from '../../components/ui'
import { Choice, ConfirmDelete, Fab, Sheet, TextArea, TextField } from '../../components/Sheet'
import { MarketCompare, VentaFichaSheet, VentaPhotos, fichaLine } from './VentaFicha'
import { Fold, VentaCuentas, VentaDocs, VentaPasos, docAlert, docsSummary, saleNet, stepsSummary } from './VentaGestion'
import { DossierSheet } from './VentaDossier'

const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
const nameOf = (id: string | null, members: Member[]) => (id ? members.find(m => m.id === id)?.display_name ?? '' : '')

export default function Vendemos({ m, members, householdId }: { m: Mudanza; members: Member[]; householdId: string }) {
  const [visitSheet, setVisitSheet] = useState<{ open: boolean; visit?: BuyerVisit }>({ open: false })
  const [offerSheet, setOfferSheet] = useState<{ open: boolean; offer?: BuyerOffer }>({ open: false })
  const [listingOpen, setListingOpen] = useState(false)
  const [dossierOpen, setDossierOpen] = useState(false)
  const [fold, setFold] = useState<string | null>(null)
  const toggle = (k: string) => setFold(f => (f === k ? null : k))
  const [showPast, setShowPast] = useState(false)
  const t = today()
  const adults = members.filter(x => x.kind === 'adult')

  const upcoming = m.visits.filter(v => v.status === 'scheduled' && v.visit_date >= t)
  const pendingFeedback = m.visits.filter(v => v.status === 'scheduled' && v.visit_date < t)
  const past = m.visits.filter(v => v.status !== 'scheduled').slice().reverse()
  const done = m.visits.filter(v => v.status === 'done')

  const stats = useMemo(() => {
    const interest = { high: 0, medium: 0, low: 0 } as Record<Interest, number>
    const obj = new Map<string, number>()
    for (const v of done) {
      if (v.interest) interest[v.interest]++
      for (const o of v.objections) obj.set(o, (obj.get(o) ?? 0) + 1)
    }
    const thisWeek = startOfWeek(t)
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const ws = addDays(thisWeek, -7 * (5 - i))
      const we = addDays(ws, 6)
      return { ws, n: m.visits.filter(v => (v.status === 'done' || v.status === 'no_show') && v.visit_date >= ws && v.visit_date <= we).length }
    })
    return { interest, objections: [...obj.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), weeks }
  }, [done, m.visits, t])

  const asking = m.listing?.price_cents ?? null
  const activeOffers = m.offers.filter(o => o.status === 'pending' || o.status === 'countered')
  const net = saleNet(m)
  const docAlerts = m.saleDocs.map(d => ({ d, a: docAlert(d, t) })).filter((x): x is { d: typeof x.d; a: NonNullable<typeof x.a> } => !!x.a)
  const drop = m.prices.length > 1 && asking != null ? (() => {
    const first = m.prices[0].price_cents
    return { first, cents: first - asking, pct: Math.round(((first - asking) / first) * 1000) / 10 }
  })() : null

  return (
    <div className="flex flex-col gap-5">
      {/* Anuncio */}
      <button onClick={() => setListingOpen(true)} className="bg-accent text-white dark:text-bg rounded-2xl p-4 flex flex-col gap-1 text-left">
        <span className="text-[13px] opacity-85">{m.listing?.title || 'Nuestra casa en venta'}</span>
        <span className="text-[26px] font-bold leading-tight">{asking ? price(asking) : 'Pon el precio'}</span>
        {fichaLine(m.listing) && <span className="text-[13px] opacity-90">{fichaLine(m.listing)}</span>}
        <span className="text-[13px] opacity-85">
          {m.listing?.published_on
            ? `Publicado el ${shortDate(m.listing.published_on)} · ${daysBetween(m.listing.published_on, t)} días a la venta`
            : 'Toca para rellenar la ficha (desde el anuncio, con IA o capturas)'}
        </span>
        {drop && (
          <span className="text-[13px] opacity-90">
            {drop.cents > 0 ? `Bajado ${price(drop.cents)} (${drop.pct} %) desde ${price(drop.first)}` : `Subido ${price(-drop.cents)} desde ${price(drop.first)}`} · {m.prices.length - 1} cambio{m.prices.length > 2 ? 's' : ''}
          </span>
        )}
      </button>
      {m.listing && m.listing.links.length > 0 && (
        <div className="flex gap-1.5 flex-wrap -mt-2">
          {m.listing.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="min-h-9 px-3 rounded-full bg-card border border-line text-[13px] font-semibold text-accent flex items-center">
              {l.label || 'Anuncio'} ↗
            </a>
          ))}
        </div>
      )}
      {docAlerts.length > 0 && (
        <button onClick={() => setFold('docs')} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-0.5 ring-2 ring-danger">
          <span className="text-[13px] font-semibold text-danger">⚠️ Documentos por renovar</span>
          {docAlerts.map(({ d, a }) => <span key={d.id} className="text-[14px]">{d.title}: {a.text.toLowerCase()}</span>)}
        </button>
      )}
      <MarketCompare m={m} />

      {/* Gestión de la venta */}
      <div className="flex flex-col gap-2">
        <Fold title="🖼️ Fotos y capturas" summary={`${m.salePhotos.filter(p => p.kind === 'foto').length} fotos · ${m.salePhotos.filter(p => p.kind === 'anuncio').length} capturas del anuncio`} open={fold === 'fotos'} onToggle={() => toggle('fotos')}>
          <div className="bg-card rounded-2xl p-4 flex flex-col gap-4">
            <VentaPhotos m={m} householdId={householdId} kind="foto" />
            <VentaPhotos m={m} householdId={householdId} kind="anuncio" />
          </div>
        </Fold>
        <Fold title="📄 Documentos" summary={m.saleDocs.length ? docsSummary(m.saleDocs) : 'Nota simple, certificado energético, IBI…'} open={fold === 'docs'} onToggle={() => toggle('docs')}>
          <VentaDocs m={m} householdId={householdId} />
        </Fold>
        <Fold title="💶 ¿Cuánto nos queda?" summary={net.net != null ? `${price(net.net)} tras hipoteca y gastos` : 'Precio − hipoteca − gastos'} open={fold === 'cuentas'} onToggle={() => toggle('cuentas')}>
          <VentaCuentas m={m} householdId={householdId} />
        </Fold>
        <Fold title="✍️ Pasos hasta la firma" summary={stepsSummary(m.saleSteps)} open={fold === 'pasos'} onToggle={() => toggle('pasos')}>
          <VentaPasos m={m} />
        </Fold>
        <button onClick={() => setDossierOpen(true)} className="bg-card rounded-2xl p-4 flex justify-between items-center gap-2 text-left">
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">📤 Dossier para compradores</span>
            <span className="text-[13px] text-muted">PDF con ficha, fotos y certificado para WhatsApp</span>
          </span>
          <span className="text-muted text-lg" aria-hidden="true">›</span>
        </button>
      </div>

      {/* Resumen */}
      {m.visits.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat n={done.length} label="visitas hechas" />
            <Stat n={upcoming.length} label="próximas" />
            <Stat n={activeOffers.length} label={activeOffers.length === 1 ? 'oferta abierta' : 'ofertas abiertas'} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted">Visitas por semana</span>
            <div className="flex items-end gap-1.5 h-14" aria-label="Visitas en las últimas 6 semanas">
              {stats.weeks.map(w => {
                const max = Math.max(1, ...stats.weeks.map(x => x.n))
                return (
                  <div key={w.ws} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold">{w.n || ''}</span>
                    <div className="w-full rounded-md bg-accent" style={{ height: `${Math.max(3, (w.n / max) * 32)}px`, opacity: w.n ? 1 : 0.2 }} />
                    <span className="text-[10px] text-muted">{shortDate(w.ws).replace('.', '')}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {done.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-muted">Interés de los compradores</span>
              <div className="flex h-3 rounded-full overflow-hidden bg-bg">
                {(['high', 'medium', 'low'] as Interest[]).map(k => stats.interest[k] > 0 && (
                  <div key={k} style={{ flex: stats.interest[k], background: INTEREST_COLOR[k] }} />
                ))}
              </div>
              <div className="flex gap-3 text-[12px] text-muted">
                {(['high', 'medium', 'low'] as Interest[]).map(k => (
                  <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: INTEREST_COLOR[k] }} />{INTEREST[k]} {stats.interest[k]}</span>
                ))}
              </div>
            </div>
          )}

          {stats.objections.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-muted">Pegas que más se repiten</span>
              {stats.objections.map(([o, n]) => (
                <div key={o} className="flex items-center gap-2 text-[13px]">
                  <span className="w-32 shrink-0 truncate">{o}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-bg overflow-hidden">
                    <div className="h-full rounded-full bg-danger" style={{ width: `${(n / Math.max(1, done.length)) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-muted">{n}/{done.length}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Visitas */}
      {pendingFeedback.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">¿Cómo fueron?</h2>
          {pendingFeedback.map(v => <VisitRow key={v.id} v={v} members={members} onOpen={() => setVisitSheet({ open: true, visit: v })} highlight />)}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Próximas visitas</h2>
        {m.loading ? <p className="text-sm text-muted">Cargando…</p> : upcoming.length === 0
          ? <Card><p className="text-sm text-muted">No hay visitas previstas. Apúntalas con «+ Visita» y saldrán en la Agenda y en el aviso de la mañana.</p></Card>
          : upcoming.map(v => <VisitRow key={v.id} v={v} members={members} onOpen={() => setVisitSheet({ open: true, visit: v })} />)}
      </section>

      {/* Ofertas */}
      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold">Ofertas recibidas</h2>
          <button onClick={() => setOfferSheet({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Oferta</button>
        </div>
        {m.offers.length === 0
          ? <Card><p className="text-sm text-muted">Aún no hay ofertas.</p></Card>
          : m.offers.map(o => (
            <button key={o.id} onClick={() => setOfferSheet({ open: true, offer: o })} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1">
              <span className="flex justify-between items-baseline gap-2">
                <span className="text-[17px] font-bold">{price(o.amount_cents)}</span>
                <StatusPill status={o.status} />
              </span>
              <span className="text-[13px] text-muted">
                {o.buyer_name || 'Comprador'} · {shortDate(o.offer_date)} · {FINANCING[o.financing]}
                {asking ? ` · ${Math.round((o.amount_cents / asking - 1) * 1000) / 10}% sobre el precio` : ''}
              </span>
              {o.counter_cents && <span className="text-[13px]">Contraoferta: {price(o.counter_cents)}</span>}
              {o.response_deadline && (o.status === 'pending' || o.status === 'countered') && (
                <span className={`text-[13px] font-semibold ${o.response_deadline <= addDays(t, 1) ? 'text-danger' : 'text-accent'}`}>
                  Responder antes de: {relativeDay(o.response_deadline)}
                </span>
              )}
            </button>
          ))}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setShowPast(s => !s)} aria-expanded={showPast} className="min-h-10 text-sm font-semibold text-muted self-start">
            Visitas anteriores ({past.length}) {showPast ? '▾' : '▸'}
          </button>
          {showPast && past.map(v => <VisitRow key={v.id} v={v} members={members} onOpen={() => setVisitSheet({ open: true, visit: v })} />)}
        </section>
      )}

      <Fab label="Visita" onClick={() => setVisitSheet({ open: true })} />

      {visitSheet.open && (
        <VisitSheet visit={visitSheet.visit} adults={adults} m={m} onClose={() => setVisitSheet({ open: false })} />
      )}
      {offerSheet.open && (
        <OfferSheet offer={offerSheet.offer} visits={m.visits} asking={asking} m={m} onClose={() => setOfferSheet({ open: false })} />
      )}
      {listingOpen && <VentaFichaSheet m={m} householdId={householdId} onClose={() => setListingOpen(false)} />}
      {dossierOpen && <DossierSheet m={m} onClose={() => setDossierOpen(false)} />}
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[22px] font-bold">{n}</span>
      <span className="text-[11px] text-muted leading-tight">{label}</span>
    </div>
  )
}

export function StatusPill({ status }: { status: OfferStatus }) {
  const cls = status === 'accepted' ? 'bg-accent text-white dark:text-bg' : status === 'rejected' || status === 'withdrawn' ? 'bg-bg text-muted' : 'bg-accent-soft text-accent'
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cls}`}>{OFFER_STATUS[status]}</span>
}

function VisitRow({ v, members, onOpen, highlight }: { v: BuyerVisit; members: Member[]; onOpen: () => void; highlight?: boolean }) {
  const host = nameOf(v.host_id, members)
  return (
    <button onClick={onOpen} className={`bg-card rounded-2xl p-4 text-left flex flex-col gap-1 ${highlight ? 'ring-2 ring-accent' : ''}`}>
      <span className="flex justify-between items-baseline gap-2">
        <span className="text-[16px] font-bold">{v.contact_name || 'Comprador'}</span>
        <span className="text-sm font-semibold shrink-0">{relativeDay(v.visit_date)} · {hhmm(v.start_time)}</span>
      </span>
      <span className="text-[13px] text-muted">
        {[v.source && SOURCES[v.source], host && `Atiende ${host}`, v.status !== 'scheduled' && VISIT_STATUS[v.status]].filter(Boolean).join(' · ')}
      </span>
      {v.interest && (
        <span className="flex items-center gap-1.5 text-[13px]">
          <span className="w-2 h-2 rounded-full" style={{ background: INTEREST_COLOR[v.interest] }} />Interés {INTEREST[v.interest].toLowerCase()}
          {v.objections.length > 0 && <span className="text-muted">· {v.objections.join(', ')}</span>}
        </span>
      )}
      {highlight && <span className="text-[13px] font-semibold text-accent">Apunta qué les pareció</span>}
    </button>
  )
}

function VisitSheet({ visit, adults, m, onClose }: { visit?: BuyerVisit; adults: Member[]; m: Mudanza; onClose: () => void }) {
  const [date, setDate] = useState(visit?.visit_date ?? today())
  const [start, setStart] = useState(hhmm(visit?.start_time) || '18:00')
  const [end, setEnd] = useState(hhmm(visit?.end_time))
  const [name, setName] = useState(visit?.contact_name ?? '')
  const [phone, setPhone] = useState(visit?.contact_phone ?? '')
  const [source, setSource] = useState<string | null>(visit?.source ?? null)
  const [host, setHost] = useState<string | null>(visit?.host_id ?? null)
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? 'scheduled')
  const [interest, setInterest] = useState<Interest | null>(visit?.interest ?? null)
  const [objections, setObjections] = useState<string[]>(visit?.objections ?? [])
  const [custom, setCustom] = useState('')
  const [liked, setLiked] = useState(visit?.liked ?? '')
  const [notes, setNotes] = useState(visit?.notes ?? '')
  const [prep, setPrep] = useState<string[]>(visit?.prep_done ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const happened = date <= today()
  const allObjections = [...OBJECTION_PRESETS, ...objections.filter(o => !OBJECTION_PRESETS.includes(o))]

  async function togglePrep(item: string) {
    if (!visit) return
    const next = prep.includes(item) ? prep.filter(x => x !== item) : [...prep, item]
    setPrep(next)
    await m.write('buyer_visits', { prep_done: next }, visit.id)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end && end <= start) { setError('La hora de fin debe ser posterior a la de inicio'); return }
    if (phone && !/^[0-9 +().-]{3,30}$/.test(phone)) { setError('El teléfono solo puede llevar números, espacios y +'); return }
    setBusy(true); setError('')
    const err = await m.write('buyer_visits', {
      visit_date: date, start_time: start, end_time: end || null, contact_name: name.trim() || null, contact_phone: phone.trim() || null,
      source, host_id: host, status, interest: status === 'done' ? interest : null, objections: status === 'done' ? objections : [],
      liked: liked.trim() || null, notes: notes.trim() || null
    }, visit?.id)
    setBusy(false)
    if (err) setError(err); else onClose()
  }

  function addCustom() {
    const o = custom.trim().slice(0, 40)
    if (o && !objections.includes(o)) setObjections([...objections, o])
    setCustom('')
  }

  return (
    <Sheet title={visit ? (visit.contact_name || 'Visita de compradores') : 'Nueva visita de compradores'} onClose={onClose}>
      {visit && visit.status === 'scheduled' && visit.visit_date >= today() && (
        <div className="flex flex-col gap-2 bg-card rounded-2xl p-4">
          <h3 className="font-bold text-[15px]">Preparar la casa · {prep.length}/{PREP_ITEMS.length}</h3>
          {PREP_ITEMS.map(item => (
            <label key={item} className="flex items-center gap-3 min-h-10">
              <input type="checkbox" checked={prep.includes(item)} onChange={() => togglePrep(item)} className="w-5 h-5 accent-[var(--app-accent)]" />
              <span className={`text-[15px] ${prep.includes(item) ? 'line-through text-muted' : ''}`}>{item}</span>
            </label>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Día" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Hora" type="time" value={start} onChange={e => setStart(e.target.value)} required />
          <TextField label="Hasta" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <TextField label="Quién viene" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Ej. Pareja con un niño" />
        <div className="flex gap-2 items-end">
          <div className="flex-1"><TextField label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} /></div>
          {phone && /^[0-9 +().-]{3,30}$/.test(phone) && (
            <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="min-h-12 px-4 rounded-xl bg-accent-soft text-accent font-semibold flex items-center">Llamar</a>
          )}
        </div>
        <Choice<string | null> label="¿De dónde viene?" value={source} onChange={setSource}
          options={Object.entries(SOURCES).map(([value, label]) => ({ value: value as string | null, label }))} />
        <Choice<string | null> label="Quién la atiende" value={host} onChange={setHost}
          options={[...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color })), { value: null, label: 'Sin decidir' }]} />

        {(visit || happened) && (
          <div className="flex flex-col gap-5 bg-card rounded-2xl p-4">
            <h3 className="font-bold text-[15px]">Después de la visita</h3>
            <Choice<VisitStatus> label="¿Qué pasó?" value={status} onChange={setStatus}
              options={(Object.keys(VISIT_STATUS) as VisitStatus[]).map(k => ({ value: k, label: VISIT_STATUS[k] }))} />
            {status === 'done' && (
              <>
                <Choice<Interest | null> label="Interés" value={interest} onChange={setInterest}
                  options={(['high', 'medium', 'low'] as Interest[]).map(k => ({ value: k, label: INTEREST[k], color: INTEREST_COLOR[k] }))} />
                <fieldset className="flex flex-col">
                  <legend className="text-sm font-medium text-muted mb-1.5">Pegas que pusieron</legend>
                  <div className="flex gap-1.5 flex-wrap">
                    {allObjections.map(o => {
                      const on = objections.includes(o)
                      return (
                        <button type="button" key={o} aria-pressed={on} onClick={() => setObjections(on ? objections.filter(x => x !== o) : [...objections, o])}
                          className={`min-h-10 px-3 rounded-xl text-[13px] font-semibold border ${on ? 'bg-danger text-white dark:text-bg border-danger' : 'bg-bg border-line'}`}>{o}</button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input value={custom} onChange={e => setCustom(e.target.value)} maxLength={40} placeholder="Otra pega…"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                      className="flex-1 min-h-11 px-3 rounded-xl border border-line bg-bg text-[16px]" />
                    <button type="button" onClick={addCustom} disabled={!custom.trim()} className="min-h-11 px-3 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">Añadir</button>
                  </div>
                </fieldset>
                <TextArea label="Qué les gustó" value={liked} onChange={e => setLiked(e.target.value)} maxLength={500} />
              </>
            )}
          </div>
        )}
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : visit ? 'Guardar' : 'Apuntar visita'}
        </button>
        {visit && <ConfirmDelete label="Eliminar visita" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('buyer_visits', visit.id); onClose() }} />}
      </form>
      <p className="text-xs text-muted">La visita aparece sola en la Agenda y en el aviso de la mañana. Si la cancelas, desaparece.</p>
    </Sheet>
  )
}

function OfferSheet({ offer, visits, asking, m, onClose }: { offer?: BuyerOffer; visits: BuyerVisit[]; asking: number | null; m: Mudanza; onClose: () => void }) {
  const [amount, setAmount] = useState(priceInput(offer?.amount_cents))
  const [buyer, setBuyer] = useState(offer?.buyer_name ?? '')
  const [visitId, setVisitId] = useState<string | null>(offer?.visit_id ?? null)
  const [date, setDate] = useState(offer?.offer_date ?? today())
  const [financing, setFinancing] = useState<Financing>(offer?.financing ?? 'unknown')
  const [signing, setSigning] = useState(offer?.proposed_signing ?? '')
  const [deadline, setDeadline] = useState(offer?.response_deadline ?? '')
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? 'pending')
  const [counter, setCounter] = useState(priceInput(offer?.counter_cents))
  const [notes, setNotes] = useState(offer?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const cents = parsePrice(amount)
  const doneVisits = visits.filter(v => v.status === 'done').slice(-6).reverse()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cents) { setError('Escribe el importe de la oferta'); return }
    const counterCents = counter.trim() ? parsePrice(counter) : null
    if (counter.trim() && !counterCents) { setError('La contraoferta no es un importe válido'); return }
    const v = visits.find(x => x.id === visitId)
    const err = await m.write('buyer_offers', {
      amount_cents: cents, buyer_name: buyer.trim() || v?.contact_name || null, visit_id: visitId, offer_date: date, financing,
      proposed_signing: signing || null, response_deadline: deadline || null, status, counter_cents: counterCents, notes: notes.trim() || null
    }, offer?.id)
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title={offer ? 'Oferta recibida' : 'Nueva oferta recibida'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Importe ofrecido (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ej. 270.000" autoFocus={!offer} />
        {cents && asking && (
          <p className="text-sm text-muted -mt-3">
            {price(cents)} · {cents >= asking ? 'igual o más que' : `${price(asking - cents)} menos que`} el precio publicado ({Math.round((cents / asking - 1) * 1000) / 10}%)
          </p>
        )}
        {doneVisits.length > 0 && (
          <Choice<string | null> label="¿De qué visita?" value={visitId} onChange={setVisitId}
            options={[...doneVisits.map(v => ({ value: v.id as string | null, label: `${v.contact_name || 'Comprador'} · ${shortDate(v.visit_date)}` })), { value: null, label: 'Otra' }]} />
        )}
        <TextField label="Comprador" value={buyer} onChange={e => setBuyer(e.target.value)} maxLength={80} />
        <Choice<Financing> label="Financiación" value={financing} onChange={setFinancing}
          options={(Object.keys(FINANCING) as Financing[]).map(k => ({ value: k, label: FINANCING[k] }))} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Fecha de la oferta" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Responder antes de" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <TextField label="Firma que proponen" type="date" value={signing} onChange={e => setSigning(e.target.value)} />
        <Choice<OfferStatus> label="Estado" value={status} onChange={setStatus}
          options={(Object.keys(OFFER_STATUS) as OfferStatus[]).map(k => ({ value: k, label: OFFER_STATUS[k] }))} />
        {status === 'countered' && (
          <TextField label="Nuestra contraoferta (€)" inputMode="decimal" value={counter} onChange={e => setCounter(e.target.value)} />
        )}
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Condiciones, arras que proponen, muebles incluidos…" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{offer ? 'Guardar' : 'Apuntar oferta'}</button>
        {offer && <ConfirmDelete label="Eliminar oferta" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('buyer_offers', offer.id); onClose() }} />}
      </form>
      {offer?.response_deadline && <p className="text-xs text-muted">El aviso de la mañana os lo recordará el día antes y el mismo día ({longDate(offer.response_deadline)}).</p>}
    </Sheet>
  )
}
