import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'
import { Bug, Plus, Trash2, Edit2, Download, Filter, Tag, Dna } from 'lucide-react'
import type { BadCase, BadCaseStats, Agent, TestSuite } from '../types'
import * as api from '../services/api'
import { formatTime } from '../utils/helpers'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import AssertionEditor from '../components/ui/AssertionEditor'
import type { Assertion } from '../types'

interface Props {
  agents: Agent[]
  suites: TestSuite[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const STATUS_COLORS: Record<string, string> = { open: 'red', investigating: 'yellow', resolved: 'green', exported: 'purple' }

export default function BadCasePage({ agents, suites, showToast }: Props) {
  const { t } = useI18n()
  const bc = t.badCase as Record<string, string>
  const STATUS_LABELS: Record<string, string> = { open: bc.statusOpen, investigating: bc.statusInvestigating, resolved: bc.statusResolved, exported: bc.statusExported }
  const SOURCE_LABELS: Record<string, string> = { eval_result: bc.sourceEvalResult, manual: bc.sourceManual, regression: bc.sourceRegression }
  const [badCases, setBadCases] = useState<BadCase[]>([])
  const [stats, setStats] = useState<BadCaseStats | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [exportSuiteId, setExportSuiteId] = useState('')
  const [detail, setDetail] = useState<BadCase | null>(null)

  const [form, setForm] = useState({
    agent_id: '', input: '', expected_output: '', actual_output: '',
    assertions: [] as Assertion[], tags: [] as string[], root_cause: '', status: 'open',
  })
  const [tagInput, setTagInput] = useState('')

  const load = async () => {
    try {
      const params: Record<string, string> = {}
      if (filterStatus) params.status = filterStatus
      if (filterAgent) params.agent_id = filterAgent
      if (filterSource) params.source = filterSource
      const [cases, st] = await Promise.all([api.fetchBadCases(params), api.fetchBadCaseStats()])
      setBadCases(cases)
      setStats(st)
    } catch (e: unknown) {
      showToast(`${bc.loadFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error')
    }
  }

  useEffect(() => { load() }, [filterStatus, filterAgent, filterSource])

  const openCreate = () => {
    setForm({ agent_id: '', input: '', expected_output: '', actual_output: '', assertions: [], tags: [], root_cause: '', status: 'open' })
    setEditId(null)
    setShowModal(true)
  }

  const openEdit = (bc: BadCase) => {
    setForm({
      agent_id: bc.agent_id, input: bc.input, expected_output: bc.expected_output || '',
      actual_output: bc.actual_output || '', assertions: bc.assertions || [],
      tags: bc.tags || [], root_cause: bc.root_cause || '', status: bc.status,
    })
    setEditId(bc.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const payload = {
        agent_id: form.agent_id, input: form.input,
        expected_output: form.expected_output || undefined,
        actual_output: form.actual_output || undefined,
        assertions: form.assertions.length > 0 ? form.assertions : undefined,
        tags: form.tags.length > 0 ? form.tags : undefined,
        root_cause: form.root_cause || undefined,
        status: form.status,
      }
      if (editId) await api.updateBadCase(editId, payload)
      else await api.createBadCase(payload)
      showToast(editId ? bc.updated : bc.created)
      setShowModal(false)
      load()
    } catch (e: unknown) {
      showToast(`${bc.saveFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error')
    }
  }

  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmDelId !== id) { setConfirmDelId(id); setTimeout(() => setConfirmDelId(p => p === id ? null : p), 3000); return }
    try {
      await api.deleteBadCase(id)
      showToast(bc.deleted); setConfirmDelId(null)
      load()
    } catch (e: unknown) {
      showToast(`${bc.deleteFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error'); setConfirmDelId(null)
    }
  }

  const handleExport = async () => {
    if (selectedIds.length === 0 || !exportSuiteId) return
    try {
      const result = await api.exportBadCases({ bad_case_ids: selectedIds, test_suite_id: exportSuiteId })
      showToast(bc.exported.replace('{count}', String(result.exported_count)))
      setShowExportModal(false)
      setSelectedIds([])
      load()
    } catch (e: unknown) {
      showToast(`${bc.exportFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error')
    }
  }

  const handleDistill = async (bcId: string) => {
    try {
      await api.distillGene(bcId)
      showToast(bc.distilled)
      load()
    } catch (e: unknown) {
      showToast(`${bc.distillFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error')
    }
  }

  const handleBatchDistill = async () => {
    if (selectedIds.length === 0) return
    try {
      const result = await api.batchDistillGenes({ bad_case_ids: selectedIds, merge_similar: true })
      showToast(bc.batchDistilled.replace('{count}', String(result.count)))
      setSelectedIds([])
      load()
    } catch (e: unknown) {
      showToast(`${bc.batchDistillFailed}: ${e instanceof Error ? e.message : bc.unknownError}`, 'error')
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...form.tags, tagInput.trim()] })
      setTagInput('')
    }
  }

  const removeTag = (t: string) => setForm({ ...form, tags: form.tags.filter(x => x !== t) })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Bug size={20} /> {bc.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{bc.desc}</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button variant="ghost" onClick={() => setShowExportModal(true)}>
                <Download size={14} className="mr-1" />{bc.exportToSuite} ({selectedIds.length})
              </Button>
              <Button variant="ghost" onClick={handleBatchDistill}>
                <Dna size={14} className="mr-1" />{bc.distillStrategy} ({selectedIds.length})
              </Button>
            </>
          )}
          <Button onClick={openCreate} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
            <Plus size={14} className="mr-1" />{bc.createLabel}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: bc.statusOpen, value: stats.open, color: '#ef4444' },
            { label: bc.statusInvestigating, value: stats.investigating, color: '#f59e0b' },
            { label: bc.statusResolved, value: stats.resolved, color: '#22c55e' },
            { label: bc.statusExported, value: stats.exported, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} className="card rounded-lg p-4">
              <div className="text-[11px] text-text-tertiary mb-1">{s.label}</div>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-text-tertiary" />
        <select className="card rounded-lg px-2.5 py-1.5 text-text-secondary text-[12px] outline-none focus:border-brand-500" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{bc.allStatus}</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="card rounded-lg px-2.5 py-1.5 text-text-secondary text-[12px] outline-none focus:border-brand-500" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          <option value="">{bc.allAgent}</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="card rounded-lg px-2.5 py-1.5 text-text-secondary text-[12px] outline-none focus:border-brand-500" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="">{bc.allSource}</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* List */}
      {badCases.length === 0 ? (
        <EmptyState icon={<Bug size={36} className="text-text-muted" />} title={bc.noBadCases} description={bc.noBadCasesHint} />
      ) : (
        <div className="space-y-2">
          {badCases.map(item => {
            const statusColor = STATUS_COLORS[item.status] || 'gray'
            return (
              <div key={item.id} className="flex items-start gap-3 card rounded-lg px-4 py-3 hover:border-border-light transition-colors group">
                <div className="pt-1">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="accent-brand-500" />
                </div>
                <div className={`w-1 self-stretch rounded-full ${item.status === 'open' ? 'bg-red-500' : item.status === 'investigating' ? 'bg-amber-500' : item.status === 'resolved' ? 'bg-emerald-500' : 'bg-violet-500'}`} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetail(item)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-text-primary line-clamp-1">{item.input}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusColor as 'red' | 'yellow' | 'green' | 'purple' | 'gray'}>{STATUS_LABELS[item.status] || item.status}</Badge>
                    <Badge variant="gray">{SOURCE_LABELS[item.source] || item.source}</Badge>
                    {item.tags?.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">{t}</span>
                    ))}
                    <span className="text-[10px] text-text-muted">{formatTime(item.created_at)}</span>
                  </div>
                  {item.root_cause && <p className="text-xs text-text-tertiary mt-1 line-clamp-1">{item.root_cause}</p>}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => handleDistill(item.id)} className="text-brand-400 hover:text-brand-300" title={bc.distillToGene}><Dna size={13} /></button>
                  <button onClick={() => openEdit(item)} className="text-text-secondary hover:text-text-primary"><Edit2 size={13} /></button>
                  <button onClick={() => handleDelete(item.id)} className={`flex items-center gap-0.5 transition-colors ${confirmDelId === item.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded' : 'text-red-500 hover:text-red-400'}`}><Trash2 size={13} />{confirmDelId === item.id && <span className="text-[10px]">{bc.confirmQuestion}</span>}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">{bc.detailTitle}</h3>
              <Badge variant={STATUS_COLORS[detail.status] as 'red' | 'yellow' | 'green' | 'purple' | 'gray'}>{STATUS_LABELS[detail.status]}</Badge>
            </div>
            <div className="grid gap-3">
              <div><label className="text-[11px] text-text-tertiary uppercase">{bc.userInput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detail.input}</div></div>
              {detail.expected_output && <div><label className="text-[11px] text-text-tertiary uppercase">{bc.expectedOutput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detail.expected_output}</div></div>}
              {detail.actual_output && <div><label className="text-[11px] text-text-tertiary uppercase">{bc.actualOutput}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap max-h-[200px] overflow-y-auto">{detail.actual_output}</div></div>}
              {detail.assertions && detail.assertions.length > 0 && (
                <div>
                  <label className="text-[11px] text-text-tertiary uppercase mb-1 block">{bc.assertionRules}</label>
                  <AssertionEditor assertions={detail.assertions} onChange={() => {}} compact />
                </div>
              )}
              {detail.root_cause && <div><label className="text-[11px] text-text-tertiary uppercase">{bc.rootCause}</label><div className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detail.root_cause}</div></div>}
              {detail.tags && detail.tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-text-tertiary" />
                  {detail.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">{t}</span>)}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? bc.editBadCase : bc.createBadCase} {bc.badCaseLabel}</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.relatedAgent}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}>
              <option value="">{bc.pleaseSelect}</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.userInputLabel}</label>
            <textarea rows={3} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.input} onChange={e => setForm({ ...form, input: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.expectedOutputLabel}</label>
              <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.expected_output} onChange={e => setForm({ ...form, expected_output: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.actualOutputLabel}</label>
              <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.actual_output} onChange={e => setForm({ ...form, actual_output: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.assertionRulesLabel}</label>
            <AssertionEditor assertions={form.assertions} onChange={a => setForm({ ...form, assertions: a })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.rootCauseLabel}</label>
            <textarea rows={2} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 resize-y" value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.statusLabel}</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.tagsLabel}</label>
              <div className="flex gap-1 flex-wrap mb-1">
                {form.tags.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary flex items-center gap-1">
                    {t} <button onClick={() => removeTag(t)} className="text-text-tertiary hover:text-text-secondary">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input className="flex-1 card rounded-lg px-3 py-1.5 text-text-primary text-[12px] outline-none focus:border-brand-500" placeholder={bc.tagInputPlaceholder} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
                <button onClick={addTag} className="text-[11px] text-brand-400 hover:text-brand-300 px-2">+</button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{bc.cancel}</Button>
          <Button onClick={handleSave} disabled={!form.agent_id || !form.input}>{editId ? bc.save : bc.create}</Button>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{bc.exportTitle}</h3>
        <p className="text-xs text-text-tertiary mb-3">{bc.exportDesc.replace('{count}', String(selectedIds.length))}</p>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">{bc.selectSuite}</label>
          <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={exportSuiteId} onChange={e => setExportSuiteId(e.target.value)}>
            <option value="">{bc.pleaseSelect}</option>
            {suites.map(s => <option key={s.id} value={s.id}>{s.name} v{s.version} ({s.case_count} {bc.caseCountUnit})</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowExportModal(false)}>{bc.cancel}</Button>
          <Button onClick={handleExport} disabled={!exportSuiteId}>{bc.export}</Button>
        </div>
      </Modal>
    </div>
  )
}
