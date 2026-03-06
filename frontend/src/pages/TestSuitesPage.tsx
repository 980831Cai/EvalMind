import { useState } from 'react'
import { useI18n } from '../i18n'
import { FileText, Plus, Trash2, Edit2, ChevronDown, ChevronUp, Sparkles, Loader2, GitBranch, History, MessageSquare, MessagesSquare } from 'lucide-react'
import type { TestSuite, TestCase, Agent, ModelConfig, Assertion, ConversationTurn } from '../types'
import { createTestSuite, updateTestSuite, deleteTestSuite, generateTestCases, createTestSuiteVersion, fetchTestSuiteVersions } from '../services/api'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import AssertionEditor from '../components/ui/AssertionEditor'

interface Props {
  suites: TestSuite[]
  agents: Agent[]
  modelConfigs: ModelConfig[]
  onRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const defaultForm = { name: '', description: '', test_cases: [] as TestCase[] }
const defaultGenForm = { agent_id: '', system_prompt: '', count: 10, difficulty: 'mixed', model_config_id: '' }

export default function TestSuitesPage({ suites, agents, modelConfigs, onRefresh, showToast }: Props) {
  const { t } = useI18n()
  const ts = t.testSuites as Record<string, string>
  const [showModal, setShowModal] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [genForm, setGenForm] = useState(defaultGenForm)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Version management
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [versionSuiteId, setVersionSuiteId] = useState<string | null>(null)
  const [versionChangelog, setVersionChangelog] = useState('')
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versionHistory, setVersionHistory] = useState<TestSuite[]>([])
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false)
  const [versionHistorySuiteId, setVersionHistorySuiteId] = useState<string | null>(null)

  const openCreate = () => { setForm(defaultForm); setEditId(null); setShowModal(true) }
  const openEdit = (s: TestSuite) => {
    setForm({ name: s.name, description: s.description || '', test_cases: s.test_cases || [] })
    setEditId(s.id); setShowModal(true)
  }

  const [expandedCaseIdx, setExpandedCaseIdx] = useState<number | null>(null)

  const addCase = (type: 'single' | 'multi_turn' = 'single') => {
    if (type === 'multi_turn') {
      setForm({
        ...form,
        test_cases: [...form.test_cases, {
          id: '',
          input: '',
          expected_output: '',
          type: 'multi_turn',
          turns: [{ user_message: '' }],
        }],
      })
    } else {
      setForm({ ...form, test_cases: [...form.test_cases, { id: '', input: '', expected_output: '' }] })
    }
  }
  const removeCase = (i: number) => setForm({ ...form, test_cases: form.test_cases.filter((_, idx) => idx !== i) })
  const updateCase = (i: number, field: string, val: unknown) => {
    const c = [...form.test_cases]; c[i] = { ...c[i], [field]: val }; setForm({ ...form, test_cases: c })
  }
  const updateCaseAssertions = (i: number, assertions: Assertion[]) => {
    const c = [...form.test_cases]; c[i] = { ...c[i], assertions }; setForm({ ...form, test_cases: c })
  }

  // 多轮对话 helpers
  const addTurn = (caseIdx: number) => {
    const c = [...form.test_cases]
    const turns = [...(c[caseIdx].turns || [])]
    turns.push({ user_message: '' })
    c[caseIdx] = { ...c[caseIdx], turns }
    setForm({ ...form, test_cases: c })
  }
  const removeTurn = (caseIdx: number, turnIdx: number) => {
    const c = [...form.test_cases]
    const turns = (c[caseIdx].turns || []).filter((_, i) => i !== turnIdx)
    c[caseIdx] = { ...c[caseIdx], turns }
    setForm({ ...form, test_cases: c })
  }
  const updateTurn = (caseIdx: number, turnIdx: number, field: keyof ConversationTurn, val: unknown) => {
    const c = [...form.test_cases]
    const turns = [...(c[caseIdx].turns || [])]
    turns[turnIdx] = { ...turns[turnIdx], [field]: val }
    c[caseIdx] = { ...c[caseIdx], turns }
    setForm({ ...form, test_cases: c })
  }
  const toggleCaseType = (i: number) => {
    const c = [...form.test_cases]
    const current = c[i].type || 'single'
    if (current === 'single') {
      c[i] = {
        ...c[i],
        type: 'multi_turn',
        turns: [{ user_message: c[i].input || '', expected_response: c[i].expected_output || '' }],
      }
    } else {
      const firstTurn = c[i].turns?.[0]
      c[i] = {
        ...c[i],
        type: 'single',
        input: firstTurn?.user_message || c[i].input || '',
        expected_output: firstTurn?.expected_response || c[i].expected_output || '',
        turns: undefined,
      }
    }
    setForm({ ...form, test_cases: c })
  }

  const handleSave = async () => {
    try {
      const payload = { name: form.name, description: form.description, test_cases: form.test_cases, source: 'manual' }
      if (editId) await updateTestSuite(editId, payload)
      else await createTestSuite(payload)
      showToast(editId ? ts.updated : ts.created); setShowModal(false); onRefresh()
    } catch (e: unknown) {
      showToast(`${ts.saveFailed}: ${e instanceof Error ? e.message : ts.unknownError}`, 'error')
    }
  }

  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmDelId !== id) { setConfirmDelId(id); setTimeout(() => setConfirmDelId(p => p === id ? null : p), 3000); return }
    try {
      await deleteTestSuite(id); showToast(ts.deleted); setConfirmDelId(null); onRefresh()
    } catch (e: unknown) {
      showToast(`${ts.deleteFailed}: ${e instanceof Error ? e.message : ts.unknownError}`, 'error'); setConfirmDelId(null)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const payload: Record<string, unknown> = { count: genForm.count, difficulty: genForm.difficulty }
      if (genForm.agent_id) payload.agent_id = genForm.agent_id
      if (genForm.system_prompt) payload.system_prompt = genForm.system_prompt
      if (genForm.model_config_id) payload.model_config_id = genForm.model_config_id
      await generateTestCases(payload)
      showToast(ts.generateSuccess); setShowGenModal(false); onRefresh()
    } catch (e) {
      showToast(`${ts.generateFailed}: ${e}`, 'error')
    } finally { setGenerating(false) }
  }

  const handleCreateVersion = async () => {
    if (!versionSuiteId) return
    try {
      await createTestSuiteVersion(versionSuiteId, { changelog: versionChangelog || undefined })
      showToast(ts.versionCreated); setShowVersionModal(false); setVersionChangelog(''); onRefresh()
    } catch (e: unknown) {
      showToast(`${ts.versionCreateFailed}: ${e instanceof Error ? e.message : ts.unknownError}`, 'error')
    }
  }

  const handleViewVersionHistory = async (suiteId: string) => {
    setVersionHistorySuiteId(suiteId)
    setShowVersionHistory(true)
    setVersionHistoryLoading(true)
    try {
      const versions = await fetchTestSuiteVersions(suiteId)
      setVersionHistory(versions)
    } catch (e: unknown) {
      showToast(`${ts.loadVersionFailed}: ${e instanceof Error ? e.message : ts.unknownError}`, 'error')
      setVersionHistory([])
    }
    setVersionHistoryLoading(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><FileText size={20} /> {ts.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{ts.desc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { setGenForm(defaultGenForm); setShowGenModal(true) }}>
            <Sparkles size={14} className="mr-1 text-amber-400" />{ts.llmGenerate}
          </Button>
          <Button onClick={openCreate}><Plus size={14} className="mr-1" />{ts.newSuite}</Button>
        </div>
      </div>

      {suites.length === 0 ? (
        <EmptyState icon={<FileText size={36} className="text-text-muted" />} title={ts.noSuites} description={ts.noSuitesHint} />
      ) : (
        <div className="space-y-3">
          {suites.map(s => (
            <div key={s.id} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-3/30 transition-colors" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{s.name}</span>
                      <Badge variant="blue">v{s.version}</Badge>
                      <Badge variant={s.source === 'generated' ? 'purple' : 'gray'}>{s.source === 'generated' ? ts.aiGenerated : ts.manual}</Badge>
                      <span className="text-[11px] text-text-tertiary">{s.case_count} {ts.caseCountUnit}</span>
                      {s.parent_id && <span className="text-[10px] text-text-muted">{ts.derivedVersion}</span>}
                    </div>
                    {s.description && <div className="text-xs text-text-tertiary mt-0.5">{s.description}</div>}
                    {s.changelog && <div className="text-[10px] text-text-muted mt-0.5">{ts.changelog}: {s.changelog}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); setVersionSuiteId(s.id); setVersionChangelog(''); setShowVersionModal(true) }} className="text-[11px] text-text-secondary hover:text-brand-300 flex items-center gap-1" title={ts.createNewVersion}><GitBranch size={12} /> {ts.newVersion}</button>
                  <button onClick={e => { e.stopPropagation(); handleViewVersionHistory(s.parent_id || s.id) }} className="text-[11px] text-text-secondary hover:text-cyan-300 flex items-center gap-1" title={ts.versionHistory}><History size={12} /> {ts.history}</button>
                  <button onClick={e => { e.stopPropagation(); openEdit(s) }} className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"><Edit2 size={12} /> {ts.edit}</button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(s.id) }} className={`text-[11px] flex items-center gap-1 transition-colors ${confirmDelId === s.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded' : 'text-red-500 hover:text-red-400'}`}><Trash2 size={12} /> {confirmDelId === s.id ? ts.confirmDeleteQuestion : ts.delete}</button>
                  {expandedId === s.id ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                </div>
              </div>
              {expandedId === s.id && s.test_cases && (
                <div className="divider px-4 py-3">
                  <table className="w-full text-left">
                    <thead><tr className="text-[11px] text-text-tertiary uppercase">
                      <th className="pb-2 pr-3 w-10">#</th><th className="pb-2 pr-3 w-16">{ts.tableType}</th><th className="pb-2 pr-3">{ts.tableInput}</th><th className="pb-2">{ts.tableExpectedOutput}</th>
                    </tr></thead>
                    <tbody>
                      {s.test_cases.map((tc, i) => (
                        <tr key={tc.id || i} className="divider/50">
                          <td className="py-2 pr-3 text-[11px] text-text-muted">{i + 1}</td>
                          <td className="py-2 pr-3">
                            {tc.type === 'multi_turn' ? (
                              <span className="text-[10px] bg-purple-950/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/30">{tc.turns?.length || 0} {ts.turnsCount}</span>
                            ) : (
                              <span className="text-[10px] text-text-muted">{ts.singleTurn}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-text-secondary max-w-[300px]">
                            <div className="line-clamp-2">
                              {tc.type === 'multi_turn' ? (tc.turns?.[0]?.user_message || '-') : tc.input}
                            </div>
                          </td>
                          <td className="py-2 text-xs text-text-tertiary max-w-[300px]">
                            <div className="line-clamp-2">
                              {tc.type === 'multi_turn' ? (tc.turns?.[0]?.expected_response || '-') : (tc.expected_output || '-')}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 手动创建/编辑弹窗 */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? ts.editSuiteTitle : ts.newSuiteTitle}{ts.suiteLabel}</h3>
        <div className="grid gap-3.5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ts.nameLabel}</label><input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-text-secondary mb-1 block">{ts.descLabel}</label><input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text-secondary">{ts.testCases}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => addCase('multi_turn')} className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"><MessagesSquare size={12} /> {ts.addMultiTurnCase}</button>
                <button onClick={() => addCase('single')} className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"><Plus size={12} /> {ts.addCase}</button>
              </div>
            </div>
            {form.test_cases.map((tc, i) => {
              const isMultiTurn = tc.type === 'multi_turn'
              return (
              <div key={i} className="mb-3 bg-surface-0 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-tertiary">#{i + 1}</span>
                    <button
                      onClick={() => toggleCaseType(i)}
                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                        isMultiTurn
                          ? 'bg-purple-950/50 text-purple-300 border border-purple-800/50'
                          : 'bg-surface-3 text-text-secondary border border-border-light/50'
                      }`}
                    >
                      {isMultiTurn ? <><MessagesSquare size={10} /> {ts.multiTurn}</> : <><MessageSquare size={10} /> {ts.singleTurn}</>}
                    </button>
                  </div>
                  <button onClick={() => removeCase(i)} className="text-red-500 hover:text-red-400 px-1"><Trash2 size={14} /></button>
                </div>

                {isMultiTurn ? (
                  /* ===== 多轮对话编辑器 ===== */
                  <div className="space-y-2">
                    {(tc.turns || []).map((turn, ti) => (
                      <div key={ti} className="bg-surface-2/50 border border-border/50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-text-tertiary font-medium">{ts.turnIndex} {ti + 1}</span>
                          {(tc.turns || []).length > 1 && (
                            <button onClick={() => removeTurn(i, ti)} className="text-red-500/60 hover:text-red-400 text-[10px]"><Trash2 size={11} /></button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-0.5 block">{ts.userMessage}</label>
                            <textarea
                              rows={2}
                              className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[12px] outline-none focus:border-brand-500 placeholder:text-text-muted resize-y"
                              placeholder={ts.userMessagePlaceholder}
                              value={turn.user_message}
                              onChange={e => updateTurn(i, ti, 'user_message', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-0.5 block">{ts.expectedReply}</label>
                            <textarea
                              rows={2}
                              className="w-full card rounded-lg px-2.5 py-1.5 text-text-primary text-[12px] outline-none focus:border-brand-500 placeholder:text-text-muted resize-y"
                              placeholder={ts.expectedReplyPlaceholder}
                              value={turn.expected_response || ''}
                              onChange={e => updateTurn(i, ti, 'expected_response', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => addTurn(i)}
                      className="w-full text-[11px] text-purple-400 hover:text-purple-300 border border-dashed border-purple-800/40 rounded-lg py-1.5 flex items-center justify-center gap-1 hover:bg-purple-950/20 transition-colors"
                    >
                      <Plus size={11} /> {ts.addTurn}
                    </button>
                  </div>
                ) : (
                  /* ===== 单轮用例编辑器（原逻辑） ===== */
                  <>
                    <div className="flex gap-2 mb-1">
                      <input className="flex-1 card rounded-lg px-3 py-1.5 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={ts.userInput} value={tc.input} onChange={e => updateCase(i, 'input', e.target.value)} />
                      <input className="flex-1 card rounded-lg px-3 py-1.5 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={ts.expectedOutputOptional} value={tc.expected_output || ''} onChange={e => updateCase(i, 'expected_output', e.target.value)} />
                    </div>
                  </>
                )}

                <button onClick={() => setExpandedCaseIdx(expandedCaseIdx === i ? null : i)} className="text-[10px] text-text-tertiary hover:text-text-secondary flex items-center gap-1 mt-1">
                  {expandedCaseIdx === i ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {ts.assertionRules} {tc.assertions && tc.assertions.length > 0 ? `(${tc.assertions.length})` : ''}
                </button>
                {expandedCaseIdx === i && (
                  <div className="mt-2">
                    <AssertionEditor assertions={tc.assertions || []} onChange={a => updateCaseAssertions(i, a)} compact />
                  </div>
                )}
              </div>
            )})}
            {form.test_cases.length === 0 && <p className="text-xs text-text-muted text-center py-4">{ts.noCases}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{ts.cancel}</Button>
          <Button onClick={handleSave}>{editId ? ts.save : ts.create}</Button>
        </div>
      </Modal>

      {/* LLM 智能生成弹窗 */}
      <Modal open={showGenModal} onClose={() => setShowGenModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><Sparkles size={16} className="text-amber-400" /> {ts.llmGenerateTitle}</h3>
        <p className="text-xs text-text-tertiary mb-4">{ts.llmGenerateDesc}</p>
        <div className="grid gap-3.5">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ts.selectAgentOptional}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={genForm.agent_id} onChange={e => setGenForm({ ...genForm, agent_id: e.target.value })}>
              <option value="">{ts.manualInputInfo}</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.skills?.length || 0} skills)</option>)}
            </select>
          </div>
          {!genForm.agent_id && (
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">System Prompt</label>
              <textarea rows={4} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted resize-y" placeholder="输入 Agent 的系统提示词..." value={genForm.system_prompt} onChange={e => setGenForm({ ...genForm, system_prompt: e.target.value })} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{ts.generationLLM}</label>
            <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={genForm.model_config_id} onChange={e => setGenForm({ ...genForm, model_config_id: e.target.value })}>
              <option value="">{ts.useActiveModel}</option>
              {modelConfigs.map(c => <option key={c.id} value={c.id}>{c.name} ({c.provider}/{c.model_name}){c.is_active ? ` ✓ ${ts.activeLabel}` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{ts.generateCount}</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={genForm.count} onChange={e => setGenForm({ ...genForm, count: parseInt(e.target.value) })}>
                {[5, 10, 20, 30, 50].map(n => <option key={n} value={n}>{n} {ts.countUnit}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{ts.difficultyPreference}</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={genForm.difficulty} onChange={e => setGenForm({ ...genForm, difficulty: e.target.value })}>
                <option value="mixed">{ts.difficultyMixed}</option><option value="easy">{ts.difficultyEasy}</option><option value="medium">{ts.difficultyMedium}</option><option value="hard">{ts.difficultyHard}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowGenModal(false)}>{ts.cancel}</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <><Loader2 size={14} className="animate-spin mr-1" />{ts.generating}</> : ts.startGenerate}
          </Button>
        </div>
      </Modal>

      {/* 创建新版本弹窗 */}
      <Modal open={showVersionModal} onClose={() => setShowVersionModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><GitBranch size={16} className="text-brand-400" /> {ts.createNewVersion}</h3>
        <p className="text-xs text-text-tertiary mb-4">{ts.createVersionDesc}</p>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">{ts.changelogOptional}</label>
          <textarea rows={3} className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted resize-y" placeholder={ts.changelogPlaceholder} value={versionChangelog} onChange={e => setVersionChangelog(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setShowVersionModal(false)}>{ts.cancel}</Button>
          <Button onClick={handleCreateVersion}>{ts.createVersion}</Button>
        </div>
      </Modal>

      {/* 版本历史弹窗 */}
      <Modal open={showVersionHistory} onClose={() => setShowVersionHistory(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><History size={16} className="text-cyan-400" /> {ts.versionHistory}</h3>
        {versionHistoryLoading ? (
          <div className="text-xs text-text-tertiary text-center py-6"><Loader2 size={16} className="animate-spin inline mr-1" />{ts.loading}</div>
        ) : versionHistory.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-6">{ts.noVersionHistory}</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {versionHistory.map(v => (
              <div key={v.id} className="card rounded-lg px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{v.name}</span>
                    <Badge variant="blue">v{v.version}</Badge>
                    <span className="text-[11px] text-text-tertiary">{v.case_count} {ts.caseCountUnit}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">{new Date(v.created_at).toLocaleString('zh-CN')}</span>
                </div>
                {v.changelog && <p className="text-xs text-text-secondary mt-0.5">{v.changelog}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
