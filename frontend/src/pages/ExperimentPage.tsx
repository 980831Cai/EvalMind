import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n'
import type { Agent, TestSuite, ModelConfig, Experiment, ExperimentVariable } from '../types'
import * as api from '../services/api'
import { FlaskConical, Plus, Trash2, RefreshCw, ChevronRight, AlertCircle, CheckCircle2, Clock, X } from 'lucide-react'

interface Props {
  agents: Agent[]
  suites: TestSuite[]
  modelConfigs: ModelConfig[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

export default function ExperimentPage({ agents, suites, modelConfigs, showToast }: Props) {
  const { t } = useI18n()
  const ex = t.experiment as Record<string, string>

  const VARIABLE_TYPES = [
    { value: 'model', label: ex.varModel, placeholder: ex.varModelPlaceholder },
    { value: 'temperature', label: ex.varTemperature, placeholder: ex.varTemperaturePlaceholder },
    { value: 'prompt', label: ex.varPrompt, placeholder: ex.varPromptPlaceholder },
    { value: 'tool_config', label: ex.varToolConfig, placeholder: ex.varToolConfigPlaceholder },
  ]

  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null)

  // Create form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agentId, setAgentId] = useState('')
  const [suiteId, setSuiteId] = useState('')
  const [modelConfigId, setModelConfigId] = useState('')
  const [variables, setVariables] = useState<{ type: string; valuesStr: string }[]>([
    { type: 'model', valuesStr: '' },
  ])
  const [creating, setCreating] = useState(false)

  const loadExperiments = useCallback(async () => {
    setLoading(true)
    try { setExperiments(await api.fetchExperiments()) } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadExperiments() }, [loadExperiments])

  const addVariable = () => {
    const used = new Set(variables.map(v => v.type))
    const next = VARIABLE_TYPES.find(t => !used.has(t.value))
    if (next) setVariables([...variables, { type: next.value, valuesStr: '' }])
  }

  const removeVariable = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx))
  }

  const updateVariable = (idx: number, field: 'type' | 'valuesStr', value: string) => {
    const copy = [...variables]
    copy[idx] = { ...copy[idx], [field]: value }
    setVariables(copy)
  }

  const totalCombinations = variables.reduce((acc, v) => {
    const count = v.valuesStr.split(',').filter(s => s.trim()).length
    return acc * Math.max(count, 1)
  }, 1)

  const handleCreate = async () => {
    if (!name.trim()) return showToast(ex.nameRequired, 'error')
    if (!agentId) return showToast(ex.agentRequired, 'error')
    if (!suiteId) return showToast(ex.suiteRequired, 'error')
    if (variables.some(v => !v.valuesStr.trim())) return showToast(ex.variablesRequired, 'error')

    const parsedVars: ExperimentVariable[] = variables.map(v => ({
      type: v.type,
      values: v.valuesStr.split(',').map(s => s.trim()).filter(Boolean),
    }))

    setCreating(true)
    try {
      await api.createExperiment({
        name: name.trim(),
        description: description.trim() || undefined,
        agent_id: agentId,
        test_suite_id: suiteId,
        variables: parsedVars,
        model_config_id: modelConfigId || undefined,
      })
      showToast(ex.created)
      setShowCreate(false)
      setName(''); setDescription(''); setVariables([{ type: 'model', valuesStr: '' }])
      loadExperiments()
    } catch (e: unknown) {
      showToast((e as Error).message, 'error')
    }
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteExperiment(id)
      showToast(ex.deleted)
      if (selectedExp?.id === id) setSelectedExp(null)
      loadExperiments()
    } catch (e: unknown) { showToast((e as Error).message, 'error') }
  }

  const handleViewDetail = async (exp: Experiment) => {
    try {
      const detail = await api.fetchExperiment(exp.id)
      setSelectedExp(detail)
    } catch {
      setSelectedExp(exp)
    }
  }

  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle2 size={14} className="text-emerald-400" />
    if (s === 'running') return <RefreshCw size={14} className="text-blue-400 animate-spin" />
    if (s === 'failed') return <AlertCircle size={14} className="text-red-400" />
    return <Clock size={14} className="text-text-tertiary" />
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { pending: ex.statusPending, running: ex.statusRunning, completed: ex.statusCompleted, failed: ex.statusFailed }
    return map[s] || s
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical size={24} className="text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">{ex.title}</h1>
            <p className="text-sm text-text-tertiary">{ex.desc}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadExperiments} className="px-3 py-1.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg flex items-center gap-1.5 text-text-secondary">
            <RefreshCw size={14} /> {ex.refresh}
          </button>
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg flex items-center gap-1.5 text-white">
            <Plus size={14} /> {ex.newExperiment}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className="w-96 space-y-2 flex-shrink-0">
          {loading && <div className="text-sm text-text-tertiary py-8 text-center">{ex.loading}</div>}
          {!loading && experiments.length === 0 && (
            <div className="card p-8 text-center">
              <FlaskConical size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-tertiary">{ex.noExperiments}</p>
            </div>
          )}
          {experiments.map(exp => (
            <div
              key={exp.id}
              className={`bg-surface-2 border rounded-xl p-4 cursor-pointer transition-all hover:border-border-strong ${
                selectedExp?.id === exp.id ? 'border-brand-500' : 'border-border'
              }`}
              onClick={() => handleViewDetail(exp)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  {statusIcon(exp.status)} {exp.name}
                </h3>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(exp.id) }}
                  className="text-text-muted hover:text-red-400 p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="text-xs text-text-tertiary space-y-1">
                <div className="flex justify-between">
                  <span>{statusLabel(exp.status)}</span>
                  <span>{exp.completed_combinations}/{exp.total_combinations} {ex.combinations}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {exp.variables.map((v, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-surface-3 rounded text-[11px] text-text-secondary">
                      {v.type}: {Array.isArray(v.values) ? v.values.length : 0} {ex.values}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-text-muted mt-2">
                {new Date(exp.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
          ))}
        </div>

        {/* Detail / Result Matrix */}
        <div className="flex-1 min-w-0">
          {selectedExp ? (
            <div className="card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  {statusIcon(selectedExp.status)} {selectedExp.name}
                </h2>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  selectedExp.status === 'completed' ? 'bg-emerald-950 text-emerald-400' :
                  selectedExp.status === 'running' ? 'bg-blue-950 text-blue-400' :
                  selectedExp.status === 'failed' ? 'bg-red-950 text-red-400' :
                  'bg-surface-3 text-text-secondary'
                }`}>
                  {statusLabel(selectedExp.status)} — {selectedExp.completed_combinations}/{selectedExp.total_combinations}
                </span>
              </div>

              {selectedExp.description && (
                <p className="text-sm text-text-secondary">{selectedExp.description}</p>
              )}

              {/* Variables Summary */}
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">{ex.experimentVariables}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedExp.variables.map((v, i) => (
                    <div key={i} className="bg-surface-3 rounded-lg p-3">
                      <div className="text-xs text-text-tertiary mb-1">{VARIABLE_TYPES.find(t => t.value === v.type)?.label || v.type}</div>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(v.values) ? v.values : []).map((val, j) => (
                          <span key={j} className="px-2 py-0.5 bg-surface-4 rounded text-xs text-text-secondary">{String(val)}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Result Matrix */}
              {selectedExp.result_matrix && selectedExp.result_matrix.combinations && (
                <div>
                  <h3 className="text-sm font-medium text-text-secondary mb-2">{ex.resultMatrix}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-light">
                          <th className="text-left px-3 py-2 text-text-secondary font-medium">#</th>
                          {selectedExp.variables.map((v, i) => (
                            <th key={i} className="text-left px-3 py-2 text-text-secondary font-medium">
                              {VARIABLE_TYPES.find(t => t.value === v.type)?.label || v.type}
                            </th>
                          ))}
                          <th className="text-center px-3 py-2 text-text-secondary font-medium">{ex.status}</th>
                          <th className="text-center px-3 py-2 text-text-secondary font-medium">{ex.avgScore}</th>
                          <th className="text-center px-3 py-2 text-text-secondary font-medium">{ex.passRate}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedExp.result_matrix.combinations.map((row, idx) => (
                          <tr key={idx} className="border-b border-border hover:bg-surface-3/50">
                            <td className="px-3 py-2 text-text-tertiary">{idx + 1}</td>
                            {selectedExp!.variables.map((v, vi) => (
                              <td key={vi} className="px-3 py-2 text-text-secondary">
                                <span className="px-2 py-0.5 bg-surface-3 rounded text-xs">
                                  {String(row.combination[v.type] ?? '-')}
                                </span>
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center">{statusIcon(row.status || 'pending')}</td>
                            <td className="px-3 py-2 text-center">
                              {row.average_score != null ? (
                                <span className={`font-mono ${
                                  row.average_score >= 0.8 ? 'text-emerald-400' :
                                  row.average_score >= 0.6 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                  {(row.average_score * 100).toFixed(1)}%
                                </span>
                              ) : <span className="text-text-muted">-</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.pass_rate != null ? (
                                <span className={`font-mono ${
                                  row.pass_rate >= 80 ? 'text-emerald-400' :
                                  row.pass_rate >= 60 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                  {row.pass_rate}%
                                </span>
                              ) : <span className="text-text-muted">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Best Combination */}
                  {selectedExp.status === 'completed' && selectedExp.result_matrix.combinations.length > 0 && (() => {
                    const completed = selectedExp.result_matrix!.combinations.filter(c => c.average_score != null)
                    if (!completed.length) return null
                    const best = completed.reduce((a, b) => (a.average_score || 0) > (b.average_score || 0) ? a : b)
                    return (
                      <div className="mt-3 p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-lg">
                        <div className="text-sm text-emerald-400 font-medium mb-1">{ex.bestCombination}</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {Object.entries(best.combination).map(([k, v]) => (
                            <span key={k} className="px-2 py-1 bg-emerald-900/50 rounded text-emerald-300">
                              {k}: {String(v)}
                            </span>
                          ))}
                          <span className="px-2 py-1 bg-emerald-900/50 rounded text-emerald-200 font-mono">
                            {ex.score}: {((best.average_score || 0) * 100).toFixed(1)}% | {ex.passRate}: {best.pass_rate}%
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {selectedExp.status === 'running' && !selectedExp.result_matrix && (
                <div className="text-center py-12">
                  <RefreshCw size={28} className="text-blue-400 mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-text-secondary">{ex.experimentRunning} {selectedExp.completed_combinations}/{selectedExp.total_combinations}</p>
                  <div className="w-48 h-1.5 bg-surface-3 rounded-full mx-auto mt-3 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${selectedExp.total_combinations ? (selectedExp.completed_combinations / selectedExp.total_combinations * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <ChevronRight size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-tertiary">{ex.selectExperiment}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="input-sm rounded-xl w-[640px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-text-primary">{ex.createTitle}</h2>
              <button onClick={() => setShowCreate(false)} className="text-text-tertiary hover:text-text-secondary">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{ex.expName}</label>
                <input
                  className="w-full bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand-500 outline-none"
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder={ex.expNamePlaceholder}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{ex.descLabel}</label>
                <textarea
                  className="w-full bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand-500 outline-none resize-none"
                  rows={2} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={ex.descPlaceholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{ex.agentLabel}</label>
                  <select
                    className="w-full bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
                    value={agentId} onChange={e => setAgentId(e.target.value)}
                  >
                    <option value="">{ex.selectAgentOption}</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{ex.suiteLabel}</label>
                  <select
                    className="w-full bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
                    value={suiteId} onChange={e => setSuiteId(e.target.value)}
                  >
                    <option value="">{ex.selectSuiteOption}</option>
                    {suites.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version} ({s.case_count})</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">{ex.modelConfig}</label>
                <select
                  className="w-full bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
                  value={modelConfigId} onChange={e => setModelConfigId(e.target.value)}
                >
                  <option value="">{ex.defaultConfig}</option>
                  {modelConfigs.filter(j => j.is_active).map(j => (
                    <option key={j.id} value={j.id}>{j.name} ({j.model_name})</option>
                  ))}
                </select>
              </div>

              {/* Variables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-text-secondary">{ex.variableLabel}</label>
                  <button
                    onClick={addVariable}
                    disabled={variables.length >= VARIABLE_TYPES.length}
                    className="text-xs text-violet-400 hover:text-brand-300 disabled:text-text-muted"
                  >
                    {ex.addVariable}
                  </button>
                </div>
                <div className="space-y-2">
                  {variables.map((v, idx) => {
                    const typeInfo = VARIABLE_TYPES.find(t => t.value === v.type)
                    const isModelType = v.type === 'model'
                    const selectedModels = v.valuesStr.split(',').map(s => s.trim()).filter(Boolean)
                    return (
                      <div key={idx} className="flex items-start gap-2">
                        <select
                          className="w-32 bg-surface-3 border border-border-light rounded-lg px-2 py-2 text-sm text-text-primary outline-none flex-shrink-0"
                          value={v.type}
                          onChange={e => updateVariable(idx, 'type', e.target.value)}
                        >
                          {VARIABLE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        {isModelType ? (
                          <div className="flex-1 bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm">
                            <div className="flex flex-wrap gap-1.5">
                              {modelConfigs.filter(mc => mc.is_active).map(mc => {
                                const checked = selectedModels.includes(mc.model_name)
                                return (
                                  <label key={mc.id} className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${checked ? 'bg-brand-600/30 text-brand-300 border border-brand-500/50' : 'bg-surface-4/50 text-text-secondary border border-border-light hover:border-border-strong'}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const newModels = checked
                                          ? selectedModels.filter(m => m !== mc.model_name)
                                          : [...selectedModels, mc.model_name]
                                        updateVariable(idx, 'valuesStr', newModels.join(', '))
                                      }}
                                      className="sr-only"
                                    />
                                    <span className="text-xs">{mc.name} ({mc.model_name})</span>
                                  </label>
                                )
                              })}
                              {modelConfigs.filter(mc => mc.is_active).length === 0 && (
                                <span className="text-xs text-text-tertiary">{ex.noModelConfigs}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <input
                            className="flex-1 bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand-500 outline-none"
                            value={v.valuesStr}
                            onChange={e => updateVariable(idx, 'valuesStr', e.target.value)}
                            placeholder={typeInfo?.placeholder || ex.commaSeparated}
                          />
                        )}
                        {variables.length > 1 && (
                          <button onClick={() => removeVariable(idx)} className="text-text-muted hover:text-red-400 p-2">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="text-xs text-text-tertiary mt-2">
                  {ex.totalCombinations} <span className="text-violet-400 font-mono">{totalCombinations}</span> {ex.combinationsUnit}
                  {totalCombinations > 20 && <span className="text-yellow-400 ml-2">{ex.tooManyCombinations}</span>}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg text-text-secondary">{ex.cancel}</button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:bg-surface-4 rounded-lg text-white"
              >
                {creating ? ex.creating : `${ex.createBtn} (${totalCombinations} ${ex.combinationsLabel})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
