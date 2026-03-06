import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../i18n'
import { GitCompare, Plus, Trash2, ChevronDown, ChevronUp, Trophy, Loader2, AlertTriangle } from 'lucide-react'
import type { ComparisonRun, Agent, TestSuite, EvalTemplate, ModelConfig } from '../types'
import type { ComparisonProgress } from '../services/api'
import * as api from '../services/api'
import { dimensionLabel, scoreColor } from '../utils/helpers'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import RadarChart from '../components/ui/RadarChart'

interface Props {
  agents: Agent[]
  suites: TestSuite[]
  modelConfigs: ModelConfig[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const MODEL_COLORS = ['#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6']

export default function ComparisonPage({ agents, suites, modelConfigs, showToast }: Props) {
  const { t } = useI18n()
  const cp = t.comparison as Record<string, string>
  const [comparisons, setComparisons] = useState<ComparisonRun[]>([])
  const [templates, setTemplates] = useState<EvalTemplate[]>([])
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'quick' | 'free'>('quick')
  const [form, setForm] = useState({
    name: '', test_suite_id: '', template_id: '', repeat_count: 1,
    agent_id: '', model_overrides: [''] as string[],
    agent_ids: [''] as string[],
  })

  // Progress polling
  const [progressMap, setProgressMap] = useState<Record<string, ComparisonProgress>>({})
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const [comps, tpls] = await Promise.all([api.fetchComparisons(), api.fetchTemplates()])
      setComparisons(comps)
      setTemplates(tpls)
    } catch (e: unknown) {
      showToast(`${cp.loadFailed}: ${e instanceof Error ? e.message : cp.unknownError}`, 'error')
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  // Poll progress for running comparisons
  useEffect(() => {
    const runningIds = comparisons.filter(c => c.status === 'running').map(c => c.id)
    if (runningIds.length === 0) {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      return
    }

    const pollFn = async () => {
      const updates: Record<string, ComparisonProgress> = {}
      let anyCompleted = false
      for (const id of runningIds) {
        try {
          const prog = await api.fetchComparisonProgress(id)
          updates[id] = prog
          if (prog.status === 'completed') anyCompleted = true
        } catch { /* ignore */ }
      }
      setProgressMap(prev => ({ ...prev, ...updates }))
      if (anyCompleted) load()
    }

    pollFn()
    pollTimerRef.current = setInterval(pollFn, 3000)
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [comparisons, load])

  const addModelSlot = () => setForm({ ...form, model_overrides: [...form.model_overrides, ''] })
  const removeModelSlot = (i: number) => setForm({ ...form, model_overrides: form.model_overrides.filter((_, idx) => idx !== i) })
  const updateModelSlot = (i: number, v: string) => {
    const arr = [...form.model_overrides]; arr[i] = v; setForm({ ...form, model_overrides: arr })
  }

  const addAgentSlot = () => setForm({ ...form, agent_ids: [...form.agent_ids, ''] })
  const removeAgentSlot = (i: number) => setForm({ ...form, agent_ids: form.agent_ids.filter((_, idx) => idx !== i) })
  const updateAgentSlot = (i: number, v: string) => {
    const arr = [...form.agent_ids]; arr[i] = v; setForm({ ...form, agent_ids: arr })
  }

  const handleCreate = async () => {
    try {
      const payload: Record<string, unknown> = {
        name: form.name || `${cp.defaultName} ${new Date().toLocaleString()}`,
        mode,
        test_suite_id: form.test_suite_id,
        template_id: form.template_id || undefined,
        repeat_count: form.repeat_count,
      }
      if (mode === 'quick') {
        payload.agent_id = form.agent_id
        payload.model_overrides = form.model_overrides.filter(m => m.trim())
      } else {
        payload.agent_ids = form.agent_ids.filter(a => a)
      }
      await api.createComparison(payload)
      showToast(cp.created)
      setShowModal(false)
      load()
    } catch (e: unknown) {
      showToast(`${cp.createFailed}: ${e instanceof Error ? e.message : cp.unknownError}`, 'error')
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      // 二次点击确认删除
      try {
        await api.deleteComparison(id)
        showToast(cp.deleted)
        setDeletingId(null)
        load()
      } catch (e: unknown) {
        showToast(`${cp.deleteFailed}: ${e instanceof Error ? e.message : cp.unknownError}`, 'error')
        setDeletingId(null)
      }
    } else {
      // 首次点击，进入确认状态
      setDeletingId(id)
      setTimeout(() => setDeletingId(prev => prev === id ? null : prev), 3000)
    }
  }

  const getComparisonDimensions = (c: ComparisonRun): string[] => {
    if (!c.comparison_data?.models) return []
    const allDims = new Set<string>()
    Object.values(c.comparison_data.models).forEach(m => {
      Object.keys(m.dimension_scores).forEach(d => allDims.add(d))
    })
    return Array.from(allDims)
  }

  const getWinner = (c: ComparisonRun): string | null => {
    if (!c.comparison_data?.models) return null
    let best = '', bestScore = -1
    Object.entries(c.comparison_data.models).forEach(([label, m]) => {
      if (m.avg_score > bestScore) { bestScore = m.avg_score; best = label }
    })
    return best
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><GitCompare size={20} /> {cp.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{cp.desc}</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
          <Plus size={14} className="mr-1" />{cp.createComparison}
        </Button>
      </div>

      {comparisons.length === 0 ? (
        <EmptyState icon={<GitCompare size={36} className="text-text-muted" />} title={cp.noComparisons} description={cp.noComparisonsHint} />
      ) : (
        <div className="space-y-4">
          {comparisons.map(c => {
            const expanded = expandedId === c.id
            const winner = getWinner(c)
            const dims = getComparisonDimensions(c)
            const isRunning = c.status === 'running'
            const progress = progressMap[c.id]
            return (
              <div key={c.id} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-3/20 transition-colors" onClick={() => setExpandedId(expanded ? null : c.id)}>
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{c.name}</span>
                        <Badge variant={c.status === 'completed' ? 'green' : c.status === 'running' ? 'blue' : 'yellow'}>
                          {c.status === 'completed' ? cp.statusCompleted : c.status === 'running' ? cp.statusRunning : cp.statusPending}
                        </Badge>
                        <Badge variant={c.mode === 'quick' ? 'purple' : 'gray'}>{c.mode === 'quick' ? cp.quickMode : cp.freeMode}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-text-tertiary">
                        <span>{c.model_labels.join(' vs ')}</span>
                        {c.repeat_count > 1 && <span>×{c.repeat_count} {cp.times}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {winner && c.status === 'completed' && (
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs"><Trophy size={14} />{winner}</div>
                    )}
                    {isRunning && <Loader2 size={14} className="animate-spin text-blue-400" />}
                    <button onClick={e => { e.stopPropagation(); handleDelete(c.id) }} className={`flex items-center gap-1 transition-colors ${deletingId === c.id ? 'text-red-400 bg-red-950/50 px-2 py-0.5 rounded' : 'text-text-tertiary hover:text-red-400'}`}>
                      <Trash2 size={14} />
                      {deletingId === c.id && <span className="text-[10px]">{cp.confirm}</span>}
                    </button>
                    {expanded ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                  </div>
                </div>

                {/* === Running Progress Panel === */}
                {expanded && isRunning && (
                  <div className="divider p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                      <span className="text-sm font-medium text-text-primary">{cp.evalRunning}</span>
                      <span className="text-[11px] text-text-tertiary">{cp.autoRefresh}</span>
                    </div>
                    <div className="space-y-3">
                      {(progress?.model_progress || c.model_labels.map(label => ({ label, progress: 0, total_items: 0, completed_items: 0, statuses: ['pending'], run_ids: [] }))).map((mp, i) => {
                        const pct = mp.total_items > 0 ? (mp.completed_items / mp.total_items * 100) : mp.progress
                        const statusText = mp.statuses.every(s => s === 'completed') ? cp.completed
                          : mp.statuses.some(s => s === 'running') ? cp.running
                          : mp.statuses.some(s => s === 'failed') ? cp.error : cp.pending
                        return (
                          <div key={mp.label} className="bg-surface-0 border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                                <span className="text-sm font-medium text-text-primary">{mp.label}</span>
                                <Badge variant={statusText === cp.completed ? 'green' : statusText === cp.running ? 'blue' : statusText === cp.error ? 'red' : 'gray'} className="text-[9px]">
                                  {statusText}
                                </Badge>
                              </div>
                              <span className="text-xs text-text-secondary">
                                {mp.completed_items}/{mp.total_items} {cp.countUnit}
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{
                                  width: `${Math.min(pct, 100)}%`,
                                  backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length],
                                }}
                              />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-text-muted">{pct.toFixed(0)}%</span>
                              {statusText === cp.running && (
                                <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                                  {cp.processing}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* === Completed Results Panel === */}
                {expanded && c.comparison_data && c.status === 'completed' && (
                  <div className="divider p-5">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {dims.length >= 3 && (
                        <div className="flex-shrink-0">
                          <RadarChart
                            dimensions={dims}
                            datasets={c.comparison_data.model_labels.map((label, i) => ({
                              label,
                              values: dims.map(d => c.comparison_data!.models[label]?.dimension_scores[d] || 0),
                              color: MODEL_COLORS[i % MODEL_COLORS.length],
                            }))}
                            size={280}
                          />
                        </div>
                      )}
                      <div className="flex-1 space-y-3">
                        {c.comparison_data.model_labels.map((label, i) => {
                          const m = c.comparison_data!.models[label]
                          if (!m) return null
                          const isWinner = label === winner
                          return (
                            <div key={label} className={`rounded-lg border p-4 ${isWinner ? 'border-amber-500/30 bg-amber-950/10' : 'border-border bg-surface-0'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                                  <span className="text-sm font-medium text-text-primary">{label}</span>
                                  {isWinner && <Trophy size={14} className="text-amber-400" />}
                                </div>
                                <span className={`text-lg font-bold ${scoreColor(m.avg_score)}`}>{(m.avg_score * 100).toFixed(0)}%</span>
                              </div>
                              <div className="grid grid-cols-4 gap-3 text-center">
                                <div><div className="text-[10px] text-text-tertiary">{cp.passRate}</div><div className="text-sm font-semibold text-text-primary">{(m.pass_rate * 100).toFixed(0)}%</div></div>
                                <div><div className="text-[10px] text-text-tertiary">{cp.avgLatency}</div><div className="text-sm font-semibold text-text-primary">{m.avg_latency_ms.toFixed(0)}ms</div></div>
                                <div><div className="text-[10px] text-text-tertiary">{cp.totalCases}</div><div className="text-sm font-semibold text-text-primary">{m.total_results}</div></div>
                                <div><div className="text-[10px] text-text-tertiary">{cp.scoreVariance}</div><div className="text-sm font-semibold text-text-primary">{m.score_variance.toFixed(3)}</div></div>
                              </div>
                              {/* 错误提示 */}
                              {m.error_count != null && m.error_count > 0 && (
                                <div className="mt-3 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <AlertTriangle size={12} className="text-red-400" />
                                    <span className="text-[11px] font-medium text-red-400">
                                      {m.error_count}/{m.total_results} {cp.errorCountLabel}
                                    </span>
                                  </div>
                                  {m.error_summary && Object.entries(m.error_summary).map(([err, cnt]) => (
                                    <div key={err} className="text-[10px] text-red-300/70 ml-4 mt-0.5">
                                      • {err} <span className="text-red-500">×{cnt}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Bar Chart */}
                    {c.comparison_data.model_labels.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-3">{cp.metricsComparison}</h4>
                        <div className="grid grid-cols-4 gap-4">
                          {['pass_rate', 'avg_score', 'avg_latency_ms', 'score_variance'].map(metric => {
                            const values = c.comparison_data!.model_labels.map(label => {
                              const m = c.comparison_data!.models[label]
                              if (!m) return 0
                              const metricAccessors: Record<string, (m: { pass_rate: number; avg_score: number; avg_latency_ms: number; score_variance: number }) => number> = {
                                pass_rate: m => m.pass_rate, avg_score: m => m.avg_score, avg_latency_ms: m => m.avg_latency_ms, score_variance: m => m.score_variance,
                              }
                              return metricAccessors[metric]?.(m) || 0
                            })
                            const maxVal = Math.max(...values, 0.001)
                            const labels: Record<string, string> = { pass_rate: cp.passRateLabel, avg_score: cp.avgScoreLabel, avg_latency_ms: cp.latencyMs, score_variance: cp.scoreVarianceLabel }
                            return (
                              <div key={metric} className="bg-surface-0 border border-border rounded-lg p-3">
                                <div className="text-[10px] text-text-tertiary mb-2">{labels[metric]}</div>
                                <div className="space-y-1.5">
                                  {c.comparison_data!.model_labels.map((label, i) => {
                                    const val = values[i]
                                    const pct = metric === 'avg_latency_ms' || metric === 'score_variance'
                                      ? (val / maxVal) * 100
                                      : (val / Math.max(maxVal, 1)) * 100
                                    return (
                                      <div key={label} className="flex items-center gap-2">
                                        <span className="text-[10px] text-text-tertiary w-14 truncate">{label}</span>
                                        <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                                        </div>
                                        <span className="text-[10px] text-text-secondary w-12 text-right">
                                          {metric === 'pass_rate' || metric === 'avg_score' ? `${(val * 100).toFixed(0)}%` : metric === 'avg_latency_ms' ? `${val.toFixed(0)}` : val.toFixed(3)}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 创建对比弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{cp.createTitle}</h3>
        <div className="grid gap-3.5">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{cp.comparisonName}</label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" placeholder={cp.comparisonNamePlaceholder} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="flex gap-1 bg-surface-2 rounded-lg p-0.5 w-fit">
            <button onClick={() => setMode('quick')} className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${mode === 'quick' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}>{cp.quickMode}</button>
            <button onClick={() => setMode('free')} className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${mode === 'free' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}>{cp.freeMode}</button>
          </div>

          {mode === 'quick' ? (
            <>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">{cp.selectAgent}</label>
                <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}>
                  <option value="">{cp.pleaseSelect}</option>
                  {agents.filter(a => a.agent_type === 'openai' || a.agent_type === 'knot').map(a => <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-text-secondary">{cp.modelList}</label>
                  <button onClick={addModelSlot} className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"><Plus size={11} />{cp.addModel}</button>
                </div>
                {form.model_overrides.map((m, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select
                      className="flex-1 card rounded-lg px-3 py-1.5 text-text-primary text-[13px] outline-none focus:border-brand-500"
                      value={m}
                      onChange={e => updateModelSlot(i, e.target.value)}
                    >
                      <option value="">{cp.selectModelConfig}</option>
                      {modelConfigs.filter(mc => mc.is_active).map(mc => (
                        <option key={mc.id} value={mc.model_name}>{mc.name} ({mc.model_name})</option>
                      ))}
                    </select>
                    {form.model_overrides.length > 1 && <button onClick={() => removeModelSlot(i)} className="text-red-500 hover:text-red-400 px-1"><Trash2 size={14} /></button>}
                  </div>
                ))}
                <p className="text-[11px] text-text-muted mt-1">{cp.modelListHint}</p>
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-text-secondary">{cp.agentList}</label>
                <button onClick={addAgentSlot} className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"><Plus size={11} />{cp.addAgent}</button>
              </div>
              {form.agent_ids.map((aid, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select className="flex-1 card rounded-lg px-3 py-1.5 text-text-primary text-[13px] outline-none focus:border-brand-500" value={aid} onChange={e => updateAgentSlot(i, e.target.value)}>
                    <option value="">{cp.pleaseSelect}</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>)}
                  </select>
                  {form.agent_ids.length > 1 && <button onClick={() => removeAgentSlot(i)} className="text-red-500 hover:text-red-400 px-1"><Trash2 size={14} /></button>}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{cp.testSuite}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.test_suite_id} onChange={e => setForm({ ...form, test_suite_id: e.target.value })}>
              <option value="">{cp.pleaseSelect}</option>
              {suites.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version} ({s.case_count} {cp.countUnit})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{cp.evalTemplate} <span className="text-text-muted">（{cp.evalTemplateOptional}）</span></label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}>
                <option value="">{cp.useDefault}</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{cp.repeatCount}</label>
              <input type="number" min="1" max="10" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.repeat_count} onChange={e => setForm({ ...form, repeat_count: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{cp.cancel}</Button>
          <Button onClick={handleCreate} disabled={!form.test_suite_id}>{cp.createBtn}</Button>
        </div>
      </Modal>
    </div>
  )
}
