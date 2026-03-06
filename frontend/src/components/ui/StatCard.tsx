import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: number
  trendLabel?: string
  color?: string
  className?: string
  [key: string]: unknown
}

export default function StatCard({ label, value, icon, trend, trendLabel, className = '' }: StatCardProps) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between">
        {icon && (
          <div className="p-2 rounded-lg bg-surface-3/80 border border-border/50">
            {icon}
          </div>
        )}
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-success-400' : 'text-danger-400'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="stat-number">{value}</div>
        <div className="stat-label">{label}</div>
        {trendLabel && <div className="text-[10px] text-text-muted mt-0.5">{trendLabel}</div>}
      </div>
    </div>
  )
}
