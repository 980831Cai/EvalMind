import { useState, useCallback, useRef, useEffect } from 'react'
import type { Agent, ModelConfig } from '../types'
import * as api from '../services/api'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Play, Plus, Trash2, Send, Loader2, Settings2, MessageSquare, GitCompare, Clock, Cpu } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  agents: Agent[]
  modelConfigs: ModelConfig[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  latency_ms?: number
  token_usage?: Record<string, number>
  tool_calls?: Array<Record<string, unknown>>
  error?: string | null
}

interface ComparePanel {
  id: string
  label: string
  model: string
  temperature: number
  systemPrompt: string
}

type Mode = 'chat' | 'compare'

// Knot platform supported models
const KNOT_MODELS_DATA = [
  { value: '', labelKey: 'useAgentDefaultModel' },
  { value: 'deepseek-v3.1', label: 'DeepSeek-V3.1' },
  { value: 'deepseek-v3.2', label: 'DeepSeek-V3.2' },
  { value: 'claude-4.5-sonnet', label: 'Claude-4.5-Sonnet' },
  { value: 'claude-4.6-sonnet', label: 'Claude-4.6-Sonnet' },
  { value: 'kimi-k2.5', label: 'Kimi-K2.5' },
  { value: 'glm-4.7', label: 'GLM-4.7' },
  { value: 'hunyuan-2.0-thinking', label: 'HY-2.0-Think' },
  { value: 'hunyuan-2.0-instruct', label: 'HY-2.0-Instruct' },
]

