import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Member } from '../../lib/supabase'
import { hhmm, longDate, relativeDay, shortDate, today } from '../../lib/dates'
import { isMapsUrl, mapsHref } from '../../lib/kids'
import {
  FEATURES, HOME_STATUS, HOME_STATUS_ORDER, OFFER_STATUS, VISIT_CHECKLIST,
  mustHaveCheck, parsePrice, perM2, photoUrl, portalName, price, priceInput, priceShort,
  type CheckValue, type Home, type HomeOffer, type HomeStatus, type HomeVisit, type Mudanza, type OfferStatus, type Photo, type Rating
} from '../../lib/mudanza'
import { Card } from '../../components/ui'
import { Choice, ConfirmDelete, Fab, MultiChips, Sheet, TextArea, TextField } from '../../components/Sheet'
import { StatusPill } from './Vendemos'
import Combobox from '../../components/Combobox'
import { MADRID_DISTRICTS, MUNICIPALITIES, PROVINCES } from '../../data/places'

type Sort = 'estado' | 'recientes' | 'precio' | 'm2' | 'nota'
const PROVINCE_NAMES = PROVINCES.map(p => p.name)
const municipalitiesOf = (province: string | null) => {
  const code = PROVINCES.find(p => p.name === province)?.code
  return code ? MUNICIPALITIES[code].map(x => x.name) : []
}
const ALL_MUNICIPALITIES = PROVINCES.flatMap(p => MUNICIPALITIES[p.code].map(x => x.name))

type Filter = 'activos' | 'favoritos' | 'descartados' | 'todos'

const nameOf = (id: string | null, members: Member[]) => (id ? members.find(x => x.id === id)?.display_name ?? '' : '')
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

