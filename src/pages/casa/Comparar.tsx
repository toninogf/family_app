// Comparar casas marcadas: resumen en texto y tabla con lo mejor de cada fila
import { type ReactNode } from 'react'
import { badPoints, compareSummary, monthlyCost, shortName } from '../../lib/compare'

import { COOLING, FEATURES, HEATING, accessCount, shownFeatures, mustHaveCheck, niceCount, perM2, price, equivRooms, roomsLabel, type Home, type Mudanza } from '../../lib/mudanza'
import { Sheet } from '../../components/Sheet'
import { buyerFee, buyingCosts, rangeK, readyPrice, reformTotal } from '../../lib/reforma'
import { useSchoolSummaries } from './HomeSchools'
import { distLabel } from '../../lib/colegios'
import { VerdictChip } from './DeepAnalysis'
import { homeScore } from '../../lib/score'
import { ScoreBadge, Rich } from './BuscamosComun'

export function CompareSheet({ homes, m, onRemove, onClose }: { homes: Home[]; m: Mudanza; onRemove: (id: string) => void; onClose: () => void }) {
  const summary = compareSummary(homes, m.criteria, m.homeVisits)
  const schools = useSchoolSummaries(homes)
  const musts = (h: Home) => { const c = mustHaveCheck(h, m.criteria); return c.length ? c.filter(x => x.ok).length / c.length : null }
  const ENERGY = 'ABCDEFG'

  // Cada fila: cómo se muestra y, si tiene sentido, qué valor es mejor (para resaltarlo)
  type Row = { label: string; show: (h: Home) => ReactNode; value?: (h: Home) => number | null; better?: 'low' | 'high' }
  const rows: Row[] = [
    { label: 'Análisis IA', show: h => <VerdictChip h={h} /> },
    { label: 'Precio justo (IA)', show: h => h.deep_analysis?.data?.precio?.justo ? `${Math.round(h.deep_analysis.data.precio.justo).toLocaleString('es-ES')} €` : '—', value: h => h.deep_analysis?.data?.precio?.justo ?? null },
    { label: 'Nota', show: h => { const s = schools[h.id]; return <ScoreBadge s={homeScore(h, m, s ? (s.pubPri ?? s.closest)?.dist ?? null : null)} /> }, value: h => { const s = schools[h.id]; return homeScore(h, m, s ? (s.pubPri ?? s.closest)?.dist ?? null : null).score }, better: 'high' },
    { label: 'Precio', show: h => price(h.price_cents), value: h => h.price_cents, better: 'low' },
    { label: 'Reforma', show: h => { const t = reformTotal(h.reform, h); return t ? rangeK(t.lo, t.hi) : h.reform?.state === 'listo' ? 'No necesita' : '¿?' }, value: h => (h.reform?.state || h.reform?.items?.length ? reformTotal(h.reform, h)?.mid ?? 0 : null), better: 'low' },
    { label: 'Gastos de compra', show: h => (h.price_cents != null ? price(buyingCosts(h)) : '—'), value: h => (h.price_cents != null ? buyingCosts(h) : null), better: 'low' },
    { label: 'Honorarios comprador', show: h => (h.advertiser === 'particular' ? 'No (particular)' : h.buyer_fee_kind === 'no' ? 'No' : buyerFee(h) != null ? price(buyerFee(h)) : '¿?'), value: h => (h.advertiser === 'particular' ? 0 : buyerFee(h)), better: 'low' },
    { label: 'Para entrar a vivir', show: h => price(readyPrice(h)), value: readyPrice, better: 'low' },
    { label: 'm²', show: h => (h.size_m2 != null ? Number(h.size_m2) : '—'), value: h => (h.size_m2 != null ? Number(h.size_m2) : null), better: 'high' },
    { label: 'Parcela', show: h => (h.plot_m2 != null ? `${Number(h.plot_m2)} m²` : '—'), value: h => (h.plot_m2 != null ? Number(h.plot_m2) : null), better: 'high' },
    { label: 'Año', show: h => h.year_built ?? '—', value: h => h.year_built, better: 'high' },
    { label: '€/m²', show: h => price(perM2(h)), value: perM2, better: 'low' },
    { label: 'Habitaciones', show: h => roomsLabel(h) ?? '—' },
    { label: 'Hab. equivalentes', show: h => equivRooms(h)?.total ?? '—', value: h => equivRooms(h)?.total ?? null, better: 'high' },
    { label: 'Baños', show: h => h.baths ?? '—', value: h => h.baths, better: 'high' },
    { label: 'Planta', show: h => h.floor ?? '—' },
    { label: 'Localidad', show: h => h.municipality ?? '—' },
    { label: 'Zona', show: h => h.zone ?? '—' },
    { label: 'Extras', show: h => (h.features.length ? shownFeatures(h).map(f => FEATURES[f] ?? f).join(', ') : '—'), value: h => h.features.length, better: 'high' },
    { label: 'Imprescindibles', show: h => { const c = mustHaveCheck(h, m.criteria); const r = c.filter(x => x.reform).length; return c.length ? <>{c.filter(x => x.ok).length}/{c.length}{r ? <span className="text-[#C77A12]"> · 🔨{r}</span> : null}</> : '—' }, value: musts, better: 'high' },
    { label: 'Accesibilidad', show: h => { const a = accessCount(h, m.criteria); return a.want.length ? `${a.got.length}/${a.want.length}` : '—' }, value: h => (m.criteria?.access_items?.length ? accessCount(h, m.criteria).got.length : null), better: 'high' },
    { label: 'Valoramos', show: h => { const n = niceCount(h, m.criteria); return n.want.length ? `${n.got.length}/${n.want.length}` : '—' }, value: h => (m.criteria?.nice_to_haves?.length ? niceCount(h, m.criteria).got.length : null), better: 'high' },
    { label: 'Piscina', show: h => (h.features.includes('piscina') ? 'Propia' : h.features.includes('piscina_comunitaria') ? 'Comunitaria' : '—'), value: h => (h.features.includes('piscina') ? 2 : h.features.includes('piscina_comunitaria') ? 1 : 0), better: 'high' },
    { label: 'Comunidad', show: h => (h.community_fee_cents != null ? `${price(h.community_fee_cents)}/mes` : '—'), value: h => h.community_fee_cents, better: 'low' },
    { label: 'IBI', show: h => (h.ibi_cents != null ? `${price(h.ibi_cents)}/año` : '—'), value: h => h.ibi_cents, better: 'low' },
    { label: 'Luz', show: h => (h.electricity_cents != null ? `${price(h.electricity_cents)}/mes` : '—'), value: h => h.electricity_cents, better: 'low' },
    { label: 'Agua', show: h => (h.water_cents != null ? `${price(h.water_cents)}/mes` : '—'), value: h => h.water_cents, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_cents != null ? `${price(h.heating_cents)}/mes` : '—'), value: h => h.heating_cents, better: 'low' },
    { label: 'Gastos fijos', show: h => (monthlyCost(h) != null ? `${price(monthlyCost(h))}/mes` : '—'), value: monthlyCost, better: 'low' },
    { label: 'Calefacción', show: h => (h.heating_type ? HEATING[h.heating_type] : '—'), value: () => null, better: 'high' },
    { label: 'Placas solares', show: h => (h.features.includes('placas_solares') ? `Sí${h.health?.solar?.n ? ` (${h.health.solar.n.slice(0, 40)})` : ''}` : h.features.includes('solar_termica') ? 'Térmicas' : '—'), value: h => (h.features.includes('placas_solares') ? 1 : 0), better: 'high' },
    { label: 'Aire', show: h => (h.cooling ? COOLING[h.cooling] : '—'), value: () => null, better: 'high' },
    { label: 'Energía', show: h => h.energy ?? '—', value: h => (h.energy ? ENERGY.indexOf(h.energy) : null), better: 'low' },
    { label: 'Colegios < 1,5 km', show: h => (schools[h.id] ? schools[h.id].near : '—'), value: h => schools[h.id]?.near ?? null, better: 'high' },
    { label: 'Público primaria', show: h => { const s = schools[h.id]?.pubPri; return s ? `${distLabel(s.dist)}${s.bilingual ? ' · bil.' : ''}` : '—' }, value: h => schools[h.id]?.pubPri?.dist ?? null, better: 'low' },
    { label: 'Instituto público', show: h => { const s = schools[h.id]?.pubSec; return s ? distLabel(s.dist) : '—' }, value: h => schools[h.id]?.pubSec?.dist ?? null, better: 'low' },
    { label: 'Al cole', show: h => (h.minutes_to_school != null ? `${h.minutes_to_school} min` : '—'), value: h => h.minutes_to_school, better: 'low' },
    { label: 'Problemas', show: h => badPoints(h).length || '—', value: h => badPoints(h).length, better: 'low' }
  ]
  const isBest = (r: Row, h: Home) => {
    if (!r.value || !r.better) return false
    const vals = homes.map(r.value).filter((v): v is number => v != null)
    const v = r.value(h)
    if (v == null || vals.length < 2 || new Set(vals).size < 2) return false
    return v === (r.better === 'low' ? Math.min(...vals) : Math.max(...vals))
  }

  return (
    <Sheet title="Comparar pisos" onClose={onClose} variant="wide">
      <section className="flex flex-col gap-2 bg-card rounded-2xl p-4">
        <h3 className="font-bold text-[15px]">Diferencias importantes</h3>
        {summary.length === 0
          ? <p className="text-sm text-muted">No hay diferencias destacables con los datos que tenéis. Completa precio, metros y extras para que salgan.</p>
          : <ul className="flex flex-col gap-1.5">{summary.map((t, i) => <li key={i} className="text-[14px] leading-snug"><Rich text={t} /></li>)}</ul>}
      </section>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="text-[13px] border-separate border-spacing-0 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg text-left p-2" />
              {homes.map(h => (
                <th key={h.id} className="p-2 text-left align-bottom min-w-[120px] font-bold">
                  <span className="block">{shortName(h)}</span>
                  <button onClick={() => onRemove(h.id)} className="text-[11px] font-semibold text-muted">✕ quitar</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <th scope="row" className="sticky left-0 bg-bg text-left p-2 text-muted font-semibold border-t border-line whitespace-nowrap">{r.label}</th>
                {homes.map(h => (
                  <td key={h.id} className={`p-2 border-t border-line ${isBest(r, h) ? 'text-accent font-bold bg-accent-soft' : ''}`}>{r.show(h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">En azul, el mejor de cada fila.</p>
    </Sheet>
  )
}