export default function PlaygroundPage({ agents, modelConfigs, showToast }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('chat')

  // Build i18n-aware KNOT_MODELS
  const KNOT_MODELS = KNOT_MODELS_DATA.map(m => ({
    value: m.value,
    label: m.labelKey ? t.playground[m.labelKey] || m.label || '' : m.label || '',
  }))

  const configLabels = [t.playground.configA, t.playground.configB, t.playground.configC, t.playground.configD]

  // Chat mode state
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || '')
  const [modelOverride, setModelOverride] = useState('')
  const [temperatureOverride, setTemperatureOverride] = useState('')
  const [promptOverride, setPromptOverride] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Compare mode state
  const [comparePanels, setComparePanels] = useState<ComparePanel[]>([
    { id: '1', label: 'Config A', model: '', temperature: 0.7, systemPrompt: '' },
    { id: '2', label: 'Config B', model: '', temperature: 0.7, systemPrompt: '' },
  ])
  const [compareInput, setCompareInput] = useState('')
  const [compareResults, setCompareResults] = useState<api.PlaygroundCompareItem[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  const [showConfig, setShowConfig] = useState(true)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  const selectedAgent = agents.find(a => a.id === selectedAgentId)

  // 切换 Agent 时清空模型覆盖，避免跨类型残留
  useEffect(() => {
    setModelOverride('')
  }, [selectedAgentId])

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || !selectedAgentId) return

    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const overrides: Record<string, unknown> = {}
      if (modelOverride) overrides.model = modelOverride
      if (temperatureOverride) overrides.temperature = parseFloat(temperatureOverride)
      if (promptOverride) overrides.system_prompt = promptOverride

      const res = await api.playgroundChat({
        agent_id: selectedAgentId,
        message: msg,
        config_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      })

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: res.content,
        thinking: res.thinking,
        latency_ms: res.latency_ms,
        token_usage: res.token_usage,
        tool_calls: res.tool_calls,
        error: res.error,
      }])
    } catch (e: unknown) {
      setChatMessages(prev => [...prev, {
        role: 'assistant', content: '', error: e instanceof Error ? e.message : '请求失败',
      }])
    }
    setChatLoading(false)
  }, [chatInput, selectedAgentId, modelOverride, temperatureOverride, promptOverride])

  const handleCompare = useCallback(async () => {
    const msg = compareInput.trim()
    if (!msg || !selectedAgentId) return

    setCompareLoading(true)
    setCompareResults([])
    try {
      const configs = comparePanels.map(p => ({
        label: p.label,
        model: p.model || undefined,
        temperature: p.temperature,
        system_prompt: p.systemPrompt || undefined,
      }))
      const res = await api.playgroundCompare({
        agent_id: selectedAgentId,
        message: msg,
        configs,
      })
      setCompareResults(res.results)
    } catch (e: unknown) {
      showToast(`${t.playground.compareFailed}: ${e instanceof Error ? e.message : t.traces?.unknownError || 'Unknown error'}`, 'error')
    }
    setCompareLoading(false)
  }, [compareInput, selectedAgentId, comparePanels, showToast])

  const addComparePanel = () => {
    if (comparePanels.length >= 4) return
    setComparePanels([...comparePanels, {
      id: String(Date.now()),
      label: configLabels[comparePanels.length] || `Config ${String.fromCharCode(65 + comparePanels.length)}`,
      model: '', temperature: 0.7, systemPrompt: '',
    }])
  }

  const removeComparePanel = (id: string) => {
    if (comparePanels.length <= 2) return
    setComparePanels(comparePanels.filter(p => p.id !== id))
  }

  const updatePanel = (id: string, field: keyof ComparePanel, val: string | number) => {
    setComparePanels(comparePanels.map(p => p.id === id ? { ...p, [field]: val } : p))
  }

  const inputCls = "w-full card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500 placeholder:text-text-muted"

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Play size={20} className="text-brand-400" />
            <h1 className="text-lg font-bold text-text-primary">{t.playground.title}</h1>
            <span className="text-xs text-text-muted">{t.playground.desc}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-border-light rounded-lg overflow-hidden">
              <button
                className={`px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 transition-colors ${mode === 'chat' ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                onClick={() => setMode('chat')}
              >
                <MessageSquare size={12} /> {t.playground.chat}
              </button>
              <button
                className={`px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 transition-colors ${mode === 'compare' ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                onClick={() => setMode('compare')}
              >
                <GitCompare size={12} /> {t.playground.compare}
              </button>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`p-1.5 rounded-lg transition-colors ${showConfig ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
              title={t.playground.configPanel}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
        {/* Agent Selector */}
        <div className="flex items-center gap-3">
          <select
            className="card rounded-lg px-3 py-1.5 text-text-primary text-xs outline-none focus:border-brand-500 w-52"
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
          >
            <option value="">{t.playground.selectAgent}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>)}
          </select>
          {selectedAgent && (
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              <Badge variant={selectedAgent.agent_type === 'openai' ? 'blue' : selectedAgent.agent_type === 'knot' ? 'purple' : 'gray'}>
                {selectedAgent.agent_type}
              </Badge>
              {selectedAgent.skills && <span>{selectedAgent.skills.length} skills</span>}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Config Panel (collapsible) */}
        {showConfig && (
          <div className="w-[260px] border-r border-border overflow-y-auto flex-shrink-0 p-4 space-y-4">
            {mode === 'chat' ? (
              <>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase mb-1.5 block">{t.playground.modelOverride}</label>
                  {selectedAgent?.agent_type === 'knot' ? (
                    <select className={inputCls} value={modelOverride} onChange={e => setModelOverride(e.target.value)}>
                      {KNOT_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  ) : (
                    <input className={inputCls} placeholder={t.playground.modelOverridePlaceholder} value={modelOverride} onChange={e => setModelOverride(e.target.value)} />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase mb-1.5 block">{t.playground.temperature}</label>
                  <input className={inputCls} type="number" min="0" max="2" step="0.1" placeholder="0.7" value={temperatureOverride} onChange={e => setTemperatureOverride(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase mb-1.5 block">{t.playground.promptOverride}</label>
                  <textarea className={inputCls + ' min-h-[120px] resize-y font-mono text-[11px]'} placeholder={t.playground.promptOverridePlaceholder} value={promptOverride} onChange={e => setPromptOverride(e.target.value)} />
                </div>
                <div className="pt-2">
                  <Button variant="ghost" onClick={() => { setChatMessages([]); setChatInput('') }} className="text-xs w-full">
                    {t.playground.clearChat}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-text-tertiary uppercase">{t.playground.compareConfig}</span>
                  <button onClick={addComparePanel} disabled={comparePanels.length >= 4} className="text-[10px] text-brand-400 hover:text-brand-300 disabled:text-text-muted flex items-center gap-1">
                    <Plus size={10} /> {t.playground.addConfig}
                  </button>
                </div>
                {comparePanels.map((p) => (
                  <div key={p.id} className="bg-surface-2/50 border border-border/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <input className="bg-transparent text-xs font-semibold text-text-primary outline-none w-24" value={p.label} onChange={e => updatePanel(p.id, 'label', e.target.value)} />
                      <button onClick={() => removeComparePanel(p.id)} disabled={comparePanels.length <= 2} className="text-text-muted hover:text-red-400 disabled:hidden"><Trash2 size={11} /></button>
                    </div>
                    {selectedAgent?.agent_type === 'knot' ? (
                      <select className="w-full card rounded px-2 py-1 text-[11px] text-text-primary outline-none focus:border-brand-500" value={p.model} onChange={e => updatePanel(p.id, 'model', e.target.value)}>
                        {KNOT_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    ) : (
                      <input className="w-full card rounded px-2 py-1 text-[11px] text-text-primary outline-none focus:border-brand-500 placeholder:text-text-muted" placeholder={t.playground.modelPlaceholder} value={p.model} onChange={e => updatePanel(p.id, 'model', e.target.value)} />
                    )}
                    <input className="w-full card rounded px-2 py-1 text-[11px] text-text-primary outline-none focus:border-brand-500" type="number" min="0" max="2" step="0.1" placeholder="0.7" value={p.temperature} onChange={e => updatePanel(p.id, 'temperature', parseFloat(e.target.value) || 0)} />
                    <textarea className="w-full card rounded px-2 py-1 text-[11px] text-text-primary outline-none focus:border-brand-500 placeholder:text-text-muted min-h-[60px] resize-y font-mono" placeholder={t.playground.systemPromptOverride} value={p.systemPrompt} onChange={e => updatePanel(p.id, 'systemPrompt', e.target.value)} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Chat / Compare Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {mode === 'chat' ? (
            <>
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                {chatMessages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-text-muted">
                      <MessageSquare size={40} className="mx-auto mb-3 text-text-muted" />
                      <p className="text-sm">{t.playground.chatEmptyTitle}</p>
                      <p className="text-[11px] text-text-muted mt-1">{t.playground.chatEmptyDesc}</p>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-brand-600/20 border border-brand-600/30 text-text-primary'
                        : 'card text-text-secondary'
                    }`}>
                      {msg.error ? (
                        <div className="text-red-400 text-xs">{msg.error}</div>
                      ) : (
                        <>
                          {msg.thinking && (
                            <div className="text-[11px] text-text-muted italic mb-2 pb-2 border-b border-border">
                              {msg.thinking.length > 200 ? msg.thinking.slice(0, 200) + '...' : msg.thinking}
                            </div>
                          )}
                          <div className="text-[13px] whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-3 mt-2 pt-2 divider/50 text-[10px] text-text-muted">
                              {msg.latency_ms != null && <span className="flex items-center gap-1"><Clock size={10} /> {msg.latency_ms}ms</span>}
                              {msg.token_usage && Object.keys(msg.token_usage).length > 0 && (
                                <span className="flex items-center gap-1"><Cpu size={10} /> {msg.token_usage.total_tokens || (msg.token_usage.prompt_tokens || 0) + (msg.token_usage.completion_tokens || 0)} tokens</span>
                              )}
                              {msg.tool_calls && msg.tool_calls.length > 0 && (
                                <Badge variant="purple" className="text-[9px]">{msg.tool_calls.length} {t.playground.toolCalls}</Badge>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="card px-4 py-3 flex items-center gap-2 text-text-tertiary text-sm">
                      <Loader2 size={14} className="animate-spin" /> {t.playground.thinking}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-border p-4 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    className="flex-1 card px-4 py-2.5 text-text-primary text-sm outline-none focus:border-brand-500 placeholder:text-text-muted rounded-lg"
                    placeholder={selectedAgentId ? t.playground.chatPlaceholder : t.playground.selectAgentFirst}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                    disabled={!selectedAgentId || chatLoading}
                  />
                  <Button onClick={handleSendChat} disabled={!selectedAgentId || chatLoading || !chatInput.trim()} className="px-4">
                    {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Compare Input */}
              <div className="border-b border-border p-4 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    className="flex-1 card px-4 py-2.5 text-text-primary text-sm outline-none focus:border-brand-500 placeholder:text-text-muted rounded-lg"
                    placeholder={t.playground.comparePlaceholder}
                    value={compareInput}
                    onChange={e => setCompareInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCompare()}
                    disabled={!selectedAgentId || compareLoading}
                  />
                  <Button onClick={handleCompare} disabled={!selectedAgentId || compareLoading || !compareInput.trim()} className="px-4">
                    {compareLoading ? <Loader2 size={16} className="animate-spin" /> : <><GitCompare size={14} className="mr-1" /> {t.playground.sendCompare}</>}
                  </Button>
                </div>
              </div>

              {/* Compare Results */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {compareResults.length === 0 && !compareLoading && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-text-muted">
                      <GitCompare size={40} className="mx-auto mb-3 text-text-muted" />
                      <p className="text-sm">{t.playground.compareEmptyTitle}</p>
                      <p className="text-[11px] text-text-muted mt-1">{t.playground.compareEmptyDesc}</p>
                    </div>
                  </div>
                )}
                {compareLoading && (
                  <div className="text-center py-20 text-text-tertiary flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin" /> {t.playground.comparing} {comparePanels.length} {t.playground.comparingConfigs}
                  </div>
                )}
                {compareResults.length > 0 && (
                  <div className={`grid gap-4 ${compareResults.length === 2 ? 'grid-cols-2' : compareResults.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {compareResults.map((r, i) => (
                      <div key={i} className="card p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                          <span className="text-xs font-semibold text-text-primary">{r.label}</span>
                          <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                            <span><Clock size={10} className="inline" /> {r.latency_ms}ms</span>
                            {r.token_usage?.total_tokens && <span>{r.token_usage.total_tokens} tok</span>}
                          </div>
                        </div>
                        {r.error ? (
                          <div className="text-red-400 text-xs">{r.error}</div>
                        ) : (
                          <>
                            {r.thinking && (
                              <div className="text-[10px] text-text-muted italic mb-2">
                                {r.thinking.length > 100 ? r.thinking.slice(0, 100) + '...' : r.thinking}
                              </div>
                            )}
                            <div className="text-[12px] text-text-secondary whitespace-pre-wrap leading-relaxed flex-1">
                              {r.content}
                            </div>
                            {r.tool_calls && r.tool_calls.length > 0 && (
                              <div className="mt-2 pt-2 divider/50">
                                <Badge variant="purple" className="text-[9px]">{r.tool_calls.length} {t.playground.toolCalls}</Badge>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