export default function Buscamos({ m, members, me, householdId }: { m: Mudanza; members: Member[]; me: Member; householdId: string }) {
  const [filter, setFilter] = useState<Filter>('activos')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editHome, setEditHome] = useState<{ open: boolean; home?: Home }>({ open: false })
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [town, setTown] = useState<string>('all')
  const [minP, setMinP] = useState('')
  const [maxP, setMaxP] = useState('')
  const [sort, setSort] = useState<Sort>('estado')
  const [showFilters, setShowFilters] = useState(false)
  const t = today()
  const towns = [...new Set(m.homes.map(h => h.municipality).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))
  const avgScore = (id: string) => {
    const s = m.ratings.filter(r => r.home_id === id).map(r => r.score)
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : -1
  }

  const list = useMemo(() => {
    const f = m.homes.filter(h =>
      filter === 'todos' ? true
        : filter === 'descartados' ? h.status === 'descartado'
          : filter === 'favoritos' ? h.status === 'favorito' || h.status === 'oferta'
            : h.status !== 'descartado')
    const lo = minP.trim() ? parsePrice(minP) : null
    const hi = maxP.trim() ? parsePrice(maxP) : null
    const g = f.filter(h =>
      (town === 'all' || (town === 'none' ? !h.municipality : h.municipality === town)) &&
      (lo == null || (h.price_cents != null && h.price_cents >= lo)) &&
      (hi == null || (h.price_cents != null && h.price_cents <= hi)))
    const nullsLast = (x: number | null) => (x == null ? Number.MAX_SAFE_INTEGER : x)
    return g.slice().sort((a, b) =>
      sort === 'recientes' ? b.created_at.localeCompare(a.created_at)
        : sort === 'precio' ? nullsLast(a.price_cents) - nullsLast(b.price_cents)
          : sort === 'm2' ? nullsLast(perM2(a)) - nullsLast(perM2(b))
            : sort === 'nota' ? avgScore(b.id) - avgScore(a.id)
              : HOME_STATUS_ORDER.indexOf(a.status) - HOME_STATUS_ORDER.indexOf(b.status))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.homes, m.ratings, filter, town, minP, maxP, sort])

  const nextVisits = m.homeVisits.filter(v => v.status === 'scheduled' && v.visit_date >= t)
  const open = m.homes.find(h => h.id === openId)
  const c = m.criteria
  const comparable = m.homes.filter(h => h.status !== 'descartado')

  return (
    <div className="flex flex-col gap-5">
      {/* Qué buscamos */}
      <button onClick={() => setCriteriaOpen(true)} className="bg-card rounded-2xl p-4 text-left flex flex-col gap-1.5">
        <span className="flex justify-between items-baseline">
          <span className="text-[15px] font-bold">Qué buscamos</span>
          <span className="text-sm text-accent font-semibold">Editar</span>
        </span>
        {c && (c.max_price_cents || c.min_rooms || c.min_m2 || c.zones.length || c.municipalities?.length || c.must_haves.length) ? (
          <span className="flex gap-1.5 flex-wrap">
            {c.max_price_cents && <Chip>Hasta {priceShort(c.max_price_cents)}</Chip>}
            {c.min_rooms ? <Chip>{c.min_rooms}+ hab.</Chip> : null}
            {c.min_m2 ? <Chip>{c.min_m2}+ m²</Chip> : null}
            {(c.municipalities ?? []).map(z => <Chip key={`m-${z}`}>📍 {z}</Chip>)}
            {c.zones.map(z => <Chip key={z}>{z}</Chip>)}
            {c.must_haves.map(k => <Chip key={k}>{FEATURES[k] ?? k}</Chip>)}
          </span>
        ) : <span className="text-sm text-muted">Presupuesto, zonas e imprescindibles. Cada piso marcará cuáles cumple.</span>}
      </button>

      {nextVisits.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Próximas visitas</h2>
          {nextVisits.map(v => {
            const h = m.homes.find(x => x.id === v.home_id)
            return (
              <button key={v.id} onClick={() => setOpenId(v.home_id)} className="bg-card rounded-2xl p-4 text-left flex justify-between items-baseline gap-2">
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">{h?.title}</span>
                  <span className="text-[13px] text-muted">{v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}{h?.zone ? ` · ${h.zone}` : ''}</span>
                </span>
                <span className="text-sm font-semibold shrink-0">{relativeDay(v.visit_date)} · {hhmm(v.start_time)}</span>
              </button>
            )
          })}
        </section>
      )}

      <div className="flex justify-between items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {([['activos', 'En marcha'], ['favoritos', 'Favoritos'], ['descartados', 'Descartados'], ['todos', 'Todos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`min-h-9 px-3 rounded-full text-[13px] font-semibold ${filter === k ? 'bg-ink text-bg' : 'bg-card border border-line'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 -mt-2">
        <button onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters} className="min-h-10 px-3 rounded-xl border border-line bg-card text-sm font-semibold">
          Filtrar y ordenar{town !== 'all' || minP || maxP || sort !== 'estado' ? ' •' : ''}
        </button>
        {(town !== 'all' || minP || maxP || sort !== 'estado') && (
          <button onClick={() => { setTown('all'); setMinP(''); setMaxP(''); setSort('estado') }} className="min-h-10 px-2 text-sm text-muted">Quitar</button>
        )}
      </div>
      {showFilters && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Localidad</span>
            <select value={town} onChange={e => setTown(e.target.value)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="all">Todas</option>
              {towns.map(x => <option key={x} value={x}>{x}</option>)}
              <option value="none">Sin localidad</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Precio desde (€)" inputMode="decimal" value={minP} onChange={e => setMinP(e.target.value)} placeholder="200.000" />
            <TextField label="Hasta (€)" inputMode="decimal" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="400.000" />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Ordenar por</span>
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="estado">Estado (favoritos primero)</option>
              <option value="recientes">Guardados más recientes</option>
              <option value="precio">Precio, de menor a mayor</option>
              <option value="m2">€/m², de menor a mayor</option>
              <option value="nota">Nota media, de mayor a menor</option>
            </select>
          </label>
        </Card>
      )}
      {comparable.length >= 2 && (
        <button onClick={() => setCompareOpen(true)} className="min-h-11 -mt-2 rounded-xl border border-line bg-card text-accent text-sm font-semibold">Comparar pisos</button>
      )}

      {m.loading ? <p className="text-sm text-muted">Cargando…</p> : list.length === 0 ? (
        <Card><p className="text-sm text-muted">{m.homes.length ? 'Nada en esta lista.' : 'Guarda aquí los pisos que os interesen con «+ Piso»: enlace del anuncio, precio y metros.'}</p></Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map(h => <HomeCard key={h.id} h={h} m={m} me={me} members={members} onOpen={() => setOpenId(h.id)} />)}
        </div>
      )}

      <Fab label="Piso" onClick={() => setEditHome({ open: true })} />

      {open && !editHome.open && (
        <HomeSheet h={open} m={m} me={me} members={members} householdId={householdId}
          onEdit={() => setEditHome({ open: true, home: open })} onClose={() => setOpenId(null)} />
      )}
      {editHome.open && (
        <HomeEditSheet home={editHome.home} m={m} onClose={() => setEditHome({ open: false })}
          onCreated={() => setEditHome({ open: false })} />
      )}
      {criteriaOpen && <CriteriaSheet m={m} householdId={householdId} onClose={() => setCriteriaOpen(false)} />}
      {compareOpen && <CompareSheet homes={comparable} m={m} members={members} onClose={() => setCompareOpen(false)} />}
    </div>
  )
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'bad' | 'unknown' }) {
  const cls = tone === 'ok' ? 'bg-accent-soft text-accent' : tone === 'bad' ? 'bg-danger/10 text-danger' : tone === 'unknown' ? 'bg-bg text-muted' : 'bg-bg'
  return <span className={`text-[12px] font-semibold px-2 py-1 rounded-lg ${cls}`}>{children}</span>
}

