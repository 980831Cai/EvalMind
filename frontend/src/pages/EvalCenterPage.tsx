import { useState, useEffect } from 'react'
import { ClipboardCheck, Plus, Trash2, ChevronDown, ChevronUp, XCircle, Loader2, CheckCircle, AlertCircle, Route, Star, GitCompare, Bug, ShieldCheck, ShieldX } from 'lucide-react'
import type { EvalRun, EvalResult, EvalTemplate, Agent, TestSuite, ModelConfig, RegressionReport } from '../types'
import { createEvalRun, deleteEvalRun, cancelEvalRun, fetchEvalResults, setBaseline, fetchRegression, fetchTemplates, importBadCase } from '../services/api'
import { scoreColor, dimensionLabel, formatTime, ALL_TRAJECTORY_DIMENSIONS, assertionTypeLabel, assertionTypeColor } from '../utils/helpers'
import { useI18n } from '../i18n'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import ScoreBar from '../components/ui/ScoreBar'
import TrajectoryTimeline from '../components/ui/TrajectoryTimeline'
import RegressionDiff from '../components/ui/RegressionDiff'

interface Props {
  runs: EvalRun[]
  agents: Agent[]
  suites: TestSuite[]
  configs: ModelConfig[]
  onRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const ALL_DIMS = ['accuracy', 'completeness', 'helpfulness', 'relevance', 'safety', 'instruction_following', 'tool_usage']

export default function EvalCenterPage({ runs, agents, suites, configs, onRefresh, showToast }: Props) {
  const { t } = useI18n()
  const ec = t.evalCenter as Record<string, string>
  const [showModal, setShowModal] = useState(false)
  const [templates, setTemplates] = useState<EvalTemplate[]>([])
  const [form, setForm] = useState({
    agent_id: '', test_suite_id: '', model_config_id: '',
    dimensions: ['accuracy', 'completeness', 'helpfulness'] as string[],
    enable_skills_eval: false, enable_trajectory_eval: false,
    trajectory_dimensions: ALL_TRAJECTORY_DIMENSIONS as string[],
    concurrency: 5, timeout: 60, repeat_count: 1,
    template_id: '', model_override: '', is_baseline: false,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedResults, setExpandedResults] = useState<EvalResult[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [detailResult, setDetailResult] = useState<EvalResult | null>(null)
  const [detailTab, setDetailTab] = useState<'output' | 'trajectory'>('output')
  const [regressionReport, setRegressionReport] = useState<RegressionReport | null>(null)
  const [showRegression, setShowRegression] = useState(false)
  const [regressionRunId, setRegressionRunId] = useState<string | null>(null)

  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => {}) }, [])

  const toggleDim = (d: string) => {
    setForm({ ...form, dimensions: form.dimensions.includes(d) ? form.dimensions.filter(x => x !== d) : [...form.dimensions, d] })
  }
  const toggleTrajectoryDim = (d: string) => {
    setForm({ ...form, trajectory_dimensions: form.trajectory_dimensions.includes(d) ? form.trajectory_dimensions.filter(x => x !== d) : [...form.trajectory_dimensions, d] })
  }

