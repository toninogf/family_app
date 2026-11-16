// «🏁 Decidir»: las finalistas lado a lado para elegir con la cabeza fría.
// Quién gana y por qué, en qué no estáis de acuerdo, qué la descarta y qué falta antes de ofertar.
import type { Criteria, Home, HomeVisit, Rating } from './mudanza'
import { mustHaveCheck } from './mudanza'
import { homeScore, SCORE_BLOCKS, type HomeScore, type ScoreKey } from './score'
import { badPoints } from './compare'
import { reformKnown } from './reforma'
import { qaProgress } from './visitQA'

export type DecideCtx = {
  criteria: Criteria | null; ratings: Rating[]; homes: Home[]; homeVisits: HomeVisit[]
  offers?: Parameters<typeof homeScore>[1]['offers']; listing?: Parameters<typeof homeScore>[1]['listing']
  adults: { id: string; name: string }[]
  /** metros al cole público de primaria, por casa */
  schoolDist?: Record<string, number | null | undefined>
}
export type Finalist = {
  h: Home; score: HomeScore
  ratings: { id: string; name: string; score: number | null }[]
  /** Diferencia de puntuación entre vosotros (≥ 2: hablad de ella) */
  gap: number | null
  problems: string[]; todo: string[]
}

/** Finalistas: favoritas y con oferta; si no llegan a 2, se completan con las mejores visitadas */
export function pickFinalists(homes: Home[], ctx: DecideCtx, max = 4): Home[] {
  const sc = (h: Home) => homeScore(h, ctx, ctx.schoolDist?.[h.id] ?? null).score
  const core = homes.filter(h => h.status === 'favorito' || h.status === 'oferta')
  const extra = core.length >= 2 ? [] : homes
    .filter(h => !core.includes(h) && ['visitado', 'visita_pedida', 'interesa', 'llamar'].includes(h.status))
    .sort((a, b) => Number(b.status === 'visitado') - Number(a.status === 'visitado') || sc(b) - sc(a))
    .slice(0, Math.max(0, 3 - core.length))
  return [...core, ...extra].sort((a, b) => sc(b) - sc(a)).slice(0, max)
}

/** Lo que falta saber de una casa antes de hacer una oferta en firme */
export function beforeOffer(h: Home, ctx: DecideCtx): string[] {
  const out: string[] = []
  const done = ctx.homeVisits.filter(v => v.home_id === h.id && v.status === 'done').length
  if (!done) out.push('Visitarla')
  else if (done === 1) out.push('Segunda visita (a otra hora, con otra luz)')
  if (!reformKnown(h.reform)) out.push('Valorar la reforma')
  if (!h.registry) out.push('Pedir la nota simple')
  if (!h.cadastre) out.push('Comprobar el Catastro')
  if (!h.deep_analysis) out.push('Análisis a fondo con IA')
  const qa = qaProgress(h, ctx.criteria)
  if (done && qa.pending) out.push(`${qa.pending} pregunta${qa.pending === 1 ? '' : 's'} del cuestionario sin contestar`)
  for (const a of ctx.adults) if (!ctx.ratings.some(r => r.home_id === h.id && r.member_id === a.id)) out.push(`${a.name}: falta su puntuación`)
  return out
}

/** Lo que juega claramente en contra */
export function problemsOf(h: Home, c: Criteria | null): string[] {
  const out = mustHaveCheck(h, c).filter(x => x.ok === false).map(x => `No cumple: ${x.label}${x.reform ? ' (con reforma, sí)' : ''}`)
  for (const b of badPoints(h)) out.push(`Mal en la visita o los papeles: ${b}`)
  if (h.deep_analysis?.data?.veredicto === 'no') out.push('El análisis con IA dice que no')
  return out
}

export function finalists(homes: Home[], ctx: DecideCtx): Finalist[] {
  return homes.map(h => {
    const ratings = ctx.adults.map(a => ({ ...a, score: ctx.ratings.find(r => r.home_id === h.id && r.member_id === a.id)?.score ?? null }))
    const given = ratings.map(r => r.score).filter((x): x is number => x != null)
    return {
      h, score: homeScore(h, ctx, ctx.schoolDist?.[h.id] ?? null), ratings,
      gap: given.length >= 2 ? Math.max(...given) - Math.min(...given) : null,
      problems: problemsOf(h, ctx.criteria), todo: beforeOffer(h, ctx)
    }
  }).sort((a, b) => b.score.score - a.score.score)
}

const label = (k: ScoreKey) => SCORE_BLOCKS.find(b => b.k === k)?.label.toLowerCase() ?? k

/** En qué gana y en qué pierde una casa frente a otra (bloques de la nota con ≥ 1,5 puntos de diferencia) */
export function headToHead(a: Finalist, b: Finalist) {
  const wins: ScoreKey[] = [], loses: ScoreKey[] = []
  for (const x of a.score.blocks) {
    const y = b.score.blocks.find(z => z.k === x.k)
    if (!y || x.missing || y.missing) continue
    if (x.score - y.score >= 1.5) wins.push(x.k)
    else if (y.score - x.score >= 1.5) loses.push(x.k)
  }
  return { wins, loses }
}

/** Frases del veredicto de arriba */
export function verdict(fs: Finalist[], name: (h: Home) => string): string[] {
  if (!fs.length) return []
  if (fs.length === 1) return [`Solo hay una finalista: **${name(fs[0].h)}**. Marcad otra como ⭐ favorita para compararlas.`]
  const [a, b] = fs
  const d = Math.round((a.score.score - b.score.score) * 10) / 10
  const out: string[] = []
  const { wins, loses } = headToHead(a, b)
  const list = (ks: ScoreKey[]) => ks.map(label).join(', ')
  if (d < 0.3) out.push(`Empate técnico entre **${name(a.h)}** y **${name(b.h)}** (${d.toLocaleString('es-ES')} puntos): decidirá lo que pese más para vosotros.`)
  else out.push(`Ahora mismo gana **${name(a.h)}**, ${d.toLocaleString('es-ES')} puntos por delante de **${name(b.h)}**.`)
  if (wins.length) out.push(`Gana en ${list(wins)}.`)
  if (loses.length) out.push(`**${name(b.h)}** es mejor en ${list(loses)}.`)
  if (a.problems.length) out.push(`⚠️ Ojo: ${name(a.h)} tiene ${a.problems.length} punto${a.problems.length === 1 ? '' : 's'} en contra.`)
  if (a.score.provisional) out.push(`La nota de ${name(a.h)} es provisional: faltan datos (mirad «Antes de ofertar»).`)
  const split = fs.filter(f => f.gap != null && f.gap >= 2)
  if (split.length) out.push(`🗣️ No estáis de acuerdo en ${split.map(f => `**${name(f.h)}**`).join(' y ')}: hablad de ella antes de decidir.`)
  return out
}