function StatusBadge({ s }: { s: HomeStatus }) {
  const cls = s === 'favorito' || s === 'oferta' ? 'bg-accent text-white dark:text-bg' : s === 'descartado' ? 'bg-bg text-muted' : 'bg-accent-soft text-accent'
  return <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cls}`}>{s === 'favorito' ? '★ ' : ''}{HOME_STATUS[s]}</span>
}

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span aria-label={`${n} de 5`} className="inline-flex" style={{ fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= n ? 'text-[#E0A100]' : 'text-line'}>★</span>)}
    </span>
  )
}

/** Notas de los dos, sin desvelar la del otro hasta que pongas la tuya */
function RatingsLine({ homeId, ratings, me, members }: { homeId: string; ratings: Rating[]; me: Member; members: Member[] }) {
  const mine = ratings.find(r => r.home_id === homeId && r.member_id === me.id)
  const others = ratings.filter(r => r.home_id === homeId && r.member_id !== me.id)
  if (!mine && !others.length) return null
  return (
    <span className="flex gap-3 flex-wrap text-[13px]">
      {mine && <span className="flex items-center gap-1">Tú <Stars n={mine.score} /></span>}
      {others.map(r => mine
        ? <span key={r.member_id} className="flex items-center gap-1">{nameOf(r.member_id, members)} <Stars n={r.score} /></span>
        : <span key={r.member_id} className="text-muted">{nameOf(r.member_id, members)} ya ha puntuado</span>)}
    </span>
  )
}

function HomeCard({ h, m, me, members, onOpen }: { h: Home; m: Mudanza; me: Member; members: Member[]; onOpen: () => void }) {
  const checks = mustHaveCheck(h, m.criteria)
  const pm2 = perM2(h)
  const next = m.homeVisits.find(v => v.home_id === h.id && v.status === 'scheduled' && v.visit_date >= today())
  const nPhotos = m.photos.filter(p => p.home_id === h.id).length
  const maps = h.maps_url || h.address || h.municipality ? mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url }) : null
  return (
    <div className={`bg-card rounded-2xl flex flex-col overflow-hidden ${h.status === 'descartado' ? 'opacity-60' : ''}`}>
    <button onClick={onOpen} className="p-4 text-left flex flex-col gap-2">
      <span className="flex justify-between items-start gap-2">
        <span className="text-[16px] font-bold leading-snug">{h.title}</span>
        <StatusBadge s={h.status} />
      </span>
      <span className="text-[14px]">
        <b>{price(h.price_cents)}</b>
        <span className="text-muted">
          {[h.size_m2 && `${Number(h.size_m2)} m²`, pm2 && `${price(pm2)}/m²`, h.rooms != null && `${h.rooms} hab.`, [h.zone, h.municipality].filter(Boolean).join(', ')].filter(Boolean).map(x => ` · ${x}`).join('')}
        </span>
      </span>
      {checks.length > 0 && (
        <span className="flex gap-1 flex-wrap">
          {checks.map(c => <Chip key={c.label} tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>)}
        </span>
      )}
      <RatingsLine homeId={h.id} ratings={m.ratings} me={me} members={members} />
      {(next || nPhotos > 0 || h.minutes_to_school != null) && (
        <span className="text-[13px] text-muted">
          {[next && `Visita ${relativeDay(next.visit_date).toLowerCase()} ${hhmm(next.start_time)}`, h.minutes_to_school != null && `${h.minutes_to_school} min al cole`, nPhotos > 0 && `${nPhotos} foto${nPhotos > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
    {(h.url || maps) && (
      <div className="flex border-t border-line">
        {h.url && (
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-h-11 px-4 flex items-center gap-1.5 text-accent text-[13px] font-semibold">
            🔗 {portalName(h.url) ?? 'Anuncio'} ↗
          </a>
        )}
        {maps && (
          <a href={maps} target="_blank" rel="noopener noreferrer" className={`flex-1 min-h-11 px-4 flex items-center gap-1.5 text-accent text-[13px] font-semibold ${h.url ? 'border-l border-line' : ''}`}>
            📍 Cómo llegar ↗
          </a>
        )}
      </div>
    )}
    </div>
  )
}

