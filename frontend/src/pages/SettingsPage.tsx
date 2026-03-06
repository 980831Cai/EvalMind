import { useState } from 'react'
import { Settings, Plus, Zap, Trash2, Edit2, Power, Loader2, Sparkles } from 'lucide-react'
import type { ModelConfig } from '../types'
import { createModelConfig, updateModelConfig, deleteModelConfig, testModelConfig, toggleModelConfig } from '../services/api'
import { useI18n } from '../i18n'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import PasswordInput from '../components/ui/PasswordInput'

interface Props {
  configs: ModelConfig[]
  onRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const PROVIDERS = ['openai', 'deepseek', 'anthropic', 'ollama', 'custom']

const defaultForm = { name: '', provider: 'openai', model_name: '', base_url: '', api_key: '', temperature: 0.3, max_tokens: 2048, top_p: 1.0 }

const PRESET_MODELS = [
  { name: 'Kimi-K2.5', provider: 'openai', model_name: 'Kimi-K2.5', base_url: 'https://api.haihub.cn/v1', api_key: '', temperature: 0.3, max_tokens: 2048, top_p: 1.0, color: '#6366f1' },
  { name: 'DeepSeek-V3.1', provider: 'openai', model_name: 'DeepSeek-V3.1', base_url: 'https://api.haihub.cn/v1', api_key: '', temperature: 0.3, max_tokens: 2048, top_p: 1.0, color: '#06b6d4' },
  { name: 'Qwen3-32B-FP8', provider: 'openai', model_name: 'Qwen3-32B-FP8', base_url: 'https://api.haihub.cn/v1', api_key: '', temperature: 0.3, max_tokens: 2048, top_p: 1.0, color: '#f59e0b' },
]

export default function SettingsPage({ configs, onRefresh, showToast }: Props) {
  const { t } = useI18n()
  const st = t.settings as Record<string, string>
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; latency_ms: number; error?: string } | null>(null)
  const [presetCreating, setPresetCreating] = useState<string | null>(null)

  const openCreate = () => { setForm(defaultForm); setEditId(null); setShowModal(true) }

