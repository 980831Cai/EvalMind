import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'
import { Radio, Plus, Trash2, Power, PowerOff, Edit2, AlertTriangle, Activity } from 'lucide-react'
import type { OnlineEvalConfig, Agent, ModelConfig, EvalDimension } from '../types'
import * as api from '../services/api'
import { dimensionLabel } from '../utils/helpers'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'

interface Props {
  agents: Agent[]
  modelConfigs: ModelConfig[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const defaultForm = {
  name: '',
  description: '',
  agent_ids: [] as string[],
  dimensions: [] as string[],
  model_config_id: '',
  sample_rate: 1.0,
  is_active: true,
  alert_rules: [] as Array<{ dimension: string; threshold: number; operator: string; action: string; target?: string }>,
}

export default function OnlineEvalPage({ agents, modelConfigs, showToast }: Props) {
  const { t } = useI18n()
  const oe = t.onlineEval as Record<string, string>
  const [configs, setConfigs] = useState<OnlineEvalConfig[]>([])
  const [dimensions, setDimensions] = useState<EvalDimension[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [stats, setStats] = useState<{ total_configs: number; active_configs: number; total_automated_scores: number } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [cfgs, dims, s] = await Promise.all([
        api.fetchOnlineEvalConfigs(),
        api.fetchDimensions(),
        api.fetchOnlineEvalStats() as Promise<{ total_configs: number; active_configs: number; total_automated_scores: number }>,
      ])
      setConfigs(cfgs)
      setDimensions(dims)
      setStats(s)
    } catch (e: unknown) {
      showToast(`${oe.loadFailed}: ${e instanceof Error ? e.message : oe.unknownError}`, 'error')
    }
  }

  useEffect(() => { load() }, [])

  // 只展示免参考维度（可用于在线评估）
  const referencelessDims = dimensions.filter(d => !d.requires_reference)

  const openCreate = () => {
    setForm({ ...defaultForm })
    setEditId(null)
    setShowModal(true)
  }

  const openEdit = (c: OnlineEvalConfig) => {
    setForm({
      name: c.name,
      description: c.description || '',
      agent_ids: c.agent_ids || [],
      dimensions: c.dimensions || [],
      model_config_id: c.model_config_id,
      sample_rate: c.sample_rate,
      is_active: c.is_active,
      alert_rules: (c.alert_rules || []).map(r => ({
        dimension: r.dimension, threshold: r.threshold,
        operator: r.operator, action: r.action, target: r.target,
      })),
    })
    setEditId(c.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (editId) {
        await api.updateOnlineEvalConfig(editId, form)
        showToast(oe.updated)
      } else {
        await api.createOnlineEvalConfig(form)
        showToast(oe.created)
      }
      setShowModal(false)
      load()
    } catch (e: unknown) {
      showToast(`${oe.operationFailed}: ${e instanceof Error ? e.message : oe.unknownError}`, 'error')
    }
  }

  const handleToggle = async (id: string) => {
    try {
      const result = await api.toggleOnlineEvalConfig(id)
      showToast(result.is_active ? oe.enabled : oe.disabled)
      load()
    } catch (e: unknown) {
      showToast(`${oe.operationFailed}: ${e instanceof Error ? e.message : oe.unknownError}`, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteOnlineEvalConfig(id)
      showToast(oe.deleted)
      setDeleteConfirmId(null)
      load()
    } catch (e: unknown) {
      showToast(`${oe.deleteFailed}: ${e instanceof Error ? e.message : oe.unknownError}`, 'error')
    }
  }

  const toggleAgent = (agentId: string) => {
    setForm(f => ({
      ...f,
      agent_ids: f.agent_ids.includes(agentId)
        ? f.agent_ids.filter(a => a !== agentId)
        : [...f.agent_ids, agentId],
    }))
  }

  const toggleDim = (dimName: string) => {
    setForm(f => ({
      ...f,
      dimensions: f.dimensions.includes(dimName)
        ? f.dimensions.filter(d => d !== dimName)
        : [...f.dimensions, dimName],
    }))
  }

  const addAlertRule = () => {
    setForm(f => ({
      ...f,
      alert_rules: [...f.alert_rules, { dimension: '', threshold: 0.5, operator: 'lt', action: 'log' }],
    }))
  }

  const removeAlertRule = (idx: number) => {
    setForm(f => ({
      ...f,
      alert_rules: f.alert_rules.filter((_, i) => i !== idx),
    }))
  }

  const updateAlertRule = (idx: number, field: string, value: unknown) => {
    setForm(f => ({
      ...f,
      alert_rules: f.alert_rules.map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }))
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Radio size={20} /> {oe.title}
          </h2>
          <p className="text-xs text-text-tertiary mt-1">{oe.desc}</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
          <Plus size={14} className="mr-1" />{oe.newConfig}
        </Button>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-[11px] text-text-tertiary uppercase mb-1">{oe.totalConfigs}</div>
            <div className="text-2xl font-bold text-text-primary">{stats.total_configs}</div>
          </div>
          <div className="card p-4">
            <div className="text-[11px] text-text-tertiary uppercase mb-1">{oe.activeConfigs}</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.active_configs}</div>
          </div>
          <div className="card p-4">
            <div className="text-[11px] text-text-tertiary uppercase mb-1">{oe.autoScores}</div>
            <div className="text-2xl font-bold text-brand-400">{stats.total_automated_scores}</div>
          </div>
        </div>
      )}