function HomeSheet({ h, m, me, members, householdId, onEdit, onClose }: {
  h: Home; m: Mudanza; me: Member; members: Member[]; householdId: string; onEdit: () => void; onClose: () => void
}) {
  const [visitSheet, setVisitSheet] = useState<{ open: boolean; visit?: HomeVisit }>({ open: false })
  const [offerSheet, setOfferSheet] = useState<{ open: boolean; offer?: HomeOffer }>({ open: false })
  const [discarding, setDiscarding] = useState(false)
  const [reason, setReason] = useState(h.discard_reason ?? '')
  const [confirming, setConfirming] = useState(false)
  const adults = members.filter(x => x.kind === 'adult')
  const visits = m.homeVisits.filter(v => v.home_id === h.id)
  const offers = m.homeOffers.filter(o => o.home_id === h.id)
  const checks = mustHaveCheck(h, m.criteria)
  const pm2 = perM2(h)
  const maps = mapsHref({ location: [h.address, h.municipality].filter(Boolean).join(', ') || h.zone, maps_url: h.maps_url })

  const setStatus = (status: HomeStatus, extra: Record<string, unknown> = {}) => m.write('homes', { status, ...extra }, h.id)

  if (visitSheet.open) {
    return <HomeVisitSheet home={h} visit={visitSheet.visit} adults={adults} m={m} onClose={() => setVisitSheet({ open: false })} />
  }
  if (offerSheet.open) {
    return <HomeOfferSheet home={h} offer={offerSheet.offer} m={m} onClose={() => setOfferSheet({ open: false })} />
  }

  return (
    <Sheet title={h.title} onClose={onClose}>
      <div className="flex flex-col gap-1 -mt-3">
        <span className="text-[22px] font-bold">{price(h.price_cents)}</span>
        <span className="text-sm text-muted">
          {[h.size_m2 && `${Number(h.size_m2)} m²`, pm2 && `${price(pm2)}/m²`, h.rooms != null && `${h.rooms} hab.`, h.baths != null && `${h.baths} baños`, h.floor && `planta ${h.floor}`].filter(Boolean).join(' · ')}
        </span>
        {(h.address || h.zone || h.municipality) && <span className="text-sm">{[h.address, h.zone, h.municipality, h.province].filter(Boolean).join(' · ')}</span>}
        {h.url && (
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent font-semibold underline underline-offset-2 break-all">
            {portalName(h.url)}: {h.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}{h.url.length > 70 ? '…' : ''}
          </a>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="min-h-11 px-4 rounded-xl bg-card border border-line text-accent text-sm font-semibold flex items-center">Abrir en {portalName(h.url)} ↗</a>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="min-h-11 px-4 rounded-xl bg-card border border-line text-accent text-sm font-semibold flex items-center">Cómo llegar ↗</a>}
        <button onClick={onEdit} className="min-h-11 px-4 rounded-xl bg-card border border-line text-sm font-semibold">Editar datos</button>
      </div>

      <Choice<HomeStatus> label="Estado" value={h.status} onChange={s => (s === 'descartado' ? setDiscarding(true) : setStatus(s, { discard_reason: null }))}
        options={(['interesa', 'visita_pedida', 'visitado', 'favorito', 'oferta', 'descartado'] as HomeStatus[]).map(s => ({ value: s, label: HOME_STATUS[s] }))} />
      {discarding && (
        <div className="flex flex-col gap-2 bg-card rounded-2xl p-4">
          <TextField label="¿Por qué lo descartáis?" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Ej. demasiado ruido, reforma cara" autoFocus />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDiscarding(false)} className="min-h-10 px-3 text-sm text-muted">Cancelar</button>
            <button onClick={async () => { await setStatus('descartado', { discard_reason: reason.trim() || null }); setDiscarding(false) }} className="min-h-10 px-4 rounded-lg bg-ink text-bg text-sm font-semibold">Descartar</button>
          </div>
        </div>
      )}
      {h.status === 'descartado' && h.discard_reason && <p className="text-sm text-muted -mt-3">Descartado: {h.discard_reason}</p>}

      {checks.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-bold text-[15px]">Imprescindibles</h3>
          <span className="flex gap-1 flex-wrap">
            {checks.map(c => <Chip key={c.label} tone={c.ok == null ? 'unknown' : c.ok ? 'ok' : 'bad'}>{c.ok == null ? '?' : c.ok ? '✓' : '✗'} {c.label}</Chip>)}
          </span>
        </section>
      )}

      <RatingBox h={h} m={m} me={me} members={members} />

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[15px]">Visitas</h3>
          <button onClick={() => setVisitSheet({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Visita</button>
        </div>
        {visits.length === 0 ? <p className="text-sm text-muted">Sin visitas. Al apuntarla sale en la Agenda.</p> : visits.map(v => {
          const marked = Object.values(v.checklist ?? {}).filter(x => x.v).length
          const bad = Object.values(v.checklist ?? {}).filter(x => x.v === 'mal').length
          return (
            <button key={v.id} onClick={() => setVisitSheet({ open: true, visit: v })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
              <span className="flex justify-between text-[15px] font-semibold">
                <span>{longDate(v.visit_date)} · {hhmm(v.start_time)}</span>
                <span className="text-[13px] text-muted">{v.status === 'done' ? 'Hecha' : v.status === 'cancelled' ? 'Cancelada' : 'Prevista'}</span>
              </span>
              <span className="text-[13px] text-muted">
                {v.attendee_id ? `Va ${nameOf(v.attendee_id, members)}` : 'Vais los dos'}
                {marked > 0 && ` · Revisado ${marked}/${VISIT_CHECKLIST.length}`}{bad > 0 && ` · ${bad} punto${bad > 1 ? 's' : ''} malo${bad > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
      </section>

      <Photos h={h} m={m} householdId={householdId} />

      <section className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[15px]">Ofertas que hacemos</h3>
          <button onClick={() => setOfferSheet({ open: true })} className="min-h-10 px-2 text-sm font-semibold text-accent">+ Oferta</button>
        </div>
        {offers.map(o => (
          <button key={o.id} onClick={() => setOfferSheet({ open: true, offer: o })} className="bg-card rounded-xl p-3 text-left flex flex-col gap-0.5">
            <span className="flex justify-between items-baseline gap-2">
              <span className="text-[16px] font-bold">{price(o.amount_cents)}</span>
              <StatusPill status={o.status} />
            </span>
            <span className="text-[13px] text-muted">
              {shortDate(o.offer_date)}{h.price_cents ? ` · ${Math.round((o.amount_cents / h.price_cents - 1) * 1000) / 10}% sobre el precio` : ''}
              {o.counter_cents ? ` · contraoferta ${price(o.counter_cents)}` : ''}
            </span>
          </button>
        ))}
      </section>

      {(h.community_fee_cents != null || h.ibi_cents != null || h.energy || h.contact || h.notes || h.features.length > 0) && (
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="font-bold text-[15px]">Más datos</h3>
          {h.features.length > 0 && <p>{h.features.map(k => FEATURES[k] ?? k).join(' · ')}</p>}
          {h.community_fee_cents != null && <p>Comunidad: {price(h.community_fee_cents)}/mes</p>}
          {h.ibi_cents != null && <p>IBI: {price(h.ibi_cents)}/año</p>}
          {h.energy && <p>Certificado energético: {h.energy}</p>}
          {h.minutes_to_school != null && <p>{h.minutes_to_school} min al cole</p>}
          {h.contact && <p>Contacto: {h.contact}</p>}
          {h.notes && <p className="text-muted whitespace-pre-line">{h.notes}</p>}
        </section>
      )}

      <ConfirmDelete label="Eliminar piso (con sus visitas, fotos y notas)" confirming={confirming} setConfirming={setConfirming}
        onConfirm={async () => { await m.removeHome(h.id); onClose() }} />
    </Sheet>
  )
}

function RatingBox({ h, m, me, members }: { h: Home; m: Mudanza; me: Member; members: Member[] }) {
  const mine = m.ratings.find(r => r.home_id === h.id && r.member_id === me.id)
  const others = m.ratings.filter(r => r.home_id === h.id && r.member_id !== me.id)
  const [score, setScore] = useState(mine?.score ?? 0)
  const [best, setBest] = useState(mine?.best ?? '')
  const [worst, setWorst] = useState(mine?.worst ?? '')
  const [saved, setSaved] = useState(false)

  async function save(nextScore = score) {
    if (!nextScore) return
    await m.write('home_ratings', { home_id: h.id, member_id: me.id, score: nextScore, best: best.trim() || null, worst: worst.trim() || null }, undefined, 'home_id,member_id')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="flex flex-col gap-3 bg-card rounded-2xl p-4">
      <h3 className="font-bold text-[15px]">Tu nota</h3>
      <div className="flex gap-1" role="radiogroup" aria-label="Tu nota">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} role="radio" aria-checked={score === i} aria-label={`${i} estrellas`} onClick={() => { setScore(i); save(i) }}
            className={`w-11 h-11 text-[28px] leading-none ${i <= score ? 'text-[#E0A100]' : 'text-line'}`}>★</button>
        ))}
      </div>
      <TextField label="Lo mejor" value={best} onChange={e => setBest(e.target.value)} onBlur={() => save()} maxLength={300} />
      <TextField label="Lo peor" value={worst} onChange={e => setWorst(e.target.value)} onBlur={() => save()} maxLength={300} />
      {saved && <p role="status" className="text-xs text-accent">Guardado</p>}
      {others.map(r => (
        <div key={r.member_id} className="border-t border-line pt-3 flex flex-col gap-1">
          <span className="text-sm font-semibold flex items-center gap-2">{nameOf(r.member_id, members)} {mine ? <Stars n={r.score} size={16} /> : null}</span>
          {mine ? (
            <>
              {r.best && <span className="text-sm">👍 {r.best}</span>}
              {r.worst && <span className="text-sm">👎 {r.worst}</span>}
            </>
          ) : <span className="text-sm text-muted">Pon tu nota para ver la suya. Así no os influís.</span>}
        </div>
      ))}
    </section>
  )
}

function Photos({ h, m, householdId }: { h: Home; m: Mudanza; householdId: string }) {
  const photos = m.photos.filter(p => p.home_id === h.id)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<Photo | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(photos.filter(p => !urls[p.id]).map(async p => [p.id, await photoUrl(p.path)] as const)).then(pairs => {
      if (!alive || !pairs.length) return
      setUrls(u => ({ ...u, ...Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]) }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map(p => p.id).join()])

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    for (const f of Array.from(files).slice(0, 10)) await m.addPhoto(householdId, h.id, f)
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-[15px]">Fotos</h3>
        <label className="min-h-10 px-2 text-sm font-semibold text-accent flex items-center cursor-pointer">
          {busy ? 'Subiendo…' : '+ Fotos'}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={e => { add(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {photos.length === 0 ? <p className="text-sm text-muted">Haz fotos durante la visita: se guardan en privado, solo para vosotros.</p> : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map(p => (
            <button key={p.id} onClick={() => setView(p)} className="aspect-square rounded-lg overflow-hidden bg-bg">
              {urls[p.id] && <img src={urls[p.id]} alt="" className="w-full h-full object-cover" loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col" onClick={() => setView(null)}>
          <div className="flex justify-between p-3" onClick={e => e.stopPropagation()}>
            <button onClick={async () => { await m.removePhoto(view); setView(null) }} className="min-h-11 px-3 text-sm font-semibold text-white">Borrar foto</button>
            <button onClick={() => setView(null)} aria-label="Cerrar" className="w-11 h-11 text-white text-2xl">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2">
            {urls[view.id] && <img src={urls[view.id]} alt="" className="max-w-full max-h-full object-contain" />}
          </div>
        </div>
      )}
    </section>
  )
}

function HomeVisitSheet({ home, visit, adults, m, onClose }: { home: Home; visit?: HomeVisit; adults: Member[]; m: Mudanza; onClose: () => void }) {
  const [date, setDate] = useState(visit?.visit_date ?? today())
  const [start, setStart] = useState(hhmm(visit?.start_time) || '18:00')
  const [end, setEnd] = useState(hhmm(visit?.end_time))
  const [attendee, setAttendee] = useState<string | null>(visit?.attendee_id ?? null)
  const [status, setStatus] = useState<HomeVisit['status']>(visit?.status ?? 'scheduled')
  const [checklist, setChecklist] = useState<Record<string, CheckValue>>(visit?.checklist ?? {})
  const [notes, setNotes] = useState(visit?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const setItem = (k: string, patch: Partial<CheckValue>) =>
    setChecklist(c => ({ ...c, [k]: { v: c[k]?.v ?? '', n: c[k]?.n ?? '', ...patch } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end && end <= start) { setError('La hora de fin debe ser posterior a la de inicio'); return }
    const clean = Object.fromEntries(Object.entries(checklist)
      .filter(([, x]) => x.v || x.n?.trim())
      .map(([k, x]) => [k, { v: x.v, n: (x.n ?? '').trim().slice(0, 300) }]))
    const err = await m.write('home_visits', {
      home_id: home.id, visit_date: date, start_time: start, end_time: end || null, attendee_id: attendee, status, checklist: clean, notes: notes.trim() || null
    }, visit?.id)
    if (err) { setError(err); return }
    // El piso avanza de estado solo
    if (status === 'done' && (home.status === 'interesa' || home.status === 'visita_pedida')) await m.write('homes', { status: 'visitado' }, home.id)
    else if (status === 'scheduled' && home.status === 'interesa') await m.write('homes', { status: 'visita_pedida' }, home.id)
    onClose()
  }

  return (
    <Sheet title={`Visita · ${home.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Día" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Hora" type="time" value={start} onChange={e => setStart(e.target.value)} required />
          <TextField label="Hasta" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <Choice<string | null> label="Quién va" value={attendee} onChange={setAttendee}
          options={[{ value: null, label: 'Los dos' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
        <Choice<HomeVisit['status']> label="Estado" value={status} onChange={setStatus}
          options={[{ value: 'scheduled', label: 'Prevista' }, { value: 'done', label: 'Hecha' }, { value: 'cancelled', label: 'Cancelada' }]} />

        <section className="flex flex-col gap-3 bg-card rounded-2xl p-4">
          <h3 className="font-bold text-[15px]">Qué revisar en la visita</h3>
          {VISIT_CHECKLIST.map(item => {
            const val = checklist[item.key]
            return (
              <div key={item.key} className="flex flex-col gap-1.5 border-b border-line last:border-0 pb-3 last:pb-0">
                <div className="flex justify-between items-center gap-2">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold">{item.label}</span>
                    {item.hint && <span className="text-[12px] text-muted">{item.hint}</span>}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    {(['ok', 'mal'] as const).map(v => (
                      <button type="button" key={v} aria-pressed={val?.v === v} onClick={() => setItem(item.key, { v: val?.v === v ? '' : v })}
                        className={`min-h-10 px-3 rounded-lg text-[13px] font-bold border ${val?.v === v ? (v === 'ok' ? 'bg-accent text-white dark:text-bg border-accent' : 'bg-danger text-white dark:text-bg border-danger') : 'bg-bg border-line'}`}>
                        {v === 'ok' ? 'Bien' : 'Mal'}
                      </button>
                    ))}
                  </span>
                </div>
                <input value={val?.n ?? ''} onChange={e => setItem(item.key, { n: e.target.value })} maxLength={300} placeholder="Nota…" aria-label={`Nota sobre ${item.label}`}
                  className="min-h-10 px-3 rounded-lg border border-line bg-bg text-[15px]" />
              </div>
            )
          })}
        </section>

        <TextArea label="Notas de la visita" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{visit ? 'Guardar' : 'Apuntar visita'}</button>
        {visit && <ConfirmDelete label="Eliminar visita" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('home_visits', visit.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

function HomeOfferSheet({ home, offer, m, onClose }: { home: Home; offer?: HomeOffer; m: Mudanza; onClose: () => void }) {
  const [amount, setAmount] = useState(priceInput(offer?.amount_cents))
  const [date, setDate] = useState(offer?.offer_date ?? today())
  const [deadline, setDeadline] = useState(offer?.response_deadline ?? '')
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? 'pending')
  const [counter, setCounter] = useState(priceInput(offer?.counter_cents))
  const [notes, setNotes] = useState(offer?.notes ?? '')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const cents = parsePrice(amount)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cents) { setError('Escribe el importe'); return }
    const counterCents = counter.trim() ? parsePrice(counter) : null
    if (counter.trim() && !counterCents) { setError('La contraoferta no es un importe válido'); return }
    const err = await m.write('home_offers', {
      home_id: home.id, amount_cents: cents, offer_date: date, response_deadline: deadline || null, status, counter_cents: counterCents, notes: notes.trim() || null
    }, offer?.id)
    if (err) { setError(err); return }
    if (!offer && home.status !== 'oferta') await m.write('homes', { status: 'oferta' }, home.id)
    onClose()
  }

  return (
    <Sheet title={`Oferta · ${home.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Importe que ofrecemos (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ej. 310.000" autoFocus={!offer} />
        {cents && home.price_cents && (
          <p className="text-sm text-muted -mt-3">{price(cents)} · {Math.round((cents / home.price_cents - 1) * 1000) / 10}% sobre los {price(home.price_cents)} que piden</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Fecha" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <TextField label="Esperamos respuesta" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <Choice<OfferStatus> label="Estado" value={status} onChange={setStatus}
          options={(Object.keys(OFFER_STATUS) as OfferStatus[]).map(k => ({ value: k, label: OFFER_STATUS[k] }))} />
        {status === 'countered' && <TextField label="Su contraoferta (€)" inputMode="decimal" value={counter} onChange={e => setCounter(e.target.value)} />}
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Condiciones, arras, plazos…" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{offer ? 'Guardar' : 'Apuntar oferta'}</button>
        {offer && <ConfirmDelete label="Eliminar oferta" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('home_offers', offer.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

function HomeEditSheet({ home, m, onClose, onCreated }: { home?: Home; m: Mudanza; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(home?.title ?? '')
  const [url, setUrl] = useState(home?.url ?? '')
  const [amount, setAmount] = useState(priceInput(home?.price_cents))
  const [m2, setM2] = useState(home?.size_m2 != null ? String(Number(home.size_m2)).replace('.', ',') : '')
  const [rooms, setRooms] = useState(home?.rooms?.toString() ?? '')
  const [baths, setBaths] = useState(home?.baths?.toString() ?? '')
  const [floor, setFloor] = useState(home?.floor ?? '')
  const [zone, setZone] = useState(home?.zone ?? '')
  const [province, setProvince] = useState<string | null>(home?.province ?? 'Madrid')
  const [municipality, setMunicipality] = useState<string | null>(home?.municipality ?? null)
  const [address, setAddress] = useState(home?.address ?? '')
  const [maps, setMaps] = useState(home?.maps_url ?? '')
  const [features, setFeatures] = useState<string[]>(home?.features ?? [])
  const [fee, setFee] = useState(priceInput(home?.community_fee_cents))
  const [ibi, setIbi] = useState(priceInput(home?.ibi_cents))
  const [energy, setEnergy] = useState<string | null>(home?.energy ?? null)
  const [minutes, setMinutes] = useState(home?.minutes_to_school?.toString() ?? '')
  const [contact, setContact] = useState(home?.contact ?? '')
  const [notes, setNotes] = useState(home?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Ponle un nombre para reconocerlo (ej. «3 hab. calle Mayor»)'); return }
    const priceCents = amount.trim() ? parsePrice(amount) : null
    if (amount.trim() && !priceCents) { setError('El precio no es válido'); return }
    const cleanUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim().replace(/^http:/i, 'https:') : `https://${url.trim()}`) : null
    if (maps.trim() && !isMapsUrl(maps.trim())) { setError('El enlace de mapa debe ser de Google Maps (Compartir → Copiar enlace)'); return }
    const ints = [rooms, baths, minutes].map(x => (x.trim() ? parseInt(x, 10) : null))
    if (ints.some(x => x != null && (isNaN(x) || x < 0))) { setError('Revisa habitaciones, baños y minutos'); return }
    const size = num(m2)
    if (size != null && (isNaN(size) || size <= 0)) { setError('Los metros no son válidos'); return }
    setBusy(true); setError('')
    const err = await m.write('homes', {
      title: title.trim(), url: cleanUrl, price_cents: priceCents, size_m2: size, rooms: ints[0], baths: ints[1], floor: floor.trim() || null,
      zone: zone.trim() || null, province, municipality, address: address.trim() || null, maps_url: maps.trim() || null, features,
      community_fee_cents: fee.trim() ? parsePrice(fee) : null, ibi_cents: ibi.trim() ? parsePrice(ibi) : null, energy,
      minutes_to_school: ints[2], contact: contact.trim() || null, notes: notes.trim() || null
    }, home?.id)
    setBusy(false)
    if (err) setError(err); else if (home) onClose(); else onCreated()
  }

  return (
    <Sheet title={home ? 'Editar piso' : 'Nuevo piso'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <TextField label="Enlace del anuncio" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.idealista.com/inmueble/…" />
          {url.trim() && (() => {
            const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
            const portal = portalName(full)
            return portal
              ? <a href={full} target="_blank" rel="noopener noreferrer" className="text-xs text-accent font-semibold">✓ Anuncio de {portal} · comprobar ↗</a>
              : <span className="text-xs text-danger">Ese enlace no parece válido</span>
          })()}
        </div>
        <TextField label="Nombre para reconocerlo" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Ej. Ático luminoso calle Mayor" autoFocus={!home} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Precio (€)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="320.000" />
          <TextField label="Metros (m²)" inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} placeholder="95" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Habitaciones" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <TextField label="Baños" inputMode="numeric" value={baths} onChange={e => setBaths(e.target.value)} />
          <TextField label="Planta" value={floor} onChange={e => setFloor(e.target.value)} maxLength={20} placeholder="3º" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Provincia</span>
            <select value={province ?? ''} onChange={e => { setProvince(e.target.value || null); setMunicipality(null) }}
              className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              <option value="">—</option>
              {PROVINCE_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Combobox key={province ?? 'none'} label="Localidad" value={municipality} onChange={setMunicipality} options={municipalitiesOf(province)} placeholder="Escribe: Alcob…" />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">{municipality === 'Madrid' ? 'Distrito o barrio' : 'Zona o barrio'}</span>
          <input value={zone} onChange={e => setZone(e.target.value)} maxLength={60} list={municipality === 'Madrid' ? 'distritos-madrid' : undefined}
            placeholder={municipality === 'Madrid' ? 'Elige un distrito o escribe el barrio' : 'Ej. Casco antiguo'}
            className="w-full min-h-12 px-4 rounded-xl border border-line bg-card text-[16px] outline-none focus:border-accent" />
          {municipality === 'Madrid' && <datalist id="distritos-madrid">{MADRID_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist>}
        </label>
        <TextField label="Dirección (opcional)" value={address} onChange={e => setAddress(e.target.value)} maxLength={120} />
        <TextField label="Enlace de Google Maps (opcional)" type="url" inputMode="url" value={maps} onChange={e => setMaps(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
        <MultiChips label="Tiene" value={features} onChange={setFeatures} options={Object.entries(FEATURES).map(([value, label]) => ({ value, label }))} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Comunidad (€/mes)" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} />
          <TextField label="IBI (€/año)" inputMode="decimal" value={ibi} onChange={e => setIbi(e.target.value)} />
        </div>
        <Choice<string | null> label="Certificado energético" value={energy} onChange={setEnergy}
          options={[...'ABCDEFG'.split('').map(l => ({ value: l as string | null, label: l })), { value: null, label: '?' }]} />
        <TextField label="Minutos al cole" inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Ej. 10 (andando o en coche, como lo midáis)" />
        <TextField label="Contacto (agencia o dueño)" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} />
        <TextArea label="Notas" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">
          {busy ? 'Guardando…' : home ? 'Guardar' : 'Guardar piso'}
        </button>
      </form>
    </Sheet>
  )
}

function CriteriaSheet({ m, householdId, onClose }: { m: Mudanza; householdId: string; onClose: () => void }) {
  const c = m.criteria
  const [max, setMax] = useState(priceInput(c?.max_price_cents))
  const [rooms, setRooms] = useState(c?.min_rooms?.toString() ?? '')
  const [m2, setM2] = useState(c?.min_m2?.toString() ?? '')
  const [zones, setZones] = useState((c?.zones ?? []).join(', '))
  const [towns, setTowns] = useState<string[]>(c?.municipalities ?? [])
  const [pick, setPick] = useState(0)
  const [must, setMust] = useState<string[]>(c?.must_haves ?? [])
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const maxCents = max.trim() ? parsePrice(max) : null
    if (max.trim() && !maxCents) { setError('El presupuesto no es válido'); return }
    const err = await m.write('search_criteria', {
      household_id: householdId, max_price_cents: maxCents,
      min_rooms: rooms.trim() ? parseInt(rooms, 10) : null, min_m2: m2.trim() ? parseInt(m2, 10) : null,
      zones: zones.split(',').map(z => z.trim()).filter(Boolean).slice(0, 15).map(z => z.slice(0, 40)), municipalities: towns, must_haves: must
    }, undefined, 'household_id')
    if (err) setError(err); else onClose()
  }

  return (
    <Sheet title="Qué buscamos" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="Presupuesto máximo (€)" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="Ej. 350.000" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Habitaciones mínimas" inputMode="numeric" value={rooms} onChange={e => setRooms(e.target.value)} />
          <TextField label="Metros mínimos" inputMode="numeric" value={m2} onChange={e => setM2(e.target.value)} />
        </div>
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
        <MultiChips label="Imprescindibles" value={must} onChange={setMust} options={Object.entries(FEATURES).map(([value, label]) => ({ value, label }))} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Guardar</button>
      </form>
    </Sheet>
  )
}

function CompareSheet({ homes, m, members, onClose }: { homes: Home[]; m: Mudanza; members: Member[]; onClose: () => void }) {
  const initial = homes.filter(h => h.status === 'favorito' || h.status === 'oferta').map(h => h.id)
  const [sel, setSel] = useState<string[]>((initial.length >= 2 ? initial : homes.map(h => h.id)).slice(0, 4))
  const adults = members.filter(x => x.kind === 'adult')
  const chosen = homes.filter(h => sel.includes(h.id))
  const score = (h: Home, id: string) => m.ratings.find(r => r.home_id === h.id && r.member_id === id)?.score
  const avg = (h: Home) => {
    const s = m.ratings.filter(r => r.home_id === h.id).map(r => r.score)
    return s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '—'
  }
  const bad = (h: Home) => m.homeVisits.filter(v => v.home_id === h.id).reduce((n, v) => n + Object.values(v.checklist ?? {}).filter(x => x.v === 'mal').length, 0)
  const musts = (h: Home) => {
    const c = mustHaveCheck(h, m.criteria)
    return c.length ? `${c.filter(x => x.ok).length}/${c.length}` : '—'
  }

  const rows: [string, (h: Home) => ReactNode][] = [
    ['Precio', h => price(h.price_cents)],
    ['m²', h => (h.size_m2 != null ? Number(h.size_m2) : '—')],
    ['€/m²', h => price(perM2(h))],
    ['Hab. / baños', h => `${h.rooms ?? '—'} / ${h.baths ?? '—'}`],
    ['Planta', h => h.floor ?? '—'],
    ['Localidad', h => h.municipality ?? '—'],
    ['Zona', h => h.zone ?? '—'],
    ['Imprescindibles', musts],
    ['Comunidad', h => (h.community_fee_cents != null ? `${price(h.community_fee_cents)}/mes` : '—')],
    ['IBI', h => (h.ibi_cents != null ? `${price(h.ibi_cents)}/año` : '—')],
    ['Energía', h => h.energy ?? '—'],
    ['Al cole', h => (h.minutes_to_school != null ? `${h.minutes_to_school} min` : '—')],
    ['Puntos malos', h => bad(h) || '—'],
    ...adults.map(a => [`Nota ${a.display_name}`, (h: Home) => { const s = score(h, a.id); return s ? <Stars n={s} size={12} /> : '—' }] as [string, (h: Home) => ReactNode]),
    ['Media', avg]
  ]

  return (
    <Sheet title="Comparar pisos" onClose={onClose}>
      <MultiChips label="Elige hasta 4" value={sel} onChange={v => setSel(v.slice(-4))} options={homes.map(h => ({ value: h.id, label: h.title }))} />
      {chosen.length < 2 ? <p className="text-sm text-muted">Elige al menos dos.</p> : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="text-[13px] border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-bg text-left p-2" />
                {chosen.map(h => <th key={h.id} className="p-2 text-left align-bottom min-w-[110px] font-bold">{h.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label}>
                  <th scope="row" className="sticky left-0 bg-bg text-left p-2 text-muted font-semibold border-t border-line whitespace-nowrap">{label}</th>
                  {chosen.map(h => <td key={h.id} className="p-2 border-t border-line">{f(h)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  )
}
