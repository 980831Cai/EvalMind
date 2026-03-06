import React from 'react'
import type { Score } from '../types'

const sourceLabels: Record<string, string> = {
  manual: '人工',
  automated: '自动',
  sdk: 'SDK',
  user_feedback: '用户反馈',
}

const sourceColors: Record<string, string> = {
  manual: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  automated: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  sdk: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  user_feedback: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

interface ScoreBadgeProps {
  score: Score
  onDelete?: () => void
  compact?: boolean
}

export default function ScoreBadge({ score, onDelete, compact }: ScoreBadgeProps) {
  const colorCls = sourceColors[score.source] || 'bg-surface-4/50 text-text-secondary border-border-strong/30'
  const label = sourceLabels[score.source] || score.source

  const valueDisplay = score.value != null
    ? `${(score.value * 100).toFixed(0)}%`
    : score.string_value || '-'

  const valueColor = score.value != null
    ? score.value >= 0.8 ? 'text-emerald-400' : score.value >= 0.6 ? 'text-yellow-400' : score.value >= 0.4 ? 'text-orange-400' : 'text-red-400'
    : 'text-text-secondary'

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${colorCls}`}>
        <span className="font-medium">{score.name}</span>
        <span className={`font-bold ${valueColor}`}>{valueDisplay}</span>
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg group">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${colorCls}`}>{label}</span>
        <span className="text-xs font-medium text-text-primary truncate">{score.name}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-sm font-bold ${valueColor}`}>{valueDisplay}</span>
        {score.author && <span className="text-[10px] text-text-muted">by {score.author}</span>}
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs"
            title="删除"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
