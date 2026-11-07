import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { uploadDocFiles, type DocFile } from './mudanza'

// ---------- Tipos ----------
export type Contact = { role: string; name: string; phone?: string; email?: string }
export type Cost = { label: string; cents: number }
export type ArrasType = 'penitenciales' | 'confirmatorias' | 'penales'
export type MortgagePhase = 'preaprobacion' | 'tasacion' | 'fein' | 'oferta_vinculante' | 'firmada'
export type Purchase = {
  household_id: string; home_id: string | null; conditions: string | null; subject_to_mortgage: boolean; subject_to_sale: boolean
  arras_type: ArrasType | null; delivery_date: string | null; savings_cents: number | null; loan_cents: number | null
  costs: Cost[]; contacts: Contact[]; mortgage_phase: MortgagePhase | null; fein_date: string | null
}
export type DocGroup = 'comprobacion' | 'banco' | 'final'
export type PDocStatus = 'pendiente' | 'pedido' | 'ok' | 'problema' | 'no_aplica'
export type PurchaseDoc = {
  id: string; grp: DocGroup; doc_key: string | null; title: string; status: PDocStatus; expires_on: string | null
  files: DocFile[]; notes: string | null; position: number
}
export type PStepKind = 'reserva' | 'arras' | 'hipoteca' | 'firma' | 'registro' | 'suministros' | 'otro'
export type PurchaseStep = {
  id: string; kind: PStepKind; title: string; step_date: string | null; step_time: string | null; location: string | null
  amount_cents: number | null; notes: string | null; checklist: Record<string, boolean>; done: boolean; position: number
}
export type RateType = 'fijo' | 'variable' | 'mixto'
export type MortgageOffer = {
  id: string; bank: string; rate_type: RateType; amount_cents: number | null; years: number | null; tin: number | null; tae: number | null
  monthly_cents: number | null; ties: string | null; fees: string | null; notes: string | null; chosen: boolean
}

const TABLES = ['purchase', 'purchase_docs', 'purchase_steps', 'mortgage_offers']

