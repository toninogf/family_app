// Extras de una casa al editarla, con el sistema de calefacción y el aire dentro de sus grupos (igual que en «Qué buscamos»)
import { GroupedChips } from '../../components/FormKit'
import { EQUIP_SETS, FEATURE_GROUPS, HEAT_EMITTERS, HOUSE_ONE_OF, equipGroups, equipLabel, type Cooling, type HeatingType } from '../../lib/mudanza'

export function EquipChips({ label, features, setFeatures, heat, setHeat, cool, setCool, exclude = [] }: {
  label: string; features: string[]; setFeatures: (v: string[]) => void
  heat: HeatingType | null; setHeat: (v: HeatingType | null) => void
  cool: Cooling | null; setCool: (v: Cooling | null) => void
  exclude?: string[]
}) {
  const value = [...features, ...(heat ? [`sis:${heat}`] : []), ...(cool ? [`clim:${cool}`] : [])]
  const groups = equipGroups(FEATURE_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => !exclude.includes(k)) })))
  return (
    <GroupedChips label={label} groups={groups} labels={equipLabel} sets={[...EQUIP_SETS, ...HOUSE_ONE_OF, HEAT_EMITTERS]} oneOf value={value}
      onChange={v => {
        // Si queda «aire» suelto de antes y se elige un tipo de aire, sobra
        const c = v.find(k => k.startsWith('clim:'))
        setFeatures(v.filter(k => !k.includes(':') && !(c && k === 'aire')))
        const h = v.find(k => k.startsWith('sis:'))
        setHeat(h ? h.slice(4) as HeatingType : null)
        setCool(c ? c.slice(5) as Cooling : null)
      }} />
  )
}
