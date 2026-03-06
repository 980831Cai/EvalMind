import { useState } from 'react'
import { radarPoints, dimensionLabel } from '../../utils/helpers'

interface DataSet {
  label: string
  values: number[]
  color: string
}

interface RadarChartProps {
  dimensions: string[]
  datasets: DataSet[]
  size?: number
}

export default function RadarChart({ dimensions, datasets, size = 300 }: RadarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.38
  const n = dimensions.length
  if (n < 3) return null

  const levels = [0.2, 0.4, 0.6, 0.8, 1.0]

  const axisPoints = dimensions.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })

  const labelPoints = dimensions.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const r = radius + 24
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })

  return (
    <div className="relative">
      <svg width={size} height={size} className="overflow-visible">
        {/* Grid levels */}
        {levels.map((level) => {
          const pts = dimensions.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2
            const r = radius * level
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
          }).join(' ')
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="#27272a"
              strokeWidth="1"
              opacity={0.6}
            />
          )
        })}

        {/* Axes */}
        {axisPoints.map((pt, i) => (
          <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="#27272a" strokeWidth="1" opacity={0.4} />
        ))}

        {/* Data polygons */}
        {datasets.map((ds, di) => (
          <polygon
            key={di}
            points={radarPoints(ds.values, cx, cy, radius)}
            fill={ds.color}
            fillOpacity={0.15}
            stroke={ds.color}
            strokeWidth="2"
            className="transition-all duration-300"
          />
        ))}

        {/* Data points */}
        {datasets.map((ds, di) =>
          ds.values.map((v, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2
            const r = radius * Math.min(Math.max(v, 0), 1)
            const px = cx + r * Math.cos(angle)
            const py = cy + r * Math.sin(angle)
            const isHov = hovered === `${di}-${i}`
            return (
              <circle
                key={`${di}-${i}`}
                cx={px} cy={py}
                r={isHov ? 5 : 3}
                fill={ds.color}
                stroke="#09090b"
                strokeWidth="1.5"
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHovered(`${di}-${i}`)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })
        )}

        {/* Dimension labels */}
        {labelPoints.map((pt, i) => (
          <text
            key={i}
            x={pt.x}
            y={pt.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-text-secondary text-[11px]"
          >
            {dimensionLabel(dimensions[i])}
          </text>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hovered && (() => {
        const [di, ii] = hovered.split('-').map(Number)
        const ds = datasets[di]
        const dim = dimensions[ii]
        const val = ds.values[ii]
        return (
          <div className="absolute top-2 right-2 bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
            <span style={{ color: ds.color }} className="font-medium">{ds.label}</span>
            <span className="text-text-secondary mx-1">/</span>
            <span className="text-text-secondary">{dimensionLabel(dim)}</span>
            <span className="text-text-secondary mx-1">:</span>
            <span className="text-white font-mono">{(val * 100).toFixed(1)}%</span>
          </div>
        )
      })()}

      {/* Legend */}
      {datasets.length > 1 && (
        <div className="flex items-center gap-4 mt-3 justify-center">
          {datasets.map((ds, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ds.color }} />
              <span className="text-text-secondary">{ds.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
