import React, { useState, useMemo } from 'react'
import type { DashboardStats, ObsStats, Agent } from '../types'
import { scoreColor, modelColor } from '../utils/helpers'
import { useI18n } from '../i18n'
import Button from '../components/ui/Button'
import { RefreshCw, Monitor, BarChart3, Cpu, Zap, Activity, Database } from 'lucide-react'

interface MonitorPageProps {
  stats: DashboardStats
  obsStats: ObsStats
  obsStatsLoading: boolean
  agents: Agent[]
  onRefresh: (agentId?: string) => void
  onViewTrace: (traceId: string) => void
}

function TokenUsageChart({ data }: { data: Array<{ model: string; total_tokens: number; prompt_tokens: number; completion_tokens: number; count: number }> }) {
  if (!data.length) return null
  const maxTokens = Math.max(...data.map(d => d.total_tokens))
  return (
    <div className="space-y-2.5">
      {data.map(row => {
        const pctPrompt = maxTokens > 0 ? (row.prompt_tokens / maxTokens) * 100 : 0
        const pctCompletion = maxTokens > 0 ? (row.completion_tokens / maxTokens) * 100 : 0
        return (
          <div key={row.model}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: modelColor(row.model) }} />
                <span className="text-xs text-text-primary font-medium truncate max-w-[160px]">{row.model}</span>
                <span className="text-[10px] text-text-muted">{row.count}x</span>
              </div>
              <span className="text-[10px] text-text-secondary tabular-nums">{formatTokens(row.total_tokens)}</span>
            </div>
            <div className="flex h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/70 rounded-l-full transition-all" style={{ width: `${pctPrompt}%` }} title={`Prompt: ${row.prompt_tokens}`} />
              <div className="h-full bg-emerald-500/70 rounded-r-full transition-all" style={{ width: `${pctCompletion}%` }} title={`Completion: ${row.completion_tokens}`} />
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-4 mt-1 pt-1 divider/50">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/70" /><span className="text-[9px] text-text-muted">Prompt</span></div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/70" /><span className="text-[9px] text-text-muted">Completion</span></div>
      </div>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function EmptyBlock({ icon, text, loading }: { icon: React.ReactNode; text: string; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-10 h-10 rounded-xl bg-surface-3/50 border border-border-light/30 flex items-center justify-center mb-2.5">
        {icon}
      </div>
      <p className="text-[12px] text-text-muted">{text}</p>
    </div>
  )
}

export default function MonitorPage({ stats, obsStats, obsStatsLoading, agents, onRefresh, onViewTrace }: MonitorPageProps) {
  const { t } = useI18n()
  const mt = t.monitor as Record<string, string>
  const [showAllTraces, setShowAllTraces] = useState(false)
  const [showAllGens, setShowAllGens] = useState(false)
  const [showAllSpans, setShowAllSpans] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId)
    onRefresh(agentId || undefined)
  }

  const tokenStats = useMemo(() => {
    const usage = obsStats.model_usage_table || []
    let totalTokens = 0, totalPrompt = 0, totalCompletion = 0, totalCalls = 0
    usage.forEach(r => {
      totalTokens += r.total_tokens
      totalPrompt += r.prompt_tokens
      totalCompletion += r.completion_tokens
      totalCalls += r.count
    })
    return { totalTokens, totalPrompt, totalCompletion, totalCalls, models: usage.length }
  }, [obsStats])

  return (
    <div className="p-7 max-w-[1400px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
            <Monitor size={18} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{mt.title}</h1>
            <p className="text-[11px] text-text-muted">{mt.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="card rounded-lg px-2.5 py-1.5 text-text-primary text-xs outline-none focus:border-brand-500 w-[160px]"
            value={selectedAgentId}
            onChange={e => handleAgentChange(e.target.value)}
          >
            <option value="">{mt.allAgents}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button variant="ghost" onClick={() => { onRefresh(selectedAgentId || undefined) }} disabled={obsStatsLoading} className="text-xs px-3 py-1.5">
            <RefreshCw size={14} className={obsStatsLoading ? 'animate-spin' : ''} />
            {obsStatsLoading ? mt.loading : mt.refresh}
          </Button>
        </div>
      </div>

      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <div className="card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-tertiary">{mt.totalTraces}</span>
            <Activity size={14} className="text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-text-primary tabular-nums">{obsStats.total_traces}</div>
        </div>
        <div className="card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-tertiary">{mt.totalSpans}</span>
            <Zap size={14} className="text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 tabular-nums">{obsStats.total_observations}</div>
        </div>
        <div className="card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-tertiary">{mt.modelTypes}</span>
            <Cpu size={14} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 tabular-nums">{tokenStats.models}</div>
        </div>
        <div className="card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-tertiary">{mt.totalTokens}</span>
            <Database size={14} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">{tokenStats.totalTokens > 0 ? formatTokens(tokenStats.totalTokens) : '-'}</div>
        </div>
        <div className="card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-tertiary">{mt.evalRuns}</span>
            <BarChart3 size={14} className="text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">{stats.total_eval_runs}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{stats.completed_runs} {mt.completed} / {stats.running_runs} {mt.running}</div>
        </div>
      </div>

      {/* Row 2: Score Distribution + Agent Stats */}
      <div className="grid grid-cols-3 gap-3.5 mb-5">
        {/* Score Distribution */}
        <div className="card p-5">
          <div className="text-sm font-semibold text-text-primary mb-3">{mt.scoreDistribution}</div>
          {stats.score_distribution ? (
            <div className="grid gap-2.5">
              {[
                { key: 'excellent', label: mt.excellent, color: '#22c55e' },
                { key: 'good', label: mt.good, color: '#f59e0b' },
                { key: 'fair', label: mt.fair, color: '#f97316' },
                { key: 'poor', label: mt.poor, color: '#ef4444' },
              ].map(item => {
                const dist = stats.score_distribution!
                const total = (dist.excellent || 0) + (dist.good || 0) + (dist.fair || 0) + (dist.poor || 0)
                const count = dist[item.key as keyof typeof dist] || 0
                const pct = total > 0 ? (count / total * 100) : 0
                return (
                  <div key={item.key} className="flex items-center gap-2.5">
                    <span className="text-xs text-text-secondary w-[100px] flex-shrink-0">{item.label}</span>
                    <div className="flex-1 h-6 bg-surface-3 rounded-md overflow-hidden relative">
                      <div className="h-full rounded-md transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${item.color}90, ${item.color}60)` }} />
                      {pct > 10 && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[9px] text-white/80 font-medium">{pct.toFixed(0)}%</span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-text-primary w-[30px] text-right tabular-nums">{count}</span>
                  </div>
                )
              })}
            </div>
          ) : <EmptyBlock icon={<BarChart3 size={18} className="text-text-muted" />} text={mt.noScoreData} />}
        </div>

        {/* Agent Stats */}
        <div className="card p-5">
          <div className="text-sm font-semibold text-text-primary mb-3">{mt.agentEvalStats}</div>
          {stats.agent_stats?.length ? (
            <div className="grid grid-cols-2 gap-3">
              {stats.agent_stats.slice(0, 6).map(a => (
                <div key={a.id} className="bg-surface-3/40 rounded-lg p-3">
                  <div className="text-xs text-text-secondary font-medium truncate mb-2">{a.name}</div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: scoreColor(a.avg_score) }}>
                        {a.avg_score ? `${(a.avg_score * 100).toFixed(0)}%` : '-'}
                      </div>
                      <div className="text-[10px] text-text-muted">{mt.avgScore}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-secondary">{a.total_runs}</div>
                      <div className="text-[10px] text-text-muted">{mt.evalCount}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyBlock icon={<BarChart3 size={18} className="text-text-muted" />} text={mt.noAgentStats} />}
        </div>
      </div>

      {/* Row 4: Percentile Tables */}
      <div className="grid grid-cols-3 gap-3.5 mb-5">
        {[
          { title: mt.traceLatency, data: obsStats.trace_latency_table, showAll: showAllTraces, toggle: () => setShowAllTraces(!showAllTraces), icon: <Activity size={14} className="text-brand-400" /> },
          { title: mt.generationLatency, data: obsStats.generation_latency_table, showAll: showAllGens, toggle: () => setShowAllGens(!showAllGens), icon: <Cpu size={14} className="text-purple-400" /> },
          { title: mt.spanLatency, data: obsStats.span_latency_table, showAll: showAllSpans, toggle: () => setShowAllSpans(!showAllSpans), icon: <Zap size={14} className="text-cyan-400" /> },
        ].map(section => (
          <div key={section.title} className="card overflow-hidden">
            <div className="p-3.5 pb-2.5 flex items-center gap-2">
              {section.icon}
              <div className="text-sm font-semibold text-text-primary">{section.title}</div>
            </div>
            {section.data && section.data.length ? (
              <>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-2">
                      <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border sticky top-0">{mt.name}</th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p50</th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p90</th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-yellow-500 border-b border-border">p95 ▼</th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.showAll ? section.data : section.data.slice(0, 5)).map(row => (
                      <tr key={row.name} className="hover:bg-surface-3/30 transition-colors">
                        <td className="px-3.5 py-3 text-xs font-medium text-text-primary max-w-[140px] truncate" title={row.name}>{row.name}</td>
                        <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p50.toFixed(3)}s</td>
                        <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p90.toFixed(3)}s</td>
                        <td className="px-3.5 py-3 text-xs text-right text-yellow-500 font-semibold tabular-nums">{row.p95.toFixed(3)}s</td>
                        <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p99.toFixed(3)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {section.data.length > 5 && (
                  <div className="text-center py-2 divider">
                    <button className="text-[11px] text-brand-400 hover:underline" onClick={section.toggle}>
                      {section.showAll ? mt.collapse : `${mt.viewAll} ${section.data.length} `}
                    </button>
                  </div>
                )}
              </>
            ) : <EmptyBlock icon={section.icon} text={obsStatsLoading ? mt.loading : mt.noData} loading={obsStatsLoading} />}
          </div>
        ))}
      </div>

      {/* Row 5: Model Latency */}
      <div className="grid grid-cols-1 gap-3.5 mb-5">
        <div className="card overflow-hidden">
          <div className="p-3.5 pb-2.5 flex items-center gap-2">
            <Cpu size={14} className="text-amber-400" />
            <div className="text-sm font-semibold text-text-primary">{mt.modelLatencyPercentile}</div>
          </div>
          {obsStats.model_latency_table?.length ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-left px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{mt.model}</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">{mt.count}</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p50</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p90</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-yellow-500 border-b border-border">p95</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] font-medium text-text-tertiary border-b border-border">p99</th>
                </tr>
              </thead>
              <tbody>
                {obsStats.model_latency_table.map(row => (
                  <tr key={row.name} className="hover:bg-surface-3/30 transition-colors">
                    <td className="px-3.5 py-3 text-xs font-medium text-text-primary truncate max-w-[180px]">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: modelColor(row.name) }} />
                      {row.name}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-right text-text-tertiary tabular-nums">{row.count}</td>
                    <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p50.toFixed(3)}s</td>
                    <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p90.toFixed(3)}s</td>
                    <td className="px-3.5 py-3 text-xs text-right text-yellow-500 font-semibold tabular-nums">{row.p95.toFixed(3)}s</td>
                    <td className="px-3.5 py-3 text-xs text-right text-text-secondary tabular-nums">{row.p99.toFixed(3)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyBlock icon={<Cpu size={18} className="text-text-muted" />} text={mt.noData} />}
        </div>
      </div>
    </div>
  )
}
