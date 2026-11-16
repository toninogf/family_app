// Formularios de visita y de oferta de una casa
import { useState, type FormEvent } from 'react'
import { type Member } from '../../lib/supabase'

import { hhmm, today } from '../../lib/dates'
import { OFFER_STATUS, parsePrice, price, priceInput, type Home, type HomeOffer, type HomeVisit, type Mudanza, type OfferStatus } from '../../lib/mudanza'
import { Choice, ConfirmDelete, Sheet, TextArea, TextField } from '../../components/Sheet'

export function HomeVisitSheet({ home, visit, adults, m, onClose }: { home: Home; visit?: HomeVisit; adults: Member[]; m: Mudanza; onClose: () => void }) {
  const [date, setDate] = useState(visit?.visit_date ?? today())
  const [start, setStart] = useState(hhmm(visit?.start_time) || '18:00')
  const [end, setEnd] = useState(hhmm(visit?.end_time))
  const [attendee, setAttendee] = useState<string | null>(visit?.attendee_id ?? null)
  const [status, setStatus] = useState<HomeVisit['status']>(visit?.status ?? 'scheduled')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end && end <= start) { setError('La hora de fin debe ser posterior a la de inicio'); return }
    const err = await m.write('home_visits', {
      home_id: home.id, visit_date: date, start_time: start, end_time: end || null, attendee_id: attendee, status
    }, visit?.id)
    if (err) { setError(err); return }
    // El piso avanza de estado solo
    if (status === 'done' && (home.status === 'interesa' || home.status === 'llamar' || home.status === 'visita_pedida')) await m.write('homes', { status: 'visitado' }, home.id)
    else if (status === 'scheduled' && (home.status === 'interesa' || home.status === 'llamar')) await m.write('homes', { status: 'visita_pedida' }, home.id)
    onClose()
  }

  return (
    <Sheet title={`Visita · ${home.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {/* El día en su propia fila: en tres columnas no se leía entero */}
        <TextField label="Día" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Hora" type="time" value={start} onChange={e => setStart(e.target.value)} required />
          <TextField label="Hasta" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <Choice<string | null> label="Quién va" value={attendee} onChange={setAttendee}
          options={[{ value: null, label: 'Los dos' }, ...adults.map(a => ({ value: a.id as string | null, label: a.display_name, color: a.color }))]} />
        <Choice<HomeVisit['status']> label="Estado" value={status} onChange={setStatus}
          options={[{ value: 'scheduled', label: 'Prevista' }, { value: 'done', label: 'Hecha' }, { value: 'cancelled', label: 'Cancelada' }]} />

        <p className="text-[13px] text-muted -mt-2">Lo que veáis (luz, humedades, ruido, derramas…) apuntadlo en la ficha: «🔍 Estado de la vivienda», y lo demás en las notas de abajo. Así queda todo junto aunque hagáis varias visitas.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">{visit ? 'Guardar' : 'Apuntar visita'}</button>
        {visit && <ConfirmDelete label="Eliminar visita" confirming={confirming} setConfirming={setConfirming} onConfirm={async () => { await m.remove('home_visits', visit.id); onClose() }} />}
      </form>
    </Sheet>
  )
}

export function HomeOfferSheet({ home, offer, m, onClose }: { home: Home; offer?: HomeOffer; m: Mudanza; onClose: () => void }) {
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
