import { useState, useCallback } from 'react'
import { GitBranch, TrendingUp, TrendingDown, Award, Clock, Activity, Target, Zap, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import * as api from '../services/api'
import type { EvolutionTimeline, EvolutionEvent } from '../services/api'
import { useI18n } from '../i18n'

interface Props {
  agents: { id: string; name: string }[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const EVENT_META: Record<string, { icon: typeof Activity; color: string; bg: string; border: string }> = {
  eval_completed: { icon: Activity, color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/30' },
  strategy_applied: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  milestone: { icon: Award, color: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/30' },
}

export default function EvolutionPage({ agents, showToast }: Props) {
  const { t, locale } = useI18n()
  const et = (t.evolution || {}) as Record<string, string>

  const [selectedAgent, setSelectedAgent] = useState('')
  const [timeline, setTimeline] = useState<EvolutionTimeline | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<'timeline' | 'milestones'>('timeline')

  const loadTimeline = useCallback(async (agentId: string) => {
    if (!agentId) return
    setLoading(true)
    try {
      const data = await api.fetchEvolutionTimeline(agentId, { days })
      setTimeline(data)
    } catch { /* global */ }
    setLoading(false)
  }, [days])

  const handleSelectAgent = (id: string) => {
    setSelectedAgent(id)
    if (id) loadTimeline(id)
    else setTimeline(null)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
  }

  const getScoreDelta = (event: EvolutionEvent) => {
    if (!event.scores_before || !event.scores_after) return null
    const before = event.scores_before.overall_score ?? event.scores_before.avg_score
    const after = event.scores_after.overall_score ?? event.scores_after.avg_score
    if (before == null || after == null) return null
    return after - before
  }

  const milestones = timeline?.milestones || []
  const events = tab === 'milestones' ? milestones : (timeline?.events || [])

  const scoreTrend = (timeline?.score_trend || []).map(d => ({
    date: formatShortDate(d.date),
    score: d.score ?? 0,
  }))
  const passRateTrend = (timeline?.pass_rate_trend || []).map(d => ({
    date: formatShortDate(d.date),
    rate: ((d.pass_rate ?? 0) * 100),
  }))

  const latestScore = scoreTrend.length > 0 ? scoreTrend[scoreTrend.length - 1].score : null
  const firstScore = scoreTrend.length > 0 ? scoreTrend[0].score : null
  const scoreDelta = latestScore != null && firstScore != null ? latestScore - firstScore : null

  const latestRate = passRateTrend.length > 0 ? passRateTrend[passRateTrend.length - 1].rate : null
  const firstRate = passRateTrend.length > 0 ? passRateTrend[0].rate : null
  const rateDelta = latestRate != null && firstRate != null ? latestRate - firstRate : null

  const chartTooltipStyle = {
    contentStyle: { background: '#0f1219', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px' },
    itemStyle: { color: '#94a3b8' },
    labelStyle: { color: '#f1f5f9', fontWeight: 600 },
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">

        {/* Hero Header */}
        <div className="relative page-hero-glow animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 shadow-glow-brand-sm">
                  <GitBranch size={22} className="text-brand-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  <span className="text-gradient-brand">{et.title}</span>
                </h1>
              </div>
              <p className="text-sm text-text-secondary ml-[52px]">{et.desc}</p>
            </div>
          </div>
        </div>

        {/* Agent Selector + Days */}
        <div className="glass rounded-xl p-3 flex items-center gap-3 animate-reveal" style={{ animationDelay: '100ms' }}>
          <select value={selectedAgent} onChange={e => handleSelectAgent(e.target.value)}
            className="select flex-1 min-w-[200px]">
            <option value="">{et.selectAgent}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {[7, 30, 90, 180].map(d => (
              <button key={d} onClick={() => { setDays(d); if (selectedAgent) loadTimeline(selectedAgent) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${days === d
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-3 border border-transparent'}`}>
                {d}{et.days}
              </button>
            ))}
          </div>
        </div>

        {!selectedAgent ? (
          <div className="empty-state-ambient flex flex-col items-center justify-center py-24 text-text-tertiary animate-fade-in">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border mb-5">
              <GitBranch size={32} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-secondary">{et.selectAgent}</p>
            <p className="text-xs mt-1.5 text-text-muted">{et.noEventsHint}</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : timeline ? (
          <>
            {/* Score & Pass Rate Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Score Trend */}
              <div className="card-premium p-5 gradient-card-blue animate-reveal" style={{ animationDelay: '150ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-surface-3/80 border border-border/50">
                      <Target size={14} className="text-brand-400" />
                    </div>
                    <span className="text-sm font-medium text-text-primary">{et.scoreTrend}</span>
                  </div>
                  {scoreDelta !== null && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${scoreDelta >= 0 ? 'bg-success-500/10 text-success-400' : 'bg-danger-500/10 text-danger-400'}`}>
                      {scoreDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {scoreDelta >= 0 ? '+' : ''}{scoreDelta.toFixed(2)}
                    </div>
                  )}
                </div>
                {latestScore !== null && (
                  <div className="text-3xl font-bold tracking-tight text-text-primary mb-4">{latestScore.toFixed(2)}</div>
                )}
                {scoreTrend.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={scoreTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip {...chartTooltipStyle} />
                      <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} fill="url(#scoreGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1', stroke: '#0f1219', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">{et.noEvents}</div>
                )}
              </div>

              {/* Pass Rate Trend */}
              <div className="card-premium p-5 gradient-card-green animate-reveal" style={{ animationDelay: '210ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-surface-3/80 border border-border/50">
                      <Activity size={14} className="text-success-400" />
                    </div>
                    <span className="text-sm font-medium text-text-primary">{et.passRateTrend}</span>
                  </div>
                  {rateDelta !== null && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rateDelta >= 0 ? 'bg-success-500/10 text-success-400' : 'bg-danger-500/10 text-danger-400'}`}>
                      {rateDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {rateDelta >= 0 ? '+' : ''}{rateDelta.toFixed(1)}%
                    </div>
                  )}
                </div>
                {latestRate !== null && (
                  <div className="text-3xl font-bold tracking-tight text-text-primary mb-4">{latestRate.toFixed(1)}%</div>
                )}
                {passRateTrend.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={passRateTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip {...chartTooltipStyle} />
                      <Area type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} fill="url(#rateGrad)" dot={false} activeDot={{ r: 4, fill: '#22c55e', stroke: '#0f1219', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">{et.noEvents}</div>
                )}
              </div>
            </div>

            {/* Milestones Badges */}
            {milestones.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap animate-reveal" style={{ animationDelay: '280ms' }}>
                {milestones.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-500/10 border border-success-500/20 text-xs text-success-400 font-medium transition-all hover:bg-success-500/15">
                    <Award size={12} />
                    <span>{m.summary}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border animate-reveal" style={{ animationDelay: '320ms' }}>
              {(['timeline', 'milestones'] as const).map(tabKey => (
                <button key={tabKey} onClick={() => setTab(tabKey)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${tab === tabKey ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}>
                  {tabKey === 'timeline' ? et.timeline : et.milestones}
                  {tabKey === 'milestones' && milestones.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-success-500/15 text-[10px] text-success-400">{milestones.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Event List */}
            {events.length === 0 ? (
              <div className="empty-state-ambient flex flex-col items-center justify-center py-20 text-text-tertiary animate-fade-in">
                <div className="p-3 rounded-2xl bg-surface-2 border border-border mb-4">
                  <Clock size={28} className="text-text-muted" />
                </div>
                <p className="text-sm font-medium text-text-secondary">{et.noEvents}</p>
                <p className="text-xs mt-1 text-text-muted">{et.noEventsHint}</p>
              </div>
            ) : (
              <div className="relative pl-7">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px gradient-timeline-line" />

                <div className="space-y-4">
                  {events.map((event, i) => {
                    const meta = EVENT_META[event.event_type] || EVENT_META.eval_completed
                    const Icon = meta.icon
                    const delta = getScoreDelta(event)

                    return (
                      <div key={event.id || i} className="relative group animate-reveal" style={{ animationDelay: `${i * 40}ms` }}>
                        {/* Timeline dot */}
                        <div className={`absolute -left-7 top-4 w-[22px] h-[22px] rounded-full flex items-center justify-center ${meta.bg} border border-surface-1 z-10 ring-4 ring-surface-1`}>
                          <Icon size={10} className={meta.color} />
                        </div>

                        <div className={`card-premium p-4 ml-1 transition-all`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                                  {event.event_type === 'eval_completed' ? et.eventTypeEval :
                                   event.event_type === 'strategy_applied' ? et.eventTypeStrategy :
                                   et.eventTypeMilestone}
                                </span>
                                {delta !== null && (
                                  <span className={`flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${delta >= 0 ? 'bg-success-500/10 text-success-400' : 'bg-danger-500/10 text-danger-400'}`}>
                                    {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-text-primary mt-2 leading-relaxed">{event.summary}</p>

                              {/* Score comparison bar */}
                              {event.scores_before && event.scores_after && (() => {
                                const before = event.scores_before.avg_score ?? event.scores_before.overall_score ?? 0
                                const after = event.scores_after.avg_score ?? event.scores_after.overall_score ?? 0
                                const maxScore = Math.max(before, after, 1)
                                return (
                                  <div className="mt-3 p-3 rounded-lg bg-surface-0/50 border border-border/30">
                                    <div className="flex items-center justify-between text-[11px] text-text-muted mb-2">
                                      <span>{et.scoresBefore}: <span className="text-text-secondary font-medium">{before.toFixed(2)}</span></span>
                                      <span>{et.scoresAfter}: <span className="text-text-secondary font-medium">{after.toFixed(2)}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="progress-bar flex-1">
                                        <div className="progress-bar-fill-danger" style={{ width: `${(before / maxScore) * 100}%` }} />
                                      </div>
                                      <span className="text-text-muted text-[10px]">→</span>
                                      <div className="progress-bar flex-1">
                                        <div className="progress-bar-fill" style={{ width: `${(after / maxScore) * 100}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                            <span className="text-[11px] text-text-muted shrink-0 flex items-center gap-1 mt-1">
                              <Calendar size={10} />
                              {formatDate(event.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
