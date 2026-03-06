import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type { RegressionReport } from '../../types'
import { regressionLevelColor, regressionLevelLabel, dimensionLabel } from '../../utils/helpers'

interface RegressionDiffProps {
  report: RegressionReport
  compact?: boolean
}

function ChangeIcon({ level }: { level: string }) {
  switch (level) {
    case 'improved':
      return <TrendingUp className="w-4 h-4" />
    case 'severe_degradation':
      return <AlertTriangle className="w-4 h-4" />
    case 'slight_degradation':
      return <TrendingDown className="w-4 h-4" />
    default:
      return <Minus className="w-4 h-4" />
  }
}

function formatPct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function ScoreBar({ value, max = 1 }: { value: number; max?: number }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100)
  return (
    <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, #6366f1, #818cf8)` }}
      />
    </div>
  )
}

export default function RegressionDiff({ report, compact = false }: RegressionDiffProps) {
  const [showFailures, setShowFailures] = useState(false)
  const [showPasses, setShowPasses] = useState(false)

  const dimEntries = Object.entries(report.dimension_changes)
  const degradations = dimEntries.filter(([, d]) => d.level === 'severe_degradation' || d.level === 'slight_degradation')
  const improvements = dimEntries.filter(([, d]) => d.level === 'improved')

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-2/60 border border-border">
        {degradations.length > 0 ? (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        ) : improvements.length > 0 ? (
          <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-text-tertiary shrink-0" />
        )}
        <p className="text-sm text-text-secondary leading-relaxed">{report.summary}</p>
      </div>

      {/* Pass Rate Change */}
      {report.pass_rate_change && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-2/40 border border-border/60">
          <span className="text-sm text-text-secondary">通过率变化</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary">
              {(report.pass_rate_change.baseline * 100).toFixed(1)}%
            </span>
            <svg width="20" height="12" viewBox="0 0 20 12" className="text-text-muted">
              <line x1="0" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
              <polyline points="12,2 16,6 12,10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span
              className="text-sm font-semibold"
              style={{ color: report.pass_rate_change.change_pct > 0 ? '#22c55e' : report.pass_rate_change.change_pct < 0 ? '#ef4444' : '#71717a' }}
            >
              {(report.pass_rate_change.current * 100).toFixed(1)}%
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                color: report.pass_rate_change.change_pct > 0 ? '#22c55e' : report.pass_rate_change.change_pct < 0 ? '#ef4444' : '#71717a',
                backgroundColor: report.pass_rate_change.change_pct > 0 ? 'rgba(34,197,94,0.1)' : report.pass_rate_change.change_pct < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(113,113,122,0.1)',
              }}
            >
              {formatPct(report.pass_rate_change.change_pct)}
            </span>
          </div>
        </div>
      )}

      {/* Dimension Changes Table */}
      {!compact && dimEntries.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2/80 text-text-tertiary text-xs">
                <th className="text-left px-4 py-2.5 font-medium">维度</th>
                <th className="text-center px-3 py-2.5 font-medium">基线得分</th>
                <th className="text-center px-3 py-2.5 font-medium">当前得分</th>
                <th className="text-center px-3 py-2.5 font-medium">变化</th>
                <th className="text-right px-4 py-2.5 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {dimEntries.map(([dim, data]) => {
                const color = regressionLevelColor(data.level)
                return (
                  <tr
                    key={dim}
                    className="border-t border-border/60 hover:bg-surface-3/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-text-secondary">{dimensionLabel(dim)}</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <ScoreBar value={data.baseline_avg} />
                        <span className="text-text-tertiary text-xs w-10 text-right">
                          {(data.baseline_avg * 100).toFixed(0)}
                        </span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <ScoreBar value={data.current_avg} />
                        <span className="text-text-secondary text-xs w-10 text-right">
                          {(data.current_avg * 100).toFixed(0)}
                        </span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded"
                        style={{
                          color,
                          backgroundColor: `${color}15`,
                        }}
                      >
                        <ChangeIcon level={data.level} />
                        {formatPct(data.change_pct)}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5">
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ color, backgroundColor: `${color}15` }}
                      >
                        {regressionLevelLabel(data.level)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Compact Dimension Badges */}
      {compact && dimEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dimEntries.map(([dim, data]) => {
            const color = regressionLevelColor(data.level)
            return (
              <div
                key={dim}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border"
                style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
              >
                <ChangeIcon level={data.level} />
                <span className="text-text-secondary">{dimensionLabel(dim)}</span>
                <span style={{ color }} className="font-medium">{formatPct(data.change_pct)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* New Failures */}
      {report.new_failures.length > 0 && (
        <div className="rounded-lg border border-red-900/30 bg-red-950/10">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer"
            onClick={() => setShowFailures(!showFailures)}
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300">新增失败用例</span>
              <span className="text-xs text-red-400/70 bg-red-400/10 px-1.5 py-0.5 rounded">
                {report.new_failures.length}
              </span>
            </div>
            {showFailures ? (
              <ChevronUp className="w-4 h-4 text-text-tertiary" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            )}
          </button>
          {showFailures && (
            <div className="px-4 pb-3 space-y-1">
              {report.new_failures.map((id) => (
                <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-950/20 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-text-secondary font-mono">{id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Passes */}
      {report.new_passes.length > 0 && (
        <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer"
            onClick={() => setShowPasses(!showPasses)}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300">新增通过用例</span>
              <span className="text-xs text-emerald-400/70 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                {report.new_passes.length}
              </span>
            </div>
            {showPasses ? (
              <ChevronUp className="w-4 h-4 text-text-tertiary" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            )}
          </button>
          {showPasses && (
            <div className="px-4 pb-3 space-y-1">
              {report.new_passes.map((id) => (
                <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-950/20 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-text-secondary font-mono">{id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