export function useCompra() {
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [docs, setDocs] = useState<PurchaseDoc[]>([])
  const [steps, setSteps] = useState<PurchaseStep[]>([])
  const [banks, setBanks] = useState<MortgageOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [p, d, s, b] = await Promise.all([
      supabase.from('purchase').select('*').maybeSingle(),
      supabase.from('purchase_docs').select('id, grp, doc_key, title, status, expires_on, files, notes, position').order('position').order('title'),
      supabase.from('purchase_steps').select('id, kind, title, step_date, step_time, location, amount_cents, notes, checklist, done, position').order('position'),
      supabase.from('mortgage_offers').select('id, bank, rate_type, amount_cents, years, tin, tae, monthly_cents, ties, fees, notes, chosen').order('created_at')
    ])
    const firstError = [p, d, s, b].find(x => x.error)?.error
    if (firstError) setError(firstError.message)
    setPurchase((p.data as Purchase | null) ?? null)
    setDocs((d.data ?? []) as PurchaseDoc[])
    setSteps((s.data ?? []) as PurchaseStep[])
    setBanks(((b.data ?? []) as MortgageOffer[]).map(x => ({ ...x, tin: x.tin == null ? null : Number(x.tin), tae: x.tae == null ? null : Number(x.tae) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    let channel = supabase.channel(`compra:${crypto.randomUUID()}`)
    for (const t of TABLES) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => load())
    channel.subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  async function write(table: string, data: Record<string, unknown>, id?: string): Promise<string | undefined> {
    const q = id
      ? supabase.from(table).update(data).eq('id', id)
      : table === 'purchase'
        ? supabase.from(table).upsert(data, { onConflict: 'household_id' })
        : supabase.from(table).insert(data)
    const { error } = await q
    if (error) {
      const msg = /check constraint|violates/i.test(error.message) ? 'Algún dato no es válido. Revisa los campos.' : error.message
      setError(msg); return msg
    }
    await load()
  }

  async function remove(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  /** Guarda campos de la compra (fila única del hogar) */
  const savePurchase = (householdId: string, data: Partial<Purchase>) => write('purchase', { household_id: householdId, ...data })

  /** Añade archivos (PDF o fotos) a un documento, en la carpeta privada <hogar>/compra/ */
  async function uploadDoc(householdId: string, doc: PurchaseDoc, list: File[], onProgress?: (i: number) => void) {
    const { added, error } = await uploadDocFiles(`${householdId}/compra`, list, 20 - doc.files.length, onProgress)
    if (added.length) {
      const err = await write('purchase_docs', { files: [...doc.files, ...added], status: doc.status === 'problema' ? 'problema' : 'ok' }, doc.id)
      if (err) return err
    }
    if (error) setError(error)
    return error
  }
  async function removeDocFile(doc: PurchaseDoc, f: DocFile) {
    await supabase.storage.from('sale-docs').remove([f.path])
    return write('purchase_docs', { files: doc.files.filter(x => x.path !== f.path) }, doc.id)
  }
  async function removeDoc(doc: PurchaseDoc) {
    if (doc.files.length) await supabase.storage.from('sale-docs').remove(doc.files.map(f => f.path))
    await remove('purchase_docs', doc.id)
  }

  /** Solo una oferta de hipoteca elegida a la vez */
  async function chooseBank(id: string) {
    for (const b of banks) if (b.chosen && b.id !== id) await supabase.from('mortgage_offers').update({ chosen: false }).eq('id', b.id)
    return write('mortgage_offers', { chosen: true }, id)
  }

  return { purchase, docs, steps, banks, loading, error, clearError: () => setError(''), write, remove, savePurchase, uploadDoc, removeDocFile, removeDoc, chooseBank }
}
export type Compra = ReturnType<typeof useCompra>

/** Cuota mensual (sistema francés) */
export function monthlyPayment(amountCents: number | null, tin: number | null, years: number | null) {
  if (!amountCents || tin == null || !years) return null
  const n = years * 12, r = tin / 100 / 12
  return Math.round(r === 0 ? amountCents / n : (amountCents * r) / (1 - Math.pow(1 + r, -n)))
}

// ---------- Plantillas ----------
type DocTpl = { key: string; title: string; hint: string; months?: number }
/** Antes de ofertar: lo que conviene comprobar del piso */
export const CHECK_TEMPLATE: DocTpl[] = [
  { key: 'nota_simple', title: 'Nota simple del Registro', hint: 'Que vende quien es dueño, y si hay hipotecas, embargos o usufructos. Se pide en registradores.org (unos 10 €).', months: 3 },
  { key: 'catastro', title: 'Catastro: m², uso y referencia', hint: 'Que los metros y el uso coincidan con el anuncio y con la nota simple (sede del Catastro, gratis).' },
  { key: 'comunidad', title: 'Comunidad al corriente y sin derramas', hint: 'Certificado del administrador; pregunta por derramas aprobadas o previstas y pide las últimas actas.', months: 1 },
  { key: 'ibi', title: 'IBI pagado', hint: 'Último recibo. Las deudas de IBI pueden pasar al nuevo dueño.' },
  { key: 'cee', title: 'Certificado energético', hint: 'Obligatorio para vender. Da idea del gasto en calefacción.' },
  { key: 'ite', title: 'ITE / IEE del edificio', hint: 'Si tiene más de 45-50 años: que esté pasada y sin obras pendientes.' },
  { key: 'obras', title: 'Obras y ampliaciones legalizadas', hint: 'Buhardillas, porches, piscinas, cerramientos: que tengan licencia y estén en la escritura.' },
  { key: 'urbanismo', title: 'Situación urbanística (chalets)', hint: 'Cédula o informe urbanístico del ayuntamiento: parcela, afecciones, si se puede ampliar.' },
  { key: 'suministros_check', title: 'Suministros sin deudas', hint: 'Últimas facturas de luz, agua y gas; potencia contratada.' },
  { key: 'ocupacion', title: 'Libre de inquilinos u ocupantes', hint: 'Que se entregue vacío; si hay alquiler, revisar el contrato.' }
]
/** Lo que pide el banco para la hipoteca */
export const BANK_TEMPLATE: DocTpl[] = [
  { key: 'dni', title: 'DNI de los dos', hint: 'En vigor.' },
  { key: 'nominas', title: 'Últimas 3 nóminas', hint: 'De cada titular.' },
  { key: 'irpf', title: 'Última declaración de la renta', hint: 'Con el modelo 100 completo.' },
  { key: 'vida_laboral', title: 'Informe de vida laboral', hint: 'Seguridad Social (Importass), en el momento.', months: 1 },
  { key: 'contrato', title: 'Contrato de trabajo', hint: 'O certificado de empresa con antigüedad y tipo de contrato.' },
  { key: 'extractos', title: 'Extractos bancarios (6 meses)', hint: 'Para ver ahorro y gastos.' },
  { key: 'deudas', title: 'Otros préstamos', hint: 'Cuadro de amortización de préstamos en curso, si hay.' },
  { key: 'arras_copia', title: 'Contrato de arras firmado', hint: 'El banco lo pide para la tasación y la oferta.' },
  { key: 'tasacion', title: 'Tasación', hint: 'La hace una tasadora homologada; caduca a los 6 meses.', months: 6 },
  { key: 'fein', title: 'FEIN y FiAE', hint: 'Oferta vinculante: desde que la recibís hay al menos 10 días hasta la firma.' }
]
/** Al final: lo que hay que guardar */
export const FINAL_TEMPLATE: DocTpl[] = [
  { key: 'arras', title: 'Contrato de arras', hint: 'Firmado por las dos partes.' },
  { key: 'escritura', title: 'Escritura de compraventa', hint: 'Copia simple el día de la firma; la copia autorizada llega después.' },
  { key: 'escritura_hipoteca', title: 'Escritura de la hipoteca', hint: 'Con el cuadro de amortización.' },
  { key: 'itp', title: 'Justificante del ITP', hint: 'Modelo 600, en los 30 días hábiles siguientes a la firma.' },
  { key: 'registro', title: 'Inscripción en el Registro', hint: 'Nota de inscripción a vuestro nombre.' },
  { key: 'contratos_suministros', title: 'Contratos de luz, agua, gas e internet', hint: 'A vuestro nombre.' },
  { key: 'seguro_hogar', title: 'Seguro de hogar', hint: 'Desde el día de la firma.' }
]
export const GROUP_TEMPLATES: Record<DocGroup, DocTpl[]> = { comprobacion: CHECK_TEMPLATE, banco: BANK_TEMPLATE, final: FINAL_TEMPLATE }

export const PSTEP_TEMPLATE: { kind: PStepKind; title: string; checklist: { key: string; label: string }[] }[] = [
  { kind: 'reserva', title: 'Reserva', checklist: [
    { key: 'oferta_aceptada', label: 'Oferta aceptada por escrito' },
    { key: 'documento', label: 'Documento de reserva con importe, plazo y qué pasa si no hay hipoteca' },
    { key: 'pago', label: 'Pago por transferencia (nunca en efectivo)' }
  ] },
  { kind: 'arras', title: 'Firma de arras', checklist: [
    { key: 'comprobaciones', label: 'Comprobaciones del piso hechas (nota simple reciente)' },
    { key: 'tipo', label: 'Tipo de arras y plazo para firmar en notaría claros' },
    { key: 'condicion', label: 'Cláusula si el banco no da la hipoteca' },
    { key: 'muebles', label: 'Qué se queda (muebles, electrodomésticos) por escrito' },
    { key: 'pago', label: 'Arras pagadas por transferencia' }
  ] },
  { kind: 'hipoteca', title: 'Hipoteca aprobada (FEIN)', checklist: [
    { key: 'tasacion', label: 'Tasación hecha' },
    { key: 'fein', label: 'FEIN recibida (10 días antes de la firma)' },
    { key: 'notario_acta', label: 'Acta de transparencia en la notaría' },
    { key: 'seguros', label: 'Seguros de vida y hogar elegidos' }
  ] },
  { kind: 'firma', title: 'Firma en notaría', checklist: [
    { key: 'notaria', label: 'Notaría elegida (la elige quien compra)' },
    { key: 'borrador', label: 'Borrador de la escritura revisado' },
    { key: 'cheque', label: 'Dinero o cheques preparados con el banco' },
    { key: 'cargas', label: 'Hipoteca del vendedor se cancela en la firma' },
    { key: 'comunidad', label: 'Certificado de la comunidad al corriente' },
    { key: 'llaves', label: 'Llaves, mandos y lecturas de contadores' }
  ] },
  { kind: 'registro', title: 'Impuestos y registro', checklist: [
    { key: 'itp', label: 'ITP pagado (30 días hábiles)' },
    { key: 'plusvalia', label: 'Comunicar la compra al ayuntamiento (plusvalía la paga quien vende)' },
    { key: 'inscripcion', label: 'Escritura inscrita en el Registro' }
  ] },
  { kind: 'suministros', title: 'Cambios y mudanza', checklist: [
    { key: 'luz', label: 'Luz' }, { key: 'agua', label: 'Agua' }, { key: 'gas', label: 'Gas' }, { key: 'internet', label: 'Internet' },
    { key: 'empadronamiento', label: 'Empadronamiento' }, { key: 'colegio', label: 'Cambio de dirección (colegio, bancos, DGT)' }
  ] }
]

export const PCOST_TEMPLATE = ['ITP (impuesto de transmisiones)', 'Notaría', 'Registro', 'Gestoría', 'Tasación', 'Reforma', 'Muebles', 'Mudanza']
export const CONTACT_ROLES = ['Notaría', 'Banco', 'Gestoría', 'Tasadora', 'Agencia', 'Vendedor', 'Abogado']
export const ARRAS: Record<ArrasType, { label: string; hint: string }> = {
  penitenciales: { label: 'Penitenciales', hint: 'Lo habitual: si os echáis atrás perdéis lo pagado; si se echa atrás el vendedor, os devuelve el doble.' },
  confirmatorias: { label: 'Confirmatorias', hint: 'Son un adelanto del precio: si alguien incumple, se le puede exigir que cumpla o reclamar daños.' },
  penales: { label: 'Penales', hint: 'Si alguien incumple pierde las arras y además se le puede exigir que cumpla.' }
}
export const PHASES: { key: MortgagePhase; label: string }[] = [
  { key: 'preaprobacion', label: 'Preaprobada' }, { key: 'tasacion', label: 'Tasación' }, { key: 'fein', label: 'FEIN' },
  { key: 'oferta_vinculante', label: 'Oferta vinculante' }, { key: 'firmada', label: 'Firmada' }
]
