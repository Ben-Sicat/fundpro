/**
 * Micro-trend for stat tiles. Server-renderable (no interactivity): the tile's
 * own value carries the number, and the full series is available in the main
 * chart below, so this stays a decorative shape rather than a chart that needs
 * its own tooltip.
 */
export function Sparkline({
  values,
  color = 'var(--series-1)',
  width = 120,
  height = 32,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)

  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  )
}
