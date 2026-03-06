import React from 'react'
import { useI18n } from '../i18n'
import type { DashboardStats } from '../types'
import { scoreColor, dimensionLabel, statusBadge, statusText } from '../utils/helpers'
import ScoreBar from '../components/ui/ScoreBar'
import Badge from '../components/ui/Badge'

interface ScoresPageProps {
  stats: DashboardStats
}

export default function ScoresPage({ stats }: ScoresPageProps) {
  const { t } = useI18n()
  const sc = t.scores as Record<string, string>
  const hasDimensions = stats.dimension_averages && Object.keys(stats.dimension_averages).length > 0

  return (
    <div className="p-7">
      <h1 className="text-xl font-bold text-text-primary mb-6">{sc.title}</h1>

      {hasDimensions ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mb-6">
            {Object.entries(stats.dimension_averages).map(([dim, score]) => (
              <div key={dim} className="card p-[18px]">
                <div className="flex justify-between items-center mb-2.5">
                  <div>
                    <div className="text-[13px] font-medium text-text-primary">{dimensionLabel(dim)}</div>
                    <div className="text-[11px] text-text-muted">{dim}</div>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: scoreColor(score) }}>{(score * 100).toFixed(0)}%</div>
                </div>
                <ScoreBar value={score} height={8} />
              </div>
            ))}
          </div>

          {/* Recent Runs with Scores */}
          <div className="card overflow-hidden">
            <div className="px-3.5 py-4"><div className="text-sm font-semibold text-text-primary">{sc.recentRuns}</div></div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">Agent</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.testSuite}</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.status}</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.progress}</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.avgScore}</th>
                </tr>
              </thead>
              <tbody>
                {(stats.recent_runs || []).map(r => (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="px-3.5 py-3 text-xs font-medium text-text-primary max-w-[140px] truncate">{r.agent_name}</td>
                    <td className="px-3.5 py-3 text-xs text-text-secondary max-w-[140px] truncate">{r.test_suite_name}</td>
                    <td className="px-3.5 py-3">
                      <Badge variant={statusBadge(r.status).replace('badge-', '') as 'green' | 'yellow' | 'red' | 'gray'}>{statusText(r.status)}</Badge>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-right text-text-secondary">{r.total_items} {sc.countUnit}</td>
                    <td className="px-3.5 py-3 text-xs text-right">
                      <span className="font-bold" style={{ color: scoreColor(r.average_score || 0) }}>
                        {r.average_score != null ? `${(r.average_score * 100).toFixed(0)}%` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!stats.recent_runs || !stats.recent_runs.length) && (
                  <tr><td colSpan={5} className="text-center text-text-muted py-5 text-[13px]">{sc.noData}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Agent Performance */}
          {stats.agent_stats?.length > 0 && (
            <div className="card overflow-hidden mt-4">
              <div className="px-3.5 py-4"><div className="text-sm font-semibold text-text-primary">{sc.agentRanking}</div></div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">Agent</th>
                    <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.type}</th>
                    <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.evalCount}</th>
                    <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.resultCount}</th>
                    <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.avgScore}</th>
                    <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{sc.avgLatency}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.agent_stats.map(a => (
                    <tr key={a.id} className="hover:bg-surface-2/50">
                      <td className="px-3.5 py-3 text-xs font-medium text-text-primary">{a.name}</td>
                      <td className="px-3.5 py-3"><Badge variant="blue">{a.agent_type.toUpperCase()}</Badge></td>
                      <td className="px-3.5 py-3 text-xs text-right text-text-secondary">{a.total_runs}</td>
                      <td className="px-3.5 py-3 text-xs text-right text-text-secondary">{a.total_results}</td>
                      <td className="px-3.5 py-3 text-xs text-right">
                        <span className="font-bold" style={{ color: scoreColor(a.avg_score) }}>{a.avg_score ? `${(a.avg_score * 100).toFixed(0)}%` : '-'}</span>
                      </td>
                      <td className="px-3.5 py-3 text-xs text-right text-text-secondary">{a.avg_latency_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <svg viewBox="0 0 24 24" width={48} height={48} fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg>
          <p className="mt-3 text-sm">{sc.emptyHint}</p>
        </div>
      )}
    </div>
  )
}