  const handlePresetCreate = async (preset: typeof PRESET_MODELS[0]) => {
    const exists = configs.some(c => c.model_name === preset.model_name)
    if (exists) {
      showToast(st.modelExists.replace('{name}', preset.name), 'error')
      return
    }
    setPresetCreating(preset.name)
    try {
      const { color: _, ...payload } = preset
      await createModelConfig(payload)
      showToast(st.modelCreated.replace('{name}', preset.name), 'success')
    } catch (e: unknown) {
      showToast(`${st.createFailed}: ${e instanceof Error ? e.message : st.unknownError}`, 'error')
    } finally {
      setPresetCreating(null)
    }
  }
  const openEdit = (c: ModelConfig) => {
    setForm({ name: c.name, provider: c.provider, model_name: c.model_name, base_url: c.base_url, api_key: '', temperature: c.temperature ?? 0.3, max_tokens: c.max_tokens ?? 2048, top_p: c.top_p ?? 1.0 })
    setEditId(c.id); setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const payload = { ...form }
      if (editId && !payload.api_key) delete (payload as Record<string, unknown>).api_key
      if (editId) await updateModelConfig(editId, payload)
      else await createModelConfig(payload)
      showToast(editId ? st.updated : st.created, 'success'); setShowModal(false); onRefresh()
    } catch (e: unknown) {
      showToast(`${st.operationFailed}: ${e instanceof Error ? e.message : st.unknownError}`, 'error')
    }
  }

  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmDelId !== id) { setConfirmDelId(id); setTimeout(() => setConfirmDelId(p => p === id ? null : p), 3000); return }
    try {
      await deleteModelConfig(id); showToast(st.deleted); setConfirmDelId(null); onRefresh()
    } catch (e: unknown) {
      showToast(`${st.deleteFailed}: ${e instanceof Error ? e.message : st.unknownError}`, 'error'); setConfirmDelId(null)
    }
  }

  const handleTest = async (id: string) => {
    setTesting(id); setTestResult(null)
    try {
      const res = await testModelConfig(id)
      setTestResult({ id, success: res.success, latency_ms: res.latency_ms, error: res.error })
      onRefresh()
    } catch (e: unknown) {
      showToast(`${st.testFailed}: ${e instanceof Error ? e.message : st.unknownError}`, 'error')
    } finally {
      setTesting(null)
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleModelConfig(id); onRefresh()
    } catch (e: unknown) {
      showToast(`${st.operationFailed}: ${e instanceof Error ? e.message : st.unknownError}`, 'error')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Settings size={20} /> {st.title}</h2>
          <p className="text-xs text-text-tertiary mt-1">{st.desc}</p>
        </div>
        <Button onClick={openCreate}><Plus size={14} className="mr-1" />{st.createConfig}</Button>
      </div>

      {/* Preset Quick Create */}
      <div className="mb-5 card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-text-secondary">{st.presetModels}</span>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {PRESET_MODELS.map(preset => {
            const exists = configs.some(c => c.model_name === preset.model_name)
            return (
              <button
                key={preset.name}
                onClick={() => handlePresetCreate(preset)}
                disabled={exists || presetCreating === preset.name}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg border transition-all text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02]"
                style={{
                  borderColor: exists ? '#3f3f46' : preset.color + '40',
                  background: exists ? '#18181b' : preset.color + '10',
                  color: exists ? '#71717a' : preset.color,
                }}
              >
                {presetCreating === preset.name ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {preset.name}
                {exists && <span className="text-[10px] text-text-muted">({st.added})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {configs.length === 0 ? (
        <EmptyState icon={<Settings size={36} className="text-text-muted" />} title={st.noConfigs} description={st.noConfigsHint} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map(c => (
            <div key={c.id} className={`bg-surface-2 border rounded-[10px] p-4 relative transition-all ${c.is_active ? 'border-brand-500/50' : 'border-border'}`}>
              {c.is_active && <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-brand-500 rounded-r" />}
              <div className="flex items-start justify-between mb-3">
                <div className="pl-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{c.name}</span>
                    <Badge variant={c.is_active ? 'green' : 'gray'}>{c.is_active ? st.active : st.inactive}</Badge>
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">{c.provider} / {c.model_name}</div>
                </div>
                <button onClick={() => handleToggle(c.id)} className={`p-1.5 rounded-md transition-colors ${c.is_active ? 'text-green-400 hover:bg-green-900/30' : 'text-text-muted hover:bg-surface-3'}`} title={c.is_active ? st.inactive : st.active}>
                  <Power size={15} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-[11px] pl-2">
                <div><span className="text-text-muted">API URL</span><div className="text-text-secondary truncate">{c.base_url}</div></div>
                <div><span className="text-text-muted">{st.apiKey}</span><div className="text-text-secondary">{c.api_key}</div></div>
                <div><span className="text-text-muted">{st.temperature}</span><div className="text-text-secondary">{c.temperature ?? '-'}</div></div>
                <div><span className="text-text-muted">{st.maxTokens}</span><div className="text-text-secondary">{c.max_tokens ?? '-'}</div></div>
              </div>

              {testResult?.id === c.id && (
                <div className={`text-[11px] px-2 py-1.5 rounded-md mb-2 ${testResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {testResult.success ? `✓ ${st.connectSuccess} (${testResult.latency_ms}ms)` : `✗ ${st.connectFailed}: ${testResult.error}`}
                </div>
              )}
              {c.test_status && (!testResult || testResult.id !== c.id) && (
                <div className={`text-[11px] px-2 py-1.5 rounded-md mb-2 ${c.test_status === 'success' ? 'bg-green-900/20 text-green-500' : 'bg-red-900/20 text-red-500'}`}>
                  {st.lastTest}: {c.test_status === 'success' ? st.lastTestSuccess : st.lastTestFailed}
                </div>
              )}

              <div className="flex items-center gap-2 pl-2">
                <button onClick={() => handleTest(c.id)} disabled={testing === c.id} className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50">
                  {testing === c.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} {st.testConnection}
                </button>
                <button onClick={() => openEdit(c)} className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"><Edit2 size={12} /> {st.edit}</button>
                <button onClick={() => handleDelete(c.id)} className={`text-[11px] flex items-center gap-1 transition-colors ${confirmDelId === c.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded' : 'text-red-500 hover:text-red-400'}`}><Trash2 size={12} /> {confirmDelId === c.id ? st.confirmDelete : st.delete}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">{editId ? st.editConfig : st.newConfig} {st.modelConfigTitle}</h3>
        <div className="grid gap-3.5">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{st.configName}</label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={st.configNamePlaceholder} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{st.provider}</label>
              <select className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{st.modelName}</label>
              <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={st.modelNamePlaceholder} value={form.model_name} onChange={e => setForm({ ...form, model_name: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{st.baseUrl}</label>
            <input className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={st.baseUrlPlaceholder} value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">{st.apiKey} {editId && <span className="text-text-muted">({st.apiKeyHint})</span>}</label>
            <PasswordInput placeholder={st.apiKeyPlaceholder} value={form.api_key} onChange={v => setForm({ ...form, api_key: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{st.temperature}</label>
              <input type="number" step="0.1" min="0" max="2" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.temperature} onChange={e => { const v = parseFloat(e.target.value); setForm({ ...form, temperature: isNaN(v) ? 0 : v }) }} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{st.maxTokens}</label>
              <input type="number" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.max_tokens} onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, max_tokens: isNaN(v) ? 0 : v }) }} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">{st.topP}</label>
              <input type="number" step="0.1" min="0" max="1" className="w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={form.top_p} onChange={e => { const v = parseFloat(e.target.value); setForm({ ...form, top_p: isNaN(v) ? 0 : v }) }} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowModal(false)}>{st.cancel}</Button>
          <Button onClick={handleSave}>{editId ? st.save : st.create}</Button>
        </div>
      </Modal>
    </div>
  )
}
