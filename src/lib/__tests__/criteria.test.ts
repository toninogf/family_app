import { describe, expect, it } from 'vitest'
import { accessCount, critItems, equivRooms, meets, mustHaveCheck, niceCount, roomsLabel, shownFeatures } from '../mudanza'
import { criteria, home } from './fixtures'

describe('critItems · opciones que se excluyen cuentan como una', () => {
  it('aerotermia y geotermia son una sola', () => {
    expect(critItems(['aerotermia', 'aire', 'geotermia'])).toEqual(['aerotermia|geotermia', 'aire'])
  })
  it('radiadores y suelo radiante cuentan por separado', () => {
    expect(critItems(['radiadores', 'suelo_radiante'])).toEqual(['radiadores', 'suelo_radiante'])
  })
})

describe('meets · ¿la casa lo tiene?', () => {
  it('basta con una de las alternativas', () => {
    expect(meets(home({ heating_type: 'geotermia' }), 'aerotermia|geotermia')).toBe(true)
    expect(meets(home({ heating_type: 'gasoil' }), 'aerotermia|geotermia')).toBe(false)
  })
  it('«calefacción (cualquiera)» vale con cualquier sistema, no con «ninguna»', () => {
    expect(meets(home({ heating_type: 'gasoil' }), 'calefaccion_cualquiera')).toBe(true)
    expect(meets(home({ features: ['radiadores'] }), 'calefaccion_cualquiera')).toBe(true)
    expect(meets(home({ heating_type: 'ninguna' }), 'calefaccion_cualquiera')).toBe(false)
    expect(meets(home(), 'calefaccion_cualquiera')).toBe(false)
  })
  it('lo general incluye lo concreto', () => {
    expect(meets(home({ features: ['garaje_cerrado'] }), 'garaje')).toBe(true)
    expect(meets(home({ features: ['sotano_habitable'] }), 'sotano')).toBe(true)
    expect(meets(home({ features: ['piscina_comunitaria'] }), 'piscina_cualquiera')).toBe(true)
    expect(meets(home({ cooling: 'conductos' }), 'aire')).toBe(true)
    expect(meets(home({ cooling: 'no' }), 'aire')).toBe(false)
  })
  it('lo concreto no vale con lo general', () => {
    expect(meets(home({ features: ['garaje'] }), 'garaje_cerrado')).toBe(false)
    expect(meets(home({ cooling: 'splits' }), 'aire_conductos')).toBe(false)
  })
})

describe('habitaciones equivalentes', () => {
  it('buhardilla y sótano habitable suman una cada uno', () => {
    expect(equivRooms(home({ rooms: 4, features: ['buhardilla', 'sotano_habitable'] }))!.total).toBe(6)
    expect(equivRooms(home({ rooms: 4, features: ['sotano'] }))!.total).toBe(4)
    expect(roomsLabel(home({ rooms: 4, features: ['buhardilla'] }))).toBe('4 hab. + buhardilla')
  })
  it('sin habitaciones no se inventa nada', () => {
    expect(equivRooms(home({ rooms: null }))).toBeNull()
  })
})

describe('mustHaveCheck · imprescindibles', () => {
  const byLabel = (h: ReturnType<typeof home>, c: ReturnType<typeof criteria>, start: string) => mustHaveCheck(h, c).find(x => x.label.startsWith(start))!
  it('la buhardilla hace cumplir las habitaciones mínimas', () => {
    const c = criteria({ min_rooms: 5 })
    expect(byLabel(home({ rooms: 4 }), c, '5+').ok).toBe(false)
    expect(byLabel(home({ rooms: 4, features: ['buhardilla'] }), c, '5+').ok).toBe(true)
  })
  it('metros: por poco (menos de un 10 %) se marca como «near»', () => {
    const c = criteria()
    expect(byLabel(home({ size_m2: 190 }), c, '200+').near).toBe(true)
    expect(byLabel(home({ size_m2: 170 }), c, '200+').near).toBe(false)
    expect(byLabel(home({ size_m2: 170 }), c, '200+').ok).toBe(false)
  })
  it('parcela mínima y sin dato', () => {
    const c = criteria()
    expect(byLabel(home({ plot_m2: 280 }), c, 'Parcela').near).toBe(true)
    expect(byLabel(home({ plot_m2: null }), c, 'Parcela').ok).toBeNull()
  })
  it('localidad fuera de las buscadas no cumple', () => {
    expect(byLabel(home({ municipality: 'Galapagar' }), criteria(), 'Moralzarzal').ok).toBe(false)
  })
  it('las alternativas marcadas como imprescindibles son un solo punto', () => {
    const c = criteria({ must_haves: ['piscina', 'piscina_comunitaria'] })
    const all = mustHaveCheck(home({ features: ['piscina_comunitaria'] }), c)
    expect(all.filter(x => /piscina/i.test(x.label))).toHaveLength(1)
    expect(all.find(x => /piscina/i.test(x.label))!.ok).toBe(true)
  })
})

describe('niceCount y accessCount', () => {
  it('cuenta grupos, no opciones sueltas', () => {
    const c = criteria({ nice_to_haves: ['aerotermia', 'geotermia', 'aire', 'trastero'] })
    const n = niceCount(home({ heating_type: 'aerotermia', cooling: 'splits' }), c)
    expect(n.want).toHaveLength(3)
    expect(n.got).toHaveLength(2)
  })
  it('lo que da la reforma va aparte', () => {
    const c = criteria({ nice_to_haves: ['aire'] })
    const n = niceCount(home({ reform: { state: 'parcial', items: [{ k: 'aire', src: 'manual' }] } as never }), c)
    expect(n.got).toHaveLength(0)
    expect(n.viaReform).toEqual(['aire'])
  })
  it('«todo en una planta» cumple «dormitorio en planta baja»', () => {
    const c = criteria({ access_items: ['dormitorio_pb', 'una_planta', 'acceso_llano'] })
    expect(accessCount(home({ features: ['una_planta'] }), c).got).toEqual(['dormitorio_pb', 'una_planta'])
  })
})

describe('shownFeatures · extras que se enseñan', () => {
  it('sin repetidos y en el orden de los grupos', () => {
    const f = shownFeatures(home({ features: ['garaje', 'trastero', 'garaje_cerrado', 'jardin', 'sotano', 'sotano_habitable', 'calefaccion'] }))
    expect(f).not.toContain('garaje')
    expect(f).not.toContain('sotano')
    expect(f).not.toContain('calefaccion')
    expect(f[0]).toBe('jardin')
  })
})
