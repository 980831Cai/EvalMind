import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'
import { Tags, Plus, Trash2, Edit2, Eye, CheckCircle, Pause, Play } from 'lucide-react'
import type { AnnotationQueue, Agent } from '../types'
import * as api from '../services/api'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'

interface Props {
  agents: Agent[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const defaultForm = {
  name: '',
  description: '',
  filter_config: {
    agent_ids: [] as string[],
    source: [] as string[],
    status: ['ok'] as string[],
  },
  score_configs: [] as Array<{ name: string; type: string; min?: number; max?: number; description?: string; options?: string[] }>,
  assignees: [] as string[],
}

export default function AnnotationPage({ agents, showToast }: Props) {
  const { t } = useI18n()
  const an = t.annotation as Record<string, string>
  const [queues, setQueues] = useState<AnnotationQueue[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [workQueueId, setWorkQueueId] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<any[]>([])
  const [workTotal, setWorkTotal] = useState(0)
  const [workQueue, setWorkQueue] = useState<AnnotationQueue | null>(null)

  const load = async () => {
    try {
      setQueues(await api.fetchAnnotationQueues())
    } catch (e: unknown) {
      showToast(`${an.loadFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm({ ...defaultForm, score_configs: [{ name: 'accuracy', type: 'numeric', min: 0, max: 1, description: an.defaultDimDesc }] })
    setEditId(null)
    setShowModal(true)
  }

  const openEdit = (q: AnnotationQueue) => {
    setForm({
      name: q.name,
      description: q.description || '',
      filter_config: q.filter_config as typeof defaultForm.filter_config,
      score_configs: q.score_configs as typeof defaultForm.score_configs,
      assignees: q.assignees || [],
    })
    setEditId(q.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (editId) {
        await api.updateAnnotationQueue(editId, form)
        showToast(an.queueUpdated)
      } else {
        await api.createAnnotationQueue(form)
        showToast(an.queueCreated)
      }
      setShowModal(false)
      load()
    } catch (e: unknown) {
      showToast(`${an.operationFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAnnotationQueue(id)
      showToast(an.deleted)
      setDeleteConfirmId(null)
      load()
    } catch (e: unknown) {
      showToast(`${an.deleteFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  const handlePauseResume = async (q: AnnotationQueue) => {
    try {
      const newStatus = q.status === 'active' ? 'paused' : 'active'
      await api.updateAnnotationQueue(q.id, { status: newStatus })
      showToast(newStatus === 'active' ? an.resumed : an.paused)
      load()
    } catch (e: unknown) {
      showToast(`${an.operationFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  const openWork = async (q: AnnotationQueue) => {
    setWorkQueueId(q.id)
    setWorkQueue(q)
    try {
      const resp = await api.fetchAnnotationQueueItems(q.id, { limit: 20 })
      setWorkItems(resp.data)
      setWorkTotal(resp.total)
    } catch (e: unknown) {
      showToast(`${an.loadItemsFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  const handleComplete = async (traceId: string) => {
    if (!workQueueId) return
    try {
      await api.completeAnnotation(workQueueId, traceId)
      showToast(an.annotationComplete)
      setWorkItems(items => items.filter(i => i.id !== traceId))
      load()
    } catch (e: unknown) {
      showToast(`${an.operationFailed}: ${e instanceof Error ? e.message : an.unknownError}`, 'error')
    }
  }

  const addScoreConfig = () => {
    setForm(f => ({
      ...f,
      score_configs: [...f.score_configs, { name: '', type: 'numeric', min: 0, max: 1, description: '' }],
    }))
  }

  const removeScoreConfig = (idx: number) => {
    setForm(f => ({
      ...f,
      score_configs: f.score_configs.filter((_, i) => i !== idx),
    }))
  }

  const updateScoreConfig = (idx: number, field: string, value: unknown) => {
    setForm(f => ({
      ...f,
      score_configs: f.score_configs.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }))
  }

  const toggleFilterAgent = (agentId: string) => {
    setForm(f => ({
      ...f,
      filter_config: {
        ...f.filter_config,
        agent_ids: f.filter_config.agent_ids.includes(agentId)
          ? f.filter_config.agent_ids.filter(a => a !== agentId)
          : [...f.filter_config.agent_ids, agentId],
      },
    }))
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="green"><Play size={10} className="mr-1" />{an.statusActive}</Badge>
      case 'paused': return <Badge variant="yellow"><Pause size={10} className="mr-1" />{an.statusPaused}</Badge>
      case 'completed': return <Badge variant="blue"><CheckCircle size={10} className="mr-1" />{an.statusCompleted}</Badge>
      default: return <Badge variant="gray">{status}</Badge>
    }
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Tags size={20} /> {an.title}
          </h2>
          <p className="text-xs text-text-tertiary mt-1">{an.desc}</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
          <Plus size={14} className="mr-1" />{an.createQueue}
        </Button>
      </div>

      {/* 队列列表 */}
      {queues.length === 0 ? (
        <EmptyState icon={<Tags size={36} className="text-text-muted" />} title={an.noQueues} description={an.noQueuesHint} />
      ) : (
        <div className="space-y-3">
          {queues.map(q => {
            const progress = q.total_items > 0 ? (q.completed_items / q.total_items) * 100 : 0
            return (
              <div key={q.id} className="card p-4 hover:border-border-light transition-colors group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{q.name}</span>
                    {statusBadge(q.status)}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openWork(q)} className="text-brand-400 hover:text-brand-300" title={an.enterAnnotation}><Eye size={13} /></button>
                    <button onClick={() => openEdit(q)} className="text-text-secondary hover:text-text-primary"><Edit2 size={13} /></button>
                    <button onClick={() => handlePauseResume(q)} className={q.status === 'active' ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}>
                      {q.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    {deleteConfirmId === q.id ? (
                      <span className="flex items-center gap-1">
                        <button onClick={() => handleDelete(q.id)} className="text-[10px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">{an.confirm}</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded">{an.cancel}</button>
                      </span>
                    ) : (
                      <button onClick={() => { setDeleteConfirmId(q.id); setTimeout(() => setDeleteConfirmId(p => p === q.id ? null : p), 3000) }} className="text-red-500 hover:text-red-400"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
                {q.description && <p className="text-xs text-text-tertiary mb-2">{q.description}</p>}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-1">
                    <span>{an.progress}: {q.completed_items} / {q.total_items}</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {q.score_configs.map((sc, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      {sc.name} ({sc.type === 'numeric' ? an.numeric : an.categorical})
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 标注工作台弹窗 */}
      <Modal open={!!workQueueId} onClose={() => { setWorkQueueId(null); setWorkItems([]); setWorkQueue(null) }}>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Tags size={16} /> {an.workbench} {workQueue && <span className="text-text-tertiary font-normal">— {workQueue.name}</span>}
        </h3>
        {workItems.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-8">{an.noItems}</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {workItems.map(item => (
              <div key={item.id} className="bg-surface-0 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-text-muted font-mono">{item.id.slice(0, 8)}</span>
                    <span className="text-xs text-text-secondary">{item.name || 'trace'}</span>
                    <Badge variant="gray">{item.source}</Badge>
                  </div>
                  <button onClick={() => handleComplete(item.id)} className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-400/10 px-2 py-1 rounded">
                    <CheckCircle size={12} /> {an.completeAnnotation}
                  </button>
                </div>
                {item.input && (
                  <div className="mb-1">
                    <span className="text-[10px] text-text-muted uppercase">{an.input}</span>
                    <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{item.input}</div>
                  </div>
                )}
                {item.output && (
                  <div>
                    <span className="text-[10px] text-text-muted uppercase">{an.output}</span>
                    <div className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{item.output}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-text-muted mt-3 text-right">{an.totalCount} {workTotal} {an.countUnit}</div>
      </Modal>

      {/* 创建/编辑弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? an.editLabel : an.createLabel}{an.annotationQueue}</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{an.queueName}</label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{an.description}</label>
            <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">{an.filterAgent} <span className="text-text-muted">（{an.filterAgentHint}）</span></label>
            <div className="flex flex-wrap gap-2">
              {agents.map(a => (
                <button key={a.id} onClick={() => toggleFilterAgent(a.id)} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${form.filter_config.agent_ids.includes(a.id) ? 'bg-brand-600/20 border-brand-500/50 text-brand-300' : 'bg-surface-2 border-border text-text-tertiary hover:border-border-light'}`}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary">{an.scoreDimConfig}</label>
              <button onClick={addScoreConfig} className="text-[11px] text-brand-400 hover:text-brand-300">{an.addDimension}</button>
            </div>
            {form.score_configs.map((sc, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2 bg-surface-0 rounded-lg p-2">
                <input className="flex-1 card rounded px-2 py-1 text-xs text-text-primary outline-none" placeholder={an.dimName} value={sc.name} onChange={e => updateScoreConfig(idx, 'name', e.target.value)} />
                <select className="card rounded px-2 py-1 text-xs text-text-primary outline-none" value={sc.type} onChange={e => updateScoreConfig(idx, 'type', e.target.value)}>
                  <option value="numeric">{an.numeric}</option>
                  <option value="categorical">{an.categorical}</option>
                </select>
                <input className="w-24 card rounded px-2 py-1 text-xs text-text-primary outline-none" placeholder={an.dimDesc} value={sc.description || ''} onChange={e => updateScoreConfig(idx, 'description', e.target.value)} />
                <button onClick={() => removeScoreConfig(idx)} className="text-red-500 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{an.assignees} <span className="text-text-muted">（{an.assigneesHint}）</span></label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" placeholder={an.assigneesPlaceholder} value={form.assignees.join(', ')} onChange={e => setForm({ ...form, assignees: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{an.cancel}</Button>
          <Button onClick={handleSave} disabled={!form.name}>{editId ? an.save : an.create}</Button>
        </div>
      </Modal>
    </div>
  )
}
