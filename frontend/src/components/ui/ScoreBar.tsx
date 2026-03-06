interface ScoreBarProps {
  score?: number
  value?: number
  max?: number
  showLabel?: boolean
  size?: 'sm' | 'md'
  height?: number
  className?: string
}

function getColor(pct: number): string {
  if (pct >= 0.8) return '#22c55e'
  if (pct >= 0.6) return '#6366f1'
  if (pct >= 0.4) return '#eab308'
  return '#ef4444'
}

export default function ScoreBar({ score, value, max = 1, showLabel = true, size = 'md', className = '' }: ScoreBarProps) {
  const s = score ?? value ?? 0
  const pct = Math.min(s / max, 1)
  const color = getColor(pct)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-surface-4 rounded-full overflow-hidden ${size === 'sm' ? 'h-1' : 'h-1.5'}`}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-spring"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium tabular-nums shrink-0" style={{ color }}>
          {s.toFixed(2)}
        </span>
      )}
    </div>
  )
}
