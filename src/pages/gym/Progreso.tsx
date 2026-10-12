import { useMemo, useState } from 'react'
import { addDays, shortDate, startOfWeek, today } from '../../lib/dates'
import { fmtKg, fmtNum, oneRm, volumeOf, type Gym } from '../../lib/gym'
import { Card } from '../../components/ui'
import LineChart from '../../components/LineChart'

export default function Progreso({ g }: { g: Gym }) {
  const finished = g.sessions.filter(s => s.ended_at)
  const doneSets = g.sets.filter(x => x.done && finished.some(s => s.id === x.session_id))

  // Ejercicios con datos, el más usado primero
  const used = useMemo(() => {
    const count = new Map<string, number>()
    for (const x of doneSets) if (x.kg != null) count.set(x.exercise_id, (count.get(x.exercise_id) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => g.exerciseById(id)).filter(Boolean)
  }, [doneSets, g])
  const [exId, setExId] = useState<string>('')
  const current = exId || used[0]?.id || ''

  // Evolución: el mayor peso de cada sesión y el 1RM estimado
  const series = useMemo(() => {
    const bySession = finished.slice().reverse().map(s => {
      const xs = doneSets.filter(x => x.session_id === s.id && x.exercise_id === current && x.kg != null && x.reps != null)
      if (!xs.length) return null
      const top = Math.max(...xs.map(x => Number(x.kg)))
      const rm = Math.max(...xs.map(x => oneRm(Number(x.kg), Number(x.reps))))
      return { date: s.session_date, top, rm }
    }).filter((x): x is { date: string; top: number; rm: number } => !!x)
    return bySession
  }, [finished, doneSets, current])

  // Récords por ejercicio
  const records = useMemo(() => used.map(ex => {
    const xs = doneSets.filter(x => x.exercise_id === ex!.id && x.kg != null)
    const best = xs.sort((a, b) => Number(b.kg) - Number(a.kg) || Number(b.reps) - Number(a.reps))[0]
    const sess = finished.find(s => s.id === best?.session_id)
    return { ex: ex!, best, date: sess?.session_date }
  }), [used, doneSets, finished])

  // Semanas: entrenos y volumen de las últimas 8; racha de semanas seguidas
  const weeks = useMemo(() => {
    const ws0 = startOfWeek(today())
    return Array.from({ length: 8 }, (_, i) => {
      const ws = addDays(ws0, -7 * (7 - i))
      const we = addDays(ws, 6)
      const ss = finished.filter(s => s.session_date >= ws && s.session_date <= we)
      return { ws, sessions: ss.length, volume: volumeOf(doneSets.filter(x => ss.some(s => s.id === x.session_id))) }
    })
  }, [finished, doneSets])
  const streak = useMemo(() => {
    let n = 0
    let ws = startOfWeek(today())
    const has = (w: string) => finished.some(s => s.session_date >= w && s.session_date <= addDays(w, 6))
    if (!has(ws)) ws = addDays(ws, -7)   // la semana actual aún puede completarse
    while (has(ws)) { n++; ws = addDays(ws, -7) }
    return n
  }, [finished])

  if (!finished.length) return <Card><p className="text-sm text-muted">Cuando termines tu primer entreno verás aquí tu evolución, récords y constancia.</p></Card>

  const maxVol = Math.max(1, ...weeks.map(w => w.volume))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="!p-3"><b className="text-[22px]">{streak}</b><br /><span className="text-[11px] text-muted">semanas seguidas</span></Card>
        <Card className="!p-3"><b className="text-[22px]">{weeks[7].sessions}</b><br /><span className="text-[11px] text-muted">entrenos esta semana</span></Card>
        <Card className="!p-3"><b className="text-[22px]">{finished.filter(s => s.session_date >= addDays(today(), -29)).length}</b><br /><span className="text-[11px] text-muted">últimos 30 días</span></Card>
      </div>

      {used.length > 0 && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Evolución de</span>
            <select value={current} onChange={e => setExId(e.target.value)} className="min-h-12 px-3 rounded-xl border border-line bg-card text-[16px]">
              {used.map(ex => <option key={ex!.id} value={ex!.id}>{ex!.name}</option>)}
            </select>
          </label>
          <LineChart unit="kg" points={series.map(p => ({ label: shortDate(p.date), value: p.top }))} />
          {series.length > 0 && (
            <p className="text-xs text-muted">1RM estimado (lo máximo que podrías levantar una vez): <b className="text-ink">{fmtKg(Math.round(series[series.length - 1].rm * 10) / 10)}</b></p>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="font-bold text-[15px]">Volumen por semana</h2>
        <div className="flex items-end gap-1.5 h-24" aria-label="Kilos movidos por semana, últimas 8 semanas">
          {weeks.map(w => (
            <div key={w.ws} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold">{w.volume ? fmtNum(w.volume / 1000, 1) : ''}</span>
              <div className="w-full rounded-md bg-accent" style={{ height: `${Math.max(3, (w.volume / maxVol) * 56)}px`, opacity: w.volume ? 1 : 0.2 }} />
              <span className="text-[9px] text-muted">{shortDate(w.ws).replace('.', '')}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Toneladas movidas (kilos × repeticiones de las series hechas).</p>
      </Card>

      {records.length > 0 && (
        <Card className="flex flex-col gap-1">
          <h2 className="font-bold text-[15px] mb-1">🏆 Récords</h2>
          {records.map(r => r.best && (
            <div key={r.ex.id} className="flex justify-between text-[14px] min-h-9 items-center border-b border-line last:border-0">
              <span>{r.ex.name}</span>
              <span className="text-right"><b>{fmtKg(r.best.kg)}</b> × {r.best.reps ?? '?'} <span className="text-xs text-muted">{r.date ? shortDate(r.date) : ''}</span></span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
