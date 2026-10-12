/** Gráfica de línea sencilla (SVG) para evolución: kilos de un ejercicio, peso corporal… */
export default function LineChart({ points, unit, height = 140 }: { points: { label: string; value: number }[]; unit: string; height?: number }) {
  if (points.length === 0) return <p className="text-sm text-muted">Aún no hay datos.</p>
  const w = 320, h = height, padL = 34, padR = 8, padT = 10, padB = 20
  const vals = points.map(p => p.value)
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  min -= span * 0.1; max += span * 0.1
  const x = (i: number) => padL + (points.length === 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (points.length - 1))
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  const last = points[points.length - 1]
  const first = points[0]
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`De ${fmt(first.value)} a ${fmt(last.value)} ${unit}`}>
        {[max - (max - min) * 0.1, (max + min) / 2, min + (max - min) * 0.1].map((v, k) => (
          <g key={k}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line, #ddd)" strokeWidth="1" />
            <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.55">{fmt(v)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--app-accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 30 ? 1.5 : 3} fill="var(--app-accent)" />)}
        <text x={padL} y={h - 5} fontSize="9" fill="currentColor" opacity="0.55">{first.label}</text>
        {points.length > 1 && <text x={w - padR} y={h - 5} fontSize="9" textAnchor="end" fill="currentColor" opacity="0.55">{last.label}</text>}
      </svg>
      <figcaption className="text-xs text-muted">Último: <b className="text-ink">{fmt(last.value)} {unit}</b>{points.length > 1 && ` · desde ${fmt(first.value)} ${unit}`}</figcaption>
    </figure>
  )
}