  const handleCreate = async () => {
    try {
      const payload: Record<string, unknown> = { ...form }
      if (!form.template_id) delete payload.template_id
      if (!form.model_override) delete payload.model_override
      await createEvalRun(payload)
      showToast(ec.evalStarted); setShowModal(false); onRefresh()
    } catch (e: unknown) {
      showToast(`${ec.createFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    }
  }

  const [confirmId, setConfirmId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); setTimeout(() => setConfirmId(p => p === id ? null : p), 3000); return }
    try {
      await deleteEvalRun(id); showToast(ec.deleted); setConfirmId(null); onRefresh()
    } catch (e: unknown) {
      showToast(`${ec.deleteFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error'); setConfirmId(null)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelEvalRun(id); showToast(ec.cancelled); onRefresh()
    } catch (e: unknown) {
      showToast(`${ec.cancelFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    }
  }

  const handleSetBaseline = async (id: string) => {
    try {
      await setBaseline(id); showToast(ec.markedBaseline); onRefresh()
    } catch (e: unknown) {
      showToast(`${ec.operationFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    }
  }

  const handleRegression = async (id: string) => {
    try {
      setRegressionRunId(id)
      const report = await fetchRegression(id)
      setRegressionReport(report)
      setShowRegression(true)
    } catch (e: unknown) {
      showToast(`${ec.regressionFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    }
  }

  const handleImportBadCase = async (resultId: string) => {
    try {
      await importBadCase({ eval_result_id: resultId })
      showToast(ec.markedBadCase)
    } catch (e: unknown) {
      showToast(`${ec.importFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id); setLoadingResults(true)
    try {
      const results = await fetchEvalResults(id)
      setExpandedResults(results)
    } catch (e: unknown) {
      showToast(`${ec.loadResultsFailed}: ${e instanceof Error ? e.message : ec.unknownError}`, 'error')
    } finally {
      setLoadingResults(false)
    }
  }

  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running' || r.status === 'pending')
    if (!hasRunning) return
    const t = setInterval(onRefresh, 3000)
    return () => clearInterval(t)
  }, [runs, onRefresh])

  const statusBadge = (s: string) => {
    switch (s) {
      case 'completed': return <Badge variant="green"><CheckCircle size={10} className="mr-1" />{ec.statusCompleted}</Badge>
      case 'running': return <Badge variant="blue"><Loader2 size={10} className="animate-spin mr-1" />{ec.statusRunning}</Badge>
      case 'failed': return <Badge variant="red"><AlertCircle size={10} className="mr-1" />{ec.statusFailed}</Badge>
      case 'cancelled': return <Badge variant="gray"><XCircle size={10} className="mr-1" />{ec.statusCancelled}</Badge>
      default: return <Badge variant="yellow">{ec.statusPending}</Badge>
    }
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><ClipboardCheck size={20} /> {ec.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{ec.desc}</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
          <Plus size={14} className="mr-1" />{ec.createRun}
        </Button>
      </div>

      {runs.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={36} className="text-text-muted" />} title={ec.noRuns} description={ec.noRunsHint} />
      ) : (
        <div className="space-y-3">
          {runs.map(r => (
            <div key={r.id} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-3/30 transition-colors" onClick={() => toggleExpand(r.id)}>
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{r.agent_name || 'Agent'}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-[13px] text-text-secondary">{r.test_suite_name || ec.testSuite}</span>
                      {statusBadge(r.status)}
                      {r.is_baseline && <span className="text-amber-400"><Star size={12} fill="currentColor" /></span>}
                      {r.model_override && <Badge variant="purple">{r.model_override}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-text-tertiary">
                      <span>{formatTime(r.created_at)}</span>
                      <span>{r.total_items} {ec.caseCount}</span>
                      {r.average_score !== null && <span className={scoreColor(r.average_score)}>{ec.score} {(r.average_score * 100).toFixed(0)}%</span>}
                      {r.model_config_name && <span>{ec.model}: {r.model_config_name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(r.status === 'running' || r.status === 'pending') && (
                    <div className="w-32">
                      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 rounded-full transition-all duration-500" style={{ width: `${r.progress}%` }} />
                      </div>
                      <div className="text-[10px] text-text-tertiary text-right mt-0.5">{r.current_item}/{r.total_items}</div>
                    </div>
                  )}
                  {r.status === 'completed' && r.average_score !== null && (
                    <div className="text-right">
                      <div className={`text-lg font-bold ${scoreColor(r.average_score)}`}>{(r.average_score * 100).toFixed(0)}%</div>
                      <div className="text-[10px] text-text-tertiary">{r.passed_count}{ec.passed} / {r.failed_count}{ec.notPassed}</div>
                    </div>
                  )}
                  {r.status === 'completed' && (
                    <>
                      <button onClick={e => { e.stopPropagation(); handleSetBaseline(r.id) }} className={`text-[11px] flex items-center gap-0.5 ${r.is_baseline ? 'text-amber-400' : 'text-text-tertiary hover:text-amber-400'}`} title={ec.setBaseline}><Star size={13} /></button>
                      <button onClick={e => { e.stopPropagation(); handleRegression(r.id) }} className="text-[11px] text-text-tertiary hover:text-cyan-400 flex items-center gap-0.5" title={ec.regression}><GitCompare size={13} /></button>
                    </>
                  )}
                  {(r.status === 'pending' || r.status === 'running') && (
                    <button onClick={e => { e.stopPropagation(); handleCancel(r.id) }} className="text-[11px] text-amber-500 hover:text-amber-400">{ec.cancel}</button>
                  )}
                  <button onClick={e => { e.stopPropagation(); handleDelete(r.id) }} className={`text-[11px] flex items-center gap-0.5 transition-colors ${confirmId === r.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded' : 'text-red-500 hover:text-red-400'}`}><Trash2 size={13} />{confirmId === r.id && <span>{ec.confirmDelete}</span>}</button>
                  {expandedId === r.id ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                </div>
              </div>

              {expandedId === r.id && (
                <div className="divider px-4 py-3">
                  {loadingResults ? <div className="text-xs text-text-tertiary text-center py-4"><Loader2 size={16} className="animate-spin inline mr-1" />{ec.loading}</div> : (
                    <>
                      {r.dimensions && r.dimensions.length > 0 && (
                        <div className="mb-3">
                          <span className="text-[11px] text-text-tertiary uppercase">{ec.scoreDimensions}</span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
                            {r.dimensions.map(d => {
                              const avgForDim = expandedResults.length > 0 ? expandedResults.reduce((sum, er) => sum + (er.scores?.[d] || 0), 0) / expandedResults.length : 0
                              return <div key={d} className="flex items-center gap-2"><span className="text-xs text-text-secondary w-20 shrink-0">{dimensionLabel(d)}</span><ScoreBar value={avgForDim} /><span className="text-[11px] text-text-secondary">{(avgForDim * 100).toFixed(0)}%</span></div>
                            })}
                          </div>
                        </div>
                      )}
                      <table className="w-full text-left">
                        <thead><tr className="text-[11px] text-text-tertiary uppercase border-b border-border">
                          <th className="pb-2 pr-2 w-10">#</th><th className="pb-2 pr-2">{ec.tableInput}</th><th className="pb-2 pr-2">{ec.tableOutput}</th><th className="pb-2 pr-2 w-16">{ec.tableScore}</th><th className="pb-2 pr-2 w-16">{ec.tableStatus}</th><th className="pb-2 w-10"></th>
                        </tr></thead>
                        <tbody>
                          {expandedResults.map((er, i) => (
                            <tr key={er.id} className="divider/50 hover:bg-surface-3/20 cursor-pointer transition-colors" onClick={() => setDetailResult(er)}>
                              <td className="py-2 pr-2 text-[11px] text-text-muted">{i + 1}</td>
                              <td className="py-2 pr-2 text-xs text-text-secondary max-w-[200px]"><div className="line-clamp-1">{er.input}</div></td>
                              <td className="py-2 pr-2 text-xs text-text-tertiary max-w-[200px]"><div className="line-clamp-1">{er.agent_output || er.error_message || '-'}</div></td>
                              <td className="py-2 pr-2"><span className={`text-xs font-medium ${scoreColor(er.overall_score)}`}>{(er.overall_score * 100).toFixed(0)}%</span></td>
                              <td className="py-2 pr-2">{er.passed ? <Badge variant="green">{ec.passed}</Badge> : <Badge variant="red">{ec.notPassed}</Badge>}</td>
                              <td className="py-2">
                                {!er.passed && (
                                  <button onClick={e => { e.stopPropagation(); handleImportBadCase(er.id) }} className="text-[11px] text-text-tertiary hover:text-red-400" title={ec.markBadCase}><Bug size={12} /></button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Evaluation Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{ec.createRun}</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ec.selectAgent}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}>
              <option value="">{ec.pleaseSelect}</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agent_type}{a.skills ? `, ${a.skills.length} ${ec.skills}` : ''})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ec.selectSuite}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.test_suite_id} onChange={e => setForm({ ...form, test_suite_id: e.target.value })}>
              <option value="">{ec.pleaseSelect}</option>
              {suites.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version} ({s.case_count} {ec.cases})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{ec.modelConfig} <span className="text-text-muted">({ec.modelConfigOptional})</span></label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.model_config_id} onChange={e => setForm({ ...form, model_config_id: e.target.value })}>
                <option value="">{ec.defaultOption}</option>
                {configs.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{ec.evalTemplate} <span className="text-text-muted">({ec.evalTemplateOptional})</span></label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}>
                <option value="">{ec.manualDims}</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ec.modelOverride} <span className="text-text-muted">({ec.modelOverrideHint})</span></label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" placeholder={ec.modelOverridePlaceholder} value={form.model_override} onChange={e => setForm({ ...form, model_override: e.target.value })} />
          </div>
          {!form.template_id && (
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">{ec.dimensions}</label>
              <div className="flex flex-wrap gap-2">
                {ALL_DIMS.map(d => (
                  <button key={d} onClick={() => toggleDim(d)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${form.dimensions.includes(d) ? 'bg-brand-600/20 border-brand-500/50 text-brand-300' : 'bg-surface-2 border-border text-text-tertiary hover:border-border-light'}`}>
                    {dimensionLabel(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.enable_skills_eval} onChange={e => setForm({ ...form, enable_skills_eval: e.target.checked })} className="accent-brand-500" />
              <span className="text-xs text-text-secondary">{ec.skillsEval}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.enable_trajectory_eval} onChange={e => setForm({ ...form, enable_trajectory_eval: e.target.checked })} className="accent-violet-500" />
              <span className="text-xs text-text-secondary">{ec.trajectoryEval}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_baseline} onChange={e => setForm({ ...form, is_baseline: e.target.checked })} className="accent-amber-500" />
              <span className="text-xs text-text-secondary">{ec.setBaseline}</span>
            </label>
          </div>
          {form.enable_trajectory_eval && (
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">{ec.trajectoryDimensions}</label>
              <div className="flex flex-wrap gap-2">
                {ALL_TRAJECTORY_DIMENSIONS.map(d => (
                  <button key={d} onClick={() => toggleTrajectoryDim(d)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${form.trajectory_dimensions.includes(d) ? 'bg-violet-600/20 border-violet-500/50 text-violet-300' : 'bg-surface-2 border-border text-text-tertiary hover:border-border-light'}`}>
                    {dimensionLabel(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ec.concurrency}</label><input type="number" min="1" max="20" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.concurrency} onChange={e => setForm({ ...form, concurrency: parseInt(e.target.value) || 5 })} /></div>
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ec.timeoutSeconds}</label><input type="number" min="10" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.timeout} onChange={e => setForm({ ...form, timeout: parseInt(e.target.value) || 60 })} /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              {ec.repeatCount} <span className="text-text-muted">({ec.repeatCountHint})</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="1" max="10" step="1"
                className="flex-1 accent-brand-500 h-1.5"
                value={form.repeat_count}
                onChange={e => setForm({ ...form, repeat_count: parseInt(e.target.value) || 1 })}
              />
              <span className={`text-sm font-semibold w-6 text-center ${form.repeat_count > 1 ? 'text-brand-400' : 'text-text-tertiary'}`}>{form.repeat_count}</span>
            </div>
            {form.repeat_count > 1 && (
              <p className="text-[10px] text-brand-400/70 mt-1">{ec.repeatCountDesc.replace(/\{count\}/g, String(form.repeat_count))}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{ec.cancel}</Button>
          <Button onClick={handleCreate} disabled={!form.agent_id || !form.test_suite_id}>{ec.startEval}</Button>
        </div>
      </Modal>

      {/* Result Detail Modal */}
      <Modal open={!!detailResult} onClose={() => { setDetailResult(null); setDetailTab('output') }}>
        {detailResult && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">{ec.resultDetail}</h3>
              <div className="flex items-center gap-2">
                {detailResult.critical_failure && <Badge variant="red"><ShieldX size={10} className="mr-1" />{ec.criticalFailure}</Badge>}
                {detailResult.passed ? <Badge variant="green">{ec.passed}</Badge> : <Badge variant="red">{ec.notPassed}</Badge>}
              </div>
            </div>

            {detailResult.trajectory && detailResult.trajectory.length > 0 && (
              <div className="flex gap-1 mb-4 bg-surface-2 rounded-lg p-0.5 w-fit">
                <button onClick={() => setDetailTab('output')} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${detailTab === 'output' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}>
                  {ec.tabOutput}
                </button>
                <button onClick={() => setDetailTab('trajectory')} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${detailTab === 'trajectory' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}>
                  <Route size={11} />{ec.tabTrajectory} ({detailResult.trajectory.length} {ec.trajectorySteps})
                </button>
              </div>
            )}

            {detailTab === 'output' ? (
              <div className="grid gap-3">
                <div><label className="text-[11px] text-text-tertiary uppercase">{ec.userInput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detailResult.input}</div></div>
                {detailResult.expected_output && <div><label className="text-[11px] text-text-tertiary uppercase">{ec.expectedOutput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detailResult.expected_output}</div></div>}
                <div><label className="text-[11px] text-text-tertiary uppercase">{ec.agentOutput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap max-h-[200px] overflow-y-auto">{detailResult.agent_output || ec.noOutput}</div></div>

                {detailResult.assertion_results && detailResult.assertion_results.length > 0 && (
                  <div>
                    <label className="text-[11px] text-text-tertiary uppercase mb-1.5 block">{ec.assertionResults}</label>
                    <div className="space-y-1">
                      {detailResult.assertion_results.map((ar, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-0">
                          {ar.passed ? <ShieldCheck size={12} className="text-emerald-400 shrink-0" /> : <ShieldX size={12} className="text-red-400 shrink-0" />}
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: assertionTypeColor(ar.type), backgroundColor: `${assertionTypeColor(ar.type)}15` }}>
                            {assertionTypeLabel(ar.type)}
                          </span>
                          {ar.value !== undefined && <span className="text-[10px] text-text-tertiary font-mono truncate max-w-[150px]">{String(ar.value)}</span>}
                          {ar.critical && <span className="text-[10px] text-red-400 bg-red-400/10 px-1 rounded">critical</span>}
                          <span className="flex-1" />
                          <span className={`text-[10px] ${ar.passed ? 'text-emerald-500' : 'text-red-400'}`}>{ar.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailResult.scores && Object.keys(detailResult.scores).length > 0 && (
                  <div><label className="text-[11px] text-text-tertiary uppercase mb-1.5 block">{ec.dimensionScores}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(detailResult.scores).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2"><span className="text-xs text-text-secondary w-20 shrink-0">{dimensionLabel(k)}</span><ScoreBar value={v} /><span className="text-[11px] text-text-secondary">{(v * 100).toFixed(0)}%</span></div>
                      ))}
                    </div>
                  </div>
                )}
                {detailResult.reasoning && <div><label className="text-[11px] text-text-tertiary uppercase">{ec.reasoning}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detailResult.reasoning}</div></div>}
                <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
                  {detailResult.latency_ms && <span>{ec.latency}: {detailResult.latency_ms}ms</span>}
                  <span>{ec.totalScore}: <span className={scoreColor(detailResult.overall_score)}>{(detailResult.overall_score * 100).toFixed(0)}%</span></span>
                  <span className="flex-1" />
                  {!detailResult.passed && (
                    <button onClick={() => handleImportBadCase(detailResult.id)} className="text-red-400 hover:text-red-300 flex items-center gap-1"><Bug size={11} /> {ec.markBadCase}</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <div>
                  <label className="text-[11px] text-text-tertiary uppercase mb-2 block">{ec.executionSteps}</label>
                  <div className="max-h-[350px] overflow-y-auto">
                    <TrajectoryTimeline steps={detailResult.trajectory || []} />
                  </div>
                </div>
                {detailResult.trajectory_scores && Object.keys(detailResult.trajectory_scores).filter(k => !k.startsWith('_')).length > 0 && (
                  <div>
                    <label className="text-[11px] text-text-tertiary uppercase mb-1.5 block">{ec.trajectoryScores}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(detailResult.trajectory_scores).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary w-20 shrink-0">{dimensionLabel(k)}</span>
                          <ScoreBar value={typeof v === 'number' ? v : 0} />
                          <span className="text-[11px] text-text-secondary">{(typeof v === 'number' ? v * 100 : 0).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailResult.trajectory_scores?._programmatic && (
                  <div>
                    <label className="text-[11px] text-text-tertiary uppercase mb-1.5 block">{ec.programmaticCompare}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(detailResult.trajectory_scores._programmatic as unknown as Record<string, number>).map(([k, v]) => (
                        <div key={k} className="bg-surface-2 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-text-tertiary">{k.replace(/_/g, ' ')}</div>
                          <div className={`text-sm font-bold mt-0.5 ${scoreColor(typeof v === 'number' ? v : 0)}`}>{(typeof v === 'number' ? v * 100 : 0).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailResult.trajectory_reasoning && (
                  <div><label className="text-[11px] text-text-tertiary uppercase">{ec.trajectoryReasoning}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detailResult.trajectory_reasoning}</div></div>
                )}
                {detailResult.trajectory_overall !== null && detailResult.trajectory_overall !== undefined && (
                  <div className="flex gap-4 text-[11px] text-text-tertiary">
                    <span>{ec.trajectoryTotal}: <span className={scoreColor(detailResult.trajectory_overall)}>{(detailResult.trajectory_overall * 100).toFixed(0)}%</span></span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Regression Compare Modal */}
      <Modal open={showRegression} onClose={() => { setShowRegression(false); setRegressionReport(null) }}>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><GitCompare size={16} /> {ec.regressionTitle}</h3>
        {regressionReport ? (
          <RegressionDiff report={regressionReport} />
        ) : (
          <p className="text-xs text-text-tertiary text-center py-4">{ec.noBaselineData}</p>
        )}
      </Modal>
    </div>
  )
}
