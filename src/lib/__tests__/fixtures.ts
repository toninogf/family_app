// Datos de prueba: una casa y unos criterios parecidos a los reales
import type { Criteria, Home, Mudanza } from '../mudanza'

export const home = (p: Partial<Home> = {}): Home => ({
  id: 'h1', title: 'Chalet independiente · Zona Iglesia · Moralzarzal', url: null, address: 'Calle Uno 1', zone: 'Zona Iglesia', province: 'Madrid',
  municipality: 'Moralzarzal', price_cents: 605_000_00, size_m2: 256, plot_m2: 440, rooms: 5, baths: 3, floor: null, features: [],
  heating_type: null, cooling: null, energy: null, links: [], health: {}, reform: {}, market: null, cadastre: null, flood: null, registry: null,
  community_fee_cents: null, ibi_cents: null, ref_value_cents: null, new_build: false, useful_m2: null, year_built: 1999,
  advertiser: 'agencia', buyer_fee_kind: 'no', buyer_fee_pct: null, buyer_fee_cents: null, buyer_fee_vat: false, status: 'interesa', notes: null,
  ...p
} as unknown as Home)

export const criteria = (p: Partial<Criteria> = {}): Criteria => ({
  household_id: 'hh', max_price_cents: 700_000_00, min_rooms: 4, min_m2: 200, min_plot_m2: 300, ideal_m2: 300, ideal_plot_m2: 600,
  zones: [], municipalities: ['Moralzarzal'], must_haves: [], nice_to_haves: [], access_items: [], ...p
} as Criteria)

type Sale = Pick<Mudanza, 'offers' | 'listing'>
/** Nuestra venta: publicado a 680.000 €, con 100.000 € de hipoteca pendiente y 13.050 € de gastos */
export const sale = (p: { price?: number | null; accepted?: number } = {}): Sale => ({
  listing: { price_cents: p.price === undefined ? 680_000_00 : p.price, mortgage_cents: 100_000_00, costs: [{ label: 'Plusvalía', cents: 10_000_00 }, { label: 'Notaría', cents: 3_050_00 }] },
  offers: p.accepted ? [{ status: 'accepted', amount_cents: p.accepted }] : []
} as unknown as Sale)
