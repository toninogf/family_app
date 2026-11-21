import { describe, expect, it } from 'vitest'
import { coolingFrom, heatingFrom } from '../listingParse'
import { meets } from '../mudanza'

describe('bomba de calor', () => {
  it('aire-agua es aerotermia; a secas, aire-aire', () => {
    expect(heatingFrom('Aerotermia con suelo radiante')).toBe('aerotermia')
    expect(heatingFrom('bomba de calor aire-agua')).toBe('aerotermia')
    expect(heatingFrom('Calefacción por bomba de calor')).toBe('bomba_calor')
    expect(coolingFrom('bomba de calor por conductos')).toBe('conductos')
    expect(coolingFrom('bomba de calor')).toBe('si')
  })
  it('cuenta como sistema de calefacción', () => {
    expect(meets({ features: [], heating_type: 'bomba_calor' }, 'bomba_calor')).toBe(true)
    expect(meets({ features: [], heating_type: 'bomba_calor' }, 'calefaccion_cualquiera')).toBe(true)
    expect(meets({ features: [], heating_type: 'bomba_calor' }, 'aerotermia')).toBe(false)
  })
})