      {/* 配置列表 */}
      {configs.length === 0 ? (
        <EmptyState icon={<Radio size={36} className="text-text-muted" />} title={oe.noConfigs} description={oe.noConfigsHint} />
      ) : (
        <div className="space-y-3">
          {configs.map(c => (
            <div key={c.id} className="card p-4 hover:border-border-light transition-colors group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{c.name}</span>
                  {c.is_active ? (
                    <Badge variant="green"><Activity size={10} className="mr-1" />{oe.running}</Badge>
                  ) : (
                    <Badge variant="gray"><PowerOff size={10} className="mr-1" />{oe.stopped}</Badge>
                  )}
                  <span className="text-[10px] text-text-muted">{oe.sampleRate}: {(c.sample_rate * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="text-text-secondary hover:text-text-primary"><Edit2 size={13} /></button>
                  <button onClick={() => handleToggle(c.id)} className={c.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}>
                    {c.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                  </button>
                  {deleteConfirmId === c.id ? (
                    <span className="flex items-center gap-1">
                      <button onClick={() => handleDelete(c.id)} className="text-[10px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">{oe.confirm}</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded">{oe.cancel}</button>
                    </span>
                  ) : (
                    <button onClick={() => { setDeleteConfirmId(c.id); setTimeout(() => setDeleteConfirmId(p => p === c.id ? null : p), 3000) }} className="text-red-500 hover:text-red-400"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
              {c.description && <p className="text-xs text-text-tertiary mb-2">{c.description}</p>}
              <div className="flex flex-wrap gap-2 mb-2">
                {c.dimensions.map(d => (
                  <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                    {dimensionLabel(d)}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-text-muted">
                <span>Agent: {c.agent_ids.length > 0 ? c.agent_ids.map(id => agents.find(a => a.id === id)?.name || id).join(', ') : oe.agentAll}</span>
                {c.alert_rules && c.alert_rules.length > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-500"><AlertTriangle size={10} />{c.alert_rules.length} {oe.alertRulesCount}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? oe.editLabel : oe.createLabel}{oe.onlineEvalConfig}</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{oe.configName}</label>
              <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{oe.modelConfig}</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.model_config_id} onChange={e => setForm({ ...form, model_config_id: e.target.value })}>
                <option value="">{oe.selectOption}</option>
                {modelConfigs.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{oe.description}</label>
            <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">{oe.targetAgent} <span className="text-text-muted">（{oe.targetAgentHint}）</span></label>
            <div className="flex flex-wrap gap-2">
              {agents.map(a => (
                <button key={a.id} onClick={() => toggleAgent(a.id)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${form.agent_ids.includes(a.id) ? 'bg-brand-600/20 border-brand-500/50 text-brand-300' : 'bg-surface-2 border-border text-text-tertiary hover:border-border-light'}`}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">{oe.evalDimensions} <span className="text-emerald-400 text-[10px]">（{oe.referencelessHint}）</span></label>
            <div className="flex flex-wrap gap-2">
              {referencelessDims.map(d => (
                <button key={d.name} onClick={() => toggleDim(d.name)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${form.dimensions.includes(d.name) ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300' : 'bg-surface-2 border-border text-text-tertiary hover:border-border-light'}`}>
                  {d.display_name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{oe.sampleRateLabel}</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="1" step="0.05" className="flex-1 accent-brand-500 h-1.5" value={form.sample_rate} onChange={e => setForm({ ...form, sample_rate: parseFloat(e.target.value) })} />
                <span className="text-sm font-semibold text-text-secondary w-12 text-right">{(form.sample_rate * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="accent-emerald-500" />
                <span className="text-xs text-text-secondary">{oe.enableNow}</span>
              </label>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary">{oe.alertRules}</label>
              <button onClick={addAlertRule} className="text-[11px] text-brand-400 hover:text-brand-300">{oe.addRule}</button>
            </div>
            {form.alert_rules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2 bg-surface-0 rounded-lg p-2">
                <select className="card rounded px-2 py-1 text-xs text-text-primary outline-none" value={rule.dimension} onChange={e => updateAlertRule(idx, 'dimension', e.target.value)}>
                  <option value="">{oe.dimension}</option>
                  {referencelessDims.map(d => <option key={d.name} value={d.name}>{d.display_name}</option>)}
                </select>
                <select className="card rounded px-2 py-1 text-xs text-text-primary outline-none w-16" value={rule.operator} onChange={e => updateAlertRule(idx, 'operator', e.target.value)}>
                  <option value="lt">&lt;</option>
                  <option value="lte">≤</option>
                  <option value="gt">&gt;</option>
                  <option value="gte">≥</option>
                </select>
                <input type="number" step="0.1" min="0" max="1" className="w-16 card rounded px-2 py-1 text-xs text-text-primary outline-none" value={rule.threshold} onChange={e => updateAlertRule(idx, 'threshold', parseFloat(e.target.value) || 0)} />
                <select className="card rounded px-2 py-1 text-xs text-text-primary outline-none" value={rule.action} onChange={e => updateAlertRule(idx, 'action', e.target.value)}>
                  <option value="log">{oe.actionLog}</option>
                  <option value="webhook">{oe.actionWebhook}</option>
                </select>
                <button onClick={() => removeAlertRule(idx)} className="text-red-500 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{oe.cancel}</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.model_config_id || form.dimensions.length === 0}>
            {editId ? oe.save : oe.create}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
