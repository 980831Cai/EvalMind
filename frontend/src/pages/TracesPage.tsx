import React, { useState, useCallback, useMemo, useEffect } from 'react'
import type { TraceRecord, TraceDetail, SpanRecord, Agent, TestSuite } from '../types'
import * as api from '../services/api'
import { formatTraceTime } from '../utils/helpers'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import JsonTree from '../components/ui/JsonTree'
import Modal from '../components/ui/Modal'
import { RefreshCw, Activity, Copy, Check, ArrowLeft, ChevronRight, Bookmark, Bug, ChevronDown, ChevronUp, FileText, Filter, X, Search, Clock, AlertCircle, Zap, Database } from 'lucide-react'
import ScorePanel from '../components/ScorePanel'
import TraceToTestCase from '../components/TraceToTestCase'
import { useI18n } from '../i18n'

/* ─────────────────────────── Helpers ─────────────────────────── */

function prettyTraceName(name?: string, evalPrefix = 'Eval'): string {
  if (!name) return '(unnamed)'
  const oldEvalMatch = name.match(/^eval:eval-([a-f0-9-]+)$/i)
  if (oldEvalMatch) return `${evalPrefix} (${oldEvalMatch[1].substring(0, 8)})`
  const newEvalMatch = name.match(/^eval:(.+)-([a-f0-9]{8,})$/i)
  if (newEvalMatch) return `${evalPrefix}: ${newEvalMatch[1]} (${newEvalMatch[2].substring(0, 8)})`
  if (name.startsWith('eval:')) return `${evalPrefix}: ${name.slice(5)}`
  return name
}

function summarize(data: unknown, maxLen = 80): string {
  if (!data) return '-'
  let s = typeof data === 'string' ? data : JSON.stringify(data)
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > maxLen ? s.substring(0, maxLen) + '...' : s
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function spanKindColor(kind: string): string {
  return ({ llm: '#a78bfa', tool: '#f59e0b', retrieval: '#06b6d4', agent: '#22c55e', chain: '#60a5fa', other: '#71717a' } as Record<string, string>)[kind] || '#71717a'
}

function spanKindIcon(kind: string): string {
  return ({ llm: '🧠', tool: '🔧', retrieval: '📚', agent: '🤖', chain: '⛓', other: '●' } as Record<string, string>)[kind] || '●'
}

function spanKindLabel(kind: string): string {
  return ({ llm: 'LLM', tool: 'TOOL', retrieval: 'RAG', agent: 'AGENT', chain: 'CHAIN', other: 'OTHER' } as Record<string, string>)[kind] || kind.toUpperCase()
}

function statusColor(status: string): string {
  return ({ ok: '#22c55e', error: '#ef4444', running: '#f59e0b' } as Record<string, string>)[status] || '#71717a'
}

function useCopyToClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])
  return { copiedId, copy }
}

function CopyBtn({ text, id, copiedId, copy, title: btnTitle }: { text: string; id: string; copiedId: string | null; copy: (t: string, id: string) => void; title?: string }) {
  return (
    <button
      className="ml-1 text-text-muted hover:text-text-secondary transition-colors inline-flex items-center"
      onClick={e => { e.stopPropagation(); copy(text, id) }}
      title={btnTitle || 'Copy'}
    >
      {copiedId === id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  )
}

function SpanKindTag({ kind }: { kind: string }) {
  const color = spanKindColor(kind)
  const icon = spanKindIcon(kind)
  const label = spanKindLabel(kind)
  return (
    <span
      className="text-[9px] flex-shrink-0 font-bold px-1.5 py-0.5 rounded leading-none inline-flex items-center gap-0.5"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}35` }}
    >
      <span>{icon}</span>
      {label}
    </span>
  )
}

function flattenSpanTree(spans: SpanRecord[], depth = 0): Array<SpanRecord & { _depth: number }> {
  const result: Array<SpanRecord & { _depth: number }> = []
  for (const s of spans) {
    result.push({ ...s, _depth: depth })
    if (s.children && s.children.length > 0) {
      result.push(...flattenSpanTree(s.children, depth + 1))
    }
  }
  return result
}

/* ─────────────────────────── Props ─────────────────────────── */

interface TracesPageProps {
  traces: TraceRecord[]
  loading: boolean
  agents: Agent[]
  testSuites: TestSuite[]
  onRefresh: (agentId?: string, name?: string) => void
  initialTraceId?: string | null
  showToast: (message: string, type?: 'success' | 'error') => void
}

export default function TracesPage({ traces, loading, agents, testSuites, onRefresh, initialTraceId, showToast }: TracesPageProps) {
  const { t } = useI18n()
  const { copiedId, copy } = useCopyToClipboard()

  // Build agent lookup map for resolving agent names from agent_id
  const agentMap = useMemo(() => {
    const map: Record<string, string> = {}
    agents.forEach(a => { map[a.id] = a.name })
    return map
  }, [agents])

  const getAgentName = (trace: TraceRecord) => {
    if (trace.agent_name) return trace.agent_name
    if (trace.agent_id && agentMap[trace.agent_id]) return agentMap[trace.agent_id]
    return null
  }

  /* ── Filters ── */
  const [nameFilter, setNameFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [latencyMin, setLatencyMin] = useState('')
  const [latencyMax, setLatencyMax] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  /* ── Detail view state ── */
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'input_output' | 'metadata' | 'llm_detail' | 'scores'>('input_output')
  const [displayMode, setDisplayMode] = useState<'formatted' | 'json'>('formatted')
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)

  /* ── Modals ── */
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveTargetSuiteId, setSaveTargetSuiteId] = useState('')
  const [saveNewSuiteName, setSaveNewSuiteName] = useState('')
  const [saveExpectedOutput, setSaveExpectedOutput] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [showBadCaseModal, setShowBadCaseModal] = useState(false)
  const [badCaseAgentId, setBadCaseAgentId] = useState('')
  const [badCaseRootCause, setBadCaseRootCause] = useState('')
  const [badCaseTags, setBadCaseTags] = useState('')
  const [badCaseBusy, setBadCaseBusy] = useState(false)

  /* ── Batch selection ── */
  const [selectedTraceIds, setSelectedTraceIds] = useState<Set<string>>(new Set())
  const [showImportModal, setShowImportModal] = useState(false)

  const toggleTraceSelection = (traceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedTraceIds(prev => {
      const next = new Set(prev)
      if (next.has(traceId)) next.delete(traceId)
      else next.add(traceId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedTraceIds.size === filteredTraces.length && filteredTraces.length > 0) {
      setSelectedTraceIds(new Set())
    } else {
      setSelectedTraceIds(new Set(filteredTraces.map(t => t.id)))
    }
  }

  /* ── Client-side filtering ── */
  const filteredTraces = useMemo(() => {
    let result = traces
    if (sourceFilter) result = result.filter(t => t.source === sourceFilter)
    if (statusFilter) result = result.filter(t => t.status === statusFilter)
    if (latencyMin) {
      const min = parseFloat(latencyMin)
      if (!isNaN(min)) result = result.filter(t => (t.total_latency_ms || 0) >= min)
    }
    if (latencyMax) {
      const max = parseFloat(latencyMax)
      if (!isNaN(max)) result = result.filter(t => (t.total_latency_ms || 0) <= max)
    }
    return result
  }, [traces, sourceFilter, statusFilter, latencyMin, latencyMax])

  /* ── Stats ── */
  const listStats = useMemo(() => {
    let ok = 0, err = 0, totalLat = 0, latCount = 0, totalTk = 0, latencies: number[] = []
    filteredTraces.forEach(t => {
      if (t.status === 'ok') ok++
      else if (t.status === 'error') err++
      if (t.total_latency_ms) { totalLat += t.total_latency_ms; latCount++; latencies.push(t.total_latency_ms) }
      if (t.total_tokens) totalTk += t.total_tokens
    })
    latencies.sort((a, b) => a - b)
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0
    return {
      total: filteredTraces.length, ok, err,
      avgLatency: latCount > 0 ? totalLat / latCount : 0,
      totalTokens: totalTk, p50, p99,
    }
  }, [filteredTraces])

  /* ── Span tree ── */
  const flatSpans = useMemo(() => {
    if (!traceDetail?.spans) return []
    return flattenSpanTree(traceDetail.spans)
  }, [traceDetail])

  const selectedSpanData = useMemo(() => {
    if (!selectedSpanId) return null
    return flatSpans.find(s => s.id === selectedSpanId) || null
  }, [selectedSpanId, flatSpans])

  const spanStats = useMemo(() => {
    let llm = 0, tool = 0, retrieval = 0, other = 0
    flatSpans.forEach(s => {
      if (s.kind === 'llm') llm++
      else if (s.kind === 'tool') tool++
      else if (s.kind === 'retrieval') retrieval++
      else other++
    })
    return { llm, tool, retrieval, other, total: flatSpans.length }
  }, [flatSpans])

  const timeRange = useMemo(() => {
    if (!flatSpans.length) return { min: 0, max: 0, total: 0 }
    let min = Infinity, max = -Infinity
    flatSpans.forEach(s => {
      if (s.start_time) { const t = new Date(s.start_time).getTime(); if (t < min) min = t }
      if (s.end_time) { const t = new Date(s.end_time).getTime(); if (t > max) max = t }
    })
    if (min === Infinity || max === -Infinity) return { min: 0, max: 0, total: 0 }
    return { min, max, total: max - min }
  }, [flatSpans])

  const spanTimeOffset = (s: SpanRecord) => {
    if (!s.start_time || timeRange.total <= 0) return 0
    return ((new Date(s.start_time).getTime() - timeRange.min) / timeRange.total) * 100
  }
  const spanTimePct = (s: SpanRecord) => {
    if (!s.start_time || !s.end_time || timeRange.total <= 0) return 0
    return (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / timeRange.total * 100
  }

  /* ── Select Trace ── */
  const selectTrace = useCallback(async (trace: TraceRecord) => {
    setSelectedTraceId(trace.id)
    setSelectedSpanId(null)
    setDetailTab('input_output')
    setTraceLoading(true)
    try {
      const detail = await api.fetchTraceDetail(trace.id)
      setTraceDetail(detail)
    } catch (e: unknown) {
      console.error('Failed to load trace detail:', e)
      setTraceDetail({ ...trace, spans: [], eval_results: [] })
    }
    setTraceLoading(false)
  }, [])

  useEffect(() => {
    if (initialTraceId && traces.length > 0 && !selectedTraceId) {
      const found = traces.find(t => t.id === initialTraceId)
      if (found) selectTrace(found)
      else selectTrace({ id: initialTraceId } as TraceRecord)
    }
  }, [initialTraceId, traces, selectedTraceId, selectTrace])

  const goBack = useCallback(() => {
    setSelectedTraceId(null)
    setSelectedSpanId(null)
    setTraceDetail(null)
  }, [])

  const handleFilter = () => onRefresh(agentFilter || undefined, nameFilter || undefined)

  /* ── Save to TestSuite ── */
  const openSaveModal = useCallback(() => {
    setSaveTargetSuiteId(testSuites.length > 0 ? testSuites[0].id : '__new__')
    setSaveNewSuiteName('')
    setSaveExpectedOutput(traceDetail?.output || '')
    setShowSaveModal(true)
  }, [testSuites, traceDetail])

  const handleSaveToSuite = useCallback(async () => {
    const inputStr = traceDetail?.input || ''
    if (!inputStr) { showToast(t.traces.noInputData, 'error'); return }
    setSaveBusy(true)
    try {
      let suiteId = saveTargetSuiteId
      if (suiteId === '__new__') {
        const name = saveNewSuiteName.trim() || t.traces.fromTraceCollect
        const created = await api.createTestSuite({ name, description: t.traces.fromTraceCollectDesc, test_cases: [], source: 'manual' })
        suiteId = created.id
      }
      await api.importTraceToSuite(suiteId, {
        input: inputStr,
        expected_output: saveExpectedOutput || undefined,
        metadata: { source: 'trace', trace_id: traceDetail?.id },
      })
      showToast(t.traces.savedTestCase)
      setShowSaveModal(false)
    } catch (e: unknown) {
      showToast(`${t.traces.saveFailed}: ${e instanceof Error ? e.message : t.traces.unknownError}`, 'error')
    }
    setSaveBusy(false)
  }, [traceDetail, saveTargetSuiteId, saveNewSuiteName, saveExpectedOutput, showToast, t])

  /* ── Mark as Bad Case ── */
  const openBadCaseModal = useCallback(() => {
    const matched = agents.find(a => a.id === traceDetail?.agent_id)
    setBadCaseAgentId(matched?.id || (agents.length > 0 ? agents[0].id : ''))
    setBadCaseRootCause('')
    setBadCaseTags('')
    setShowBadCaseModal(true)
  }, [traceDetail, agents])

  const handleMarkBadCase = useCallback(async () => {
    if (!badCaseAgentId) { showToast(t.traces.selectAgent, 'error'); return }
    const inputStr = traceDetail?.input || ''
    if (!inputStr) { showToast(t.traces.noInputData, 'error'); return }
    setBadCaseBusy(true)
    try {
      await api.createBadCaseFromTrace({
        agent_id: badCaseAgentId,
        input: inputStr,
        actual_output: traceDetail?.output || undefined,
        tags: badCaseTags ? badCaseTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        root_cause: badCaseRootCause || undefined,
      })
      showToast(t.traces.markedBadCase)
      setShowBadCaseModal(false)
    } catch (e: unknown) {
      showToast(`${t.traces.markFailed}: ${e instanceof Error ? e.message : t.traces.unknownError}`, 'error')
    }
    setBadCaseBusy(false)
  }, [traceDetail, badCaseAgentId, badCaseRootCause, badCaseTags, showToast, t])

  const currentInput = selectedSpanData
    ? (selectedSpanData.kind === 'llm' ? selectedSpanData.llm_prompt : selectedSpanData.kind === 'tool' ? selectedSpanData.tool_input : selectedSpanData.input)
    : traceDetail?.input
  const currentOutput = selectedSpanData
    ? (selectedSpanData.kind === 'llm' ? selectedSpanData.llm_completion : selectedSpanData.kind === 'tool' ? selectedSpanData.tool_output : selectedSpanData.output)
    : traceDetail?.output

  const activeFilterCount = [sourceFilter, statusFilter, latencyMin, latencyMax].filter(Boolean).length

  /* ═══════════════════════ RENDER: Detail View ═══════════════════════ */
  if (selectedTraceId) {
    return (
      <>
      <div className="flex flex-col h-full">
        {/* Detail Header */}
        <div className="px-5 py-3 border-b border-border bg-surface-1 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={goBack} className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0" title={t.traces.backToList}>
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-[15px] font-semibold text-text-primary truncate">{prettyTraceName(traceDetail?.name, t.traces.evalPrefix)}</h2>
            {traceDetail?.status && (
              <Badge variant={traceDetail.status === 'ok' ? 'green' : traceDetail.status === 'error' ? 'red' : 'gray'}>
                {traceDetail.status}
              </Badge>
            )}
            {traceDetail?.total_latency_ms != null && <Badge variant="blue">{fmtLatency(traceDetail.total_latency_ms)}</Badge>}
            {traceDetail?.source && <Badge variant="gray">{traceDetail.source}</Badge>}
            {traceDetail?.agent_name && <Badge variant="purple">{traceDetail.agent_name}</Badge>}
            <div className="ml-auto flex gap-1.5 flex-shrink-0">
              <button onClick={openSaveModal} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 border border-brand-600/30 transition-colors" title={t.traces.saveToSuiteTitle}>
                <Bookmark size={12} /> {t.traces.saveToTestCase}
              </button>
              <button onClick={openBadCaseModal} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors" title={t.traces.badCaseTitle}>
                <Bug size={12} /> {t.traces.markBadCase}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-text-tertiary">TraceID</span>
              <span className="text-text-secondary font-mono">{selectedTraceId.substring(0, 20)}...</span>
              <CopyBtn text={selectedTraceId} id="dtl-tid" copiedId={copiedId} copy={copy} title={t.common.copy} />
            </div>
            {traceDetail?.session_id && (
              <div className="flex items-center gap-1">
                <span className="text-text-tertiary">SessionID</span>
                <span className="text-amber-400 font-mono">{traceDetail.session_id.substring(0, 20)}{traceDetail.session_id.length > 20 ? '...' : ''}</span>
                <CopyBtn text={traceDetail.session_id} id="dtl-sid" copiedId={copiedId} copy={copy} title={t.common.copy} />
              </div>
            )}
            {traceDetail?.start_time && (
              <span className="text-text-tertiary">{t.traces.startTime}: <span className="text-text-secondary">{formatTraceTime(traceDetail.start_time)}</span></span>
            )}
            {spanStats.total > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-text-tertiary">Spans:</span>
                <span className="text-text-secondary">{spanStats.total}</span>
                {spanStats.llm > 0 && <><span className="text-text-muted">|</span><span className="text-text-tertiary">LLM:</span><span className="text-purple-400">{spanStats.llm}</span></>}
                {spanStats.tool > 0 && <><span className="text-text-muted">|</span><span className="text-text-tertiary">Tool:</span><span className="text-amber-400">{spanStats.tool}</span></>}
                {spanStats.retrieval > 0 && <><span className="text-text-muted">|</span><span className="text-text-tertiary">RAG:</span><span className="text-cyan-400">{spanStats.retrieval}</span></>}
              </div>
            )}
            {traceDetail?.total_tokens != null && traceDetail.total_tokens > 0 && (
              <span className="text-text-tertiary">Tokens: <span className="text-text-secondary">{fmtTokens(traceDetail.total_tokens)}</span></span>
            )}
            {traceDetail?.total_cost != null && traceDetail.total_cost > 0 && (
              <span className="text-text-tertiary">Cost: <span className="text-emerald-400">${traceDetail.total_cost.toFixed(4)}</span></span>
            )}
          </div>
        </div>

        {/* Main: Span tree + Content panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Span Tree */}
          <div className="w-[300px] border-r border-border overflow-y-auto flex-shrink-0 bg-[#0a0a0b]">
            {traceLoading && <div className="text-center py-8 text-text-muted text-xs">{t.traces.loading}</div>}
            {!traceLoading && traceDetail && (
              <div
                className={`cursor-pointer border-b border-border transition-colors px-3 py-2 ${!selectedSpanId ? 'bg-indigo-950/60' : 'hover:bg-surface-1/50'}`}
                onClick={() => { setSelectedSpanId(null); setDetailTab('input_output') }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none bg-blue-500/15 text-blue-400 border border-blue-500/30">TRACE</span>
                  <span className="text-xs text-text-primary truncate flex-1">{prettyTraceName(traceDetail.name, t.traces.evalPrefix)}</span>
                  {traceDetail.total_latency_ms != null && <span className="text-[10px] text-text-muted flex-shrink-0">{fmtLatency(traceDetail.total_latency_ms)}</span>}
                </div>
              </div>
            )}
            {flatSpans.map(span => (
              <div
                key={span.id}
                className={`cursor-pointer border-b border-surface-2/50 transition-colors ${selectedSpanId === span.id ? 'bg-indigo-950' : 'hover:bg-surface-1/50'}`}
                style={{ paddingLeft: `${12 + span._depth * 16}px` }}
                onClick={() => { setSelectedSpanId(span.id); setDetailTab(span.kind === 'llm' ? 'llm_detail' : 'input_output') }}
              >
                <div className="py-2 pr-2.5 flex items-center gap-1.5">
                  {span._depth > 0 && <span className="text-border text-[10px] flex-shrink-0">├─</span>}
                  <SpanKindTag kind={span.kind} />
                  <span className="text-xs text-text-primary truncate flex-1" title={span.name || t.traces.unnamed}>{span.name || t.traces.unnamed}</span>
                  <span className="text-[10px] text-text-muted flex-shrink-0 whitespace-nowrap">{fmtLatency(span.latency_ms)}</span>
                </div>
                {timeRange.total > 0 && (
                  <div className="pr-2.5 pb-1.5" style={{ height: 6 }}>
                    <div className="relative h-1 bg-surface-2 rounded-sm overflow-hidden">
                      <div
                        className="absolute h-full rounded-sm opacity-80"
                        style={{
                          left: `${spanTimeOffset(span)}%`,
                          width: `${Math.max(spanTimePct(span), 1)}%`,
                          background: spanKindColor(span.kind),
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!traceLoading && !flatSpans.length && traceDetail && (
              <div className="text-center py-8 text-text-muted text-xs">{t.traces.noSpanData}</div>
            )}
          </div>

          {/* RIGHT: Content Panel */}
          <div className="flex-1 overflow-y-auto bg-[#09090b]">
            <div className="px-5 pt-4 pb-3 border-b border-border">
              {selectedSpanData ? (
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <SpanKindTag kind={selectedSpanData.kind} />
                    <span className="text-sm font-semibold text-text-primary">{selectedSpanData.name || t.traces.unnamed}</span>
                    <Badge variant={selectedSpanData.status === 'ok' ? 'green' : selectedSpanData.status === 'error' ? 'red' : 'gray'}>
                      {selectedSpanData.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] flex-wrap">
                    <span className="text-text-tertiary">ID: <span className="text-text-secondary font-mono">{selectedSpanData.id.substring(0, 16)}...</span></span>
                    <span className="text-cyan-400">{fmtLatency(selectedSpanData.latency_ms)}</span>
                    {selectedSpanData.kind === 'llm' && selectedSpanData.llm_model && (
                      <Badge variant="purple" className="text-[10px]">{selectedSpanData.llm_model}</Badge>
                    )}
                    {selectedSpanData.kind === 'tool' && selectedSpanData.tool_name && (
                      <Badge variant="yellow" className="text-[10px]">{selectedSpanData.tool_name}</Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none bg-blue-500/15 text-blue-400 border border-blue-500/30">TRACE</span>
                  <span className="text-sm font-semibold text-text-primary">{prettyTraceName(traceDetail?.name, t.traces.evalPrefix)}</span>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-between px-5 border-b border-border">
              <div className="flex">
                {([
                  ['input_output', t.traces.inputOutput],
                  ...(selectedSpanData?.kind === 'llm' ? [['llm_detail', t.traces.llmDetail]] : []),
                  ['metadata', selectedSpanData ? t.traces.metadataLabel : t.traces.metadataLabel],
                  ['scores', t.traces.scoresLabel],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={`px-4 py-2.5 text-[13px] border-b-2 transition-all ${
                      detailTab === key ? 'text-text-primary border-brand font-medium' : 'text-text-tertiary border-transparent hover:text-text-secondary'
                    }`}
                    onClick={() => setDetailTab(key as typeof detailTab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {detailTab === 'input_output' && (
                <div className="flex items-center border border-border-light rounded-md overflow-hidden">
                  {(['formatted', 'json'] as const).map(mode => (
                    <button
                      key={mode}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        displayMode === mode ? 'bg-surface-4 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                      }`}
                      onClick={() => setDisplayMode(mode)}
                    >
                      {mode === 'formatted' ? t.traces.formatted : t.traces.json}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {detailTab === 'input_output' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />
                        {t.traces.input}
                      </div>
                    </div>
                    <div className="card rounded-lg p-3.5 max-h-[350px] overflow-y-auto">
                      {displayMode === 'formatted' ? (
                        currentInput && typeof currentInput === 'object'
                          ? <JsonTree data={currentInput} defaultExpanded />
                          : <div className="text-xs text-text-secondary whitespace-pre-wrap break-all">{currentInput || t.traces.empty}</div>
                      ) : (
                        <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all font-mono">{currentInput == null ? 'null' : typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {t.traces.output}
                      </div>
                    </div>
                    <div className="card rounded-lg p-3.5 max-h-[350px] overflow-y-auto">
                      {displayMode === 'formatted' ? (
                        currentOutput && typeof currentOutput === 'object'
                          ? <JsonTree data={currentOutput} defaultExpanded />
                          : <div className="text-xs text-text-secondary whitespace-pre-wrap break-all">{currentOutput || t.traces.empty}</div>
                      ) : (
                        <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all font-mono">{currentOutput == null ? 'null' : typeof currentOutput === 'string' ? currentOutput : JSON.stringify(currentOutput, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'llm_detail' && selectedSpanData?.kind === 'llm' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {selectedSpanData.llm_model && (
                      <div className="card rounded-lg p-3">
                        <div className="text-[10px] text-text-muted mb-0.5">{t.traces.model}</div>
                        <div className="text-xs font-semibold text-purple-400">{selectedSpanData.llm_model}</div>
                      </div>
                    )}
                    {selectedSpanData.llm_temperature != null && (
                      <div className="card rounded-lg p-3">
                        <div className="text-[10px] text-text-muted mb-0.5">Temperature</div>
                        <div className="text-xs font-semibold text-text-primary">{selectedSpanData.llm_temperature}</div>
                      </div>
                    )}
                    {selectedSpanData.llm_total_tokens != null && (
                      <div className="card rounded-lg p-3">
                        <div className="text-[10px] text-text-muted mb-0.5">Total Tokens</div>
                        <div className="text-xs font-semibold text-text-primary">{fmtTokens(selectedSpanData.llm_total_tokens)}</div>
                      </div>
                    )}
                    {selectedSpanData.llm_cost != null && selectedSpanData.llm_cost > 0 && (
                      <div className="card rounded-lg p-3">
                        <div className="text-[10px] text-text-muted mb-0.5">Cost</div>
                        <div className="text-xs font-semibold text-emerald-400">${selectedSpanData.llm_cost.toFixed(4)}</div>
                      </div>
                    )}
                  </div>
                  {(selectedSpanData.llm_prompt_tokens != null || selectedSpanData.llm_completion_tokens != null) && (
                    <div className="card rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-text-secondary mb-2">{t.traces.tokenConsumption}</div>
                      <div className="flex items-center gap-6 text-xs">
                        <div><span className="text-text-tertiary">Prompt:</span> <span className="text-text-primary">{fmtTokens(selectedSpanData.llm_prompt_tokens || 0)}</span></div>
                        <div><span className="text-text-tertiary">Completion:</span> <span className="text-text-primary">{fmtTokens(selectedSpanData.llm_completion_tokens || 0)}</span></div>
                        <div><span className="text-text-tertiary">Total:</span> <span className="text-text-primary font-semibold">{fmtTokens(selectedSpanData.llm_total_tokens || 0)}</span></div>
                      </div>
                      {(selectedSpanData.llm_prompt_tokens || 0) + (selectedSpanData.llm_completion_tokens || 0) > 0 && (
                        <div className="mt-2 h-2 bg-surface-3 rounded-full overflow-hidden flex">
                          <div className="h-full bg-blue-500" style={{ width: `${((selectedSpanData.llm_prompt_tokens || 0) / ((selectedSpanData.llm_prompt_tokens || 0) + (selectedSpanData.llm_completion_tokens || 0))) * 100}%` }} title={`Prompt: ${selectedSpanData.llm_prompt_tokens}`} />
                          <div className="h-full bg-emerald-500 flex-1" title={`Completion: ${selectedSpanData.llm_completion_tokens}`} />
                        </div>
                      )}
                    </div>
                  )}
                  {selectedSpanData.llm_finish_reason && (
                    <div className="text-[11px] text-text-tertiary">Finish Reason: <span className="text-text-secondary">{selectedSpanData.llm_finish_reason}</span></div>
                  )}
                  {selectedSpanData.llm_prompt && (
                    <div>
                      <div className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        Prompt
                      </div>
                      <div className="card rounded-lg p-3.5 max-h-[300px] overflow-y-auto">
                        <div className="text-xs text-text-secondary whitespace-pre-wrap break-all">{selectedSpanData.llm_prompt}</div>
                      </div>
                    </div>
                  )}
                  {selectedSpanData.llm_completion && (
                    <div>
                      <div className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Completion
                      </div>
                      <div className="card rounded-lg p-3.5 max-h-[300px] overflow-y-auto">
                        <div className="text-xs text-text-secondary whitespace-pre-wrap break-all">{selectedSpanData.llm_completion}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'metadata' && selectedSpanData && (
                <div className="space-y-3">
                  <div className="card rounded-lg p-3">
                    <div className="text-[11px] font-semibold text-text-secondary mb-2">{t.traces.basicInfo}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-text-tertiary">ID</span><span className="text-text-primary font-mono text-[11px]">{selectedSpanData.id}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">Trace ID</span><span className="text-text-primary font-mono text-[11px] truncate max-w-[180px]">{selectedSpanData.trace_id}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">{t.traces.type}</span><span className="text-text-primary">{selectedSpanData.kind}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">{t.common.status}</span><span style={{ color: statusColor(selectedSpanData.status) }}>{selectedSpanData.status}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">{t.traces.startTime}</span><span className="text-text-primary">{selectedSpanData.start_time || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">{t.traces.endTime}</span><span className="text-text-primary">{selectedSpanData.end_time || '-'}</span></div>
                      <div className="flex justify-between"><span className="text-text-tertiary">{t.traces.latency}</span><span className="text-cyan-400">{fmtLatency(selectedSpanData.latency_ms)}</span></div>
                      {selectedSpanData.kind === 'llm' && selectedSpanData.llm_model && (
                        <div className="flex justify-between"><span className="text-text-tertiary">{t.traces.model}</span><span className="text-purple-400">{selectedSpanData.llm_model}</span></div>
                      )}
                    </div>
                  </div>
                  {selectedSpanData.attributes && Object.keys(selectedSpanData.attributes).length > 0 && (
                    <div className="card rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-text-secondary mb-2">Attributes</div>
                      <JsonTree data={selectedSpanData.attributes} defaultExpanded />
                    </div>
                  )}
                  {selectedSpanData.events && selectedSpanData.events.length > 0 && (
                    <div className="card rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-text-secondary mb-2">Events ({selectedSpanData.events.length})</div>
                      <JsonTree data={selectedSpanData.events} defaultExpanded />
                    </div>
                  )}
                  {selectedSpanData.status_message && (
                    <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-red-400 mb-1">Status Message</div>
                      <div className="text-xs text-red-300 whitespace-pre-wrap">{selectedSpanData.status_message}</div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'metadata' && !selectedSpanData && traceDetail && (
                <div className="space-y-3">
                  {(traceDetail.tags || []).length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {traceDetail.tags!.map(tag => <Badge key={tag} variant="blue" className="text-[10px] px-2 py-0.5">{tag}</Badge>)}
                    </div>
                  )}
                  {traceDetail.metadata && Object.keys(traceDetail.metadata).length > 0 && (
                    <div className="card rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-text-secondary mb-2">Metadata</div>
                      <JsonTree data={traceDetail.metadata} defaultExpanded />
                    </div>
                  )}
                  {traceDetail.eval_results && traceDetail.eval_results.length > 0 && (
                    <div className="card rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-text-secondary mb-2">{t.traces.relatedEvalResults} ({traceDetail.eval_results.length})</div>
                      <div className="space-y-1.5">
                        {traceDetail.eval_results.map(er => (
                          <div key={er.id} className="flex items-center gap-3 px-2 py-1.5 bg-surface-3/50 rounded text-xs">
                            <span className="text-text-tertiary font-mono">{er.id.substring(0, 8)}...</span>
                            <span className={`font-semibold ${er.overall_score >= 0.8 ? 'text-emerald-400' : er.overall_score >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>
                              {(er.overall_score * 100).toFixed(0)}%
                            </span>
                            {er.passed ? <Badge variant="green">{t.traces.passed}</Badge> : <Badge variant="red">{t.traces.notPassed}</Badge>}
                            <span className="text-text-muted">{formatTraceTime(er.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!traceDetail.metadata || !Object.keys(traceDetail.metadata).length) && !(traceDetail.eval_results?.length) && (
                    <div className="text-center py-5 text-text-muted text-xs">{t.traces.noMetadata}</div>
                  )}
                </div>
              )}

              {detailTab === 'scores' && (
                <ScorePanel traceId={selectedTraceId} spanId={selectedSpanId} showToast={showToast} traceDetail={traceDetail} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save to TestSuite Modal */}
      <Modal open={showSaveModal} onClose={() => setShowSaveModal(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-primary">{t.traces.saveToSuiteTitle}</h3>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.targetSuite}</label>
            <select className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500" value={saveTargetSuiteId} onChange={e => setSaveTargetSuiteId(e.target.value)}>
              {testSuites.map(s => (<option key={s.id} value={s.id}>{s.name} v{s.version} - {s.case_count} {t.traces.caseCount}</option>))}
              <option value="__new__">{t.traces.createNewSuite}</option>
            </select>
          </div>
          {saveTargetSuiteId === '__new__' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">{t.traces.newSuiteName}</label>
              <input className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500" value={saveNewSuiteName} onChange={e => setSaveNewSuiteName(e.target.value)} placeholder={t.traces.fromTraceCollect} />
            </div>
          )}
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.inputAutoFill}</label>
            <div className="card rounded-lg p-2.5 text-xs text-text-secondary max-h-24 overflow-y-auto whitespace-pre-wrap">{traceDetail?.input || t.traces.empty}</div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.expectedOutput}</label>
            <textarea className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500 min-h-[80px] resize-y" value={saveExpectedOutput} onChange={e => setSaveExpectedOutput(e.target.value)} placeholder={t.traces.expectedOutputPlaceholder} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowSaveModal(false)} className="text-xs">{t.common.cancel}</Button>
            <Button onClick={handleSaveToSuite} disabled={saveBusy} className="text-xs">{saveBusy ? t.traces.saving : t.traces.confirmSave}</Button>
          </div>
        </div>
      </Modal>

      {/* Bad Case Modal */}
      <Modal open={showBadCaseModal} onClose={() => setShowBadCaseModal(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-primary">{t.traces.badCaseTitle}</h3>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.relatedAgent}</label>
            <select className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500" value={badCaseAgentId} onChange={e => setBadCaseAgentId(e.target.value)}>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.inputLabel}</label>
            <div className="card rounded-lg p-2.5 text-xs text-text-secondary max-h-24 overflow-y-auto whitespace-pre-wrap">{traceDetail?.input || t.traces.empty}</div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.actualOutput}</label>
            <div className="card rounded-lg p-2.5 text-xs text-text-secondary max-h-24 overflow-y-auto whitespace-pre-wrap">{traceDetail?.output || t.traces.empty}</div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.rootCauseAnalysis}</label>
            <textarea className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500 min-h-[60px] resize-y" value={badCaseRootCause} onChange={e => setBadCaseRootCause(e.target.value)} placeholder={t.traces.rootCausePlaceholder} />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t.traces.tagsComma}</label>
            <input className="w-full input-sm rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500" value={badCaseTags} onChange={e => setBadCaseTags(e.target.value)} placeholder={t.traces.tagsPlaceholder} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowBadCaseModal(false)} className="text-xs">{t.common.cancel}</Button>
            <Button onClick={handleMarkBadCase} disabled={badCaseBusy} className="text-xs bg-red-600 hover:bg-red-700">{badCaseBusy ? t.traces.submitting : t.traces.confirmMark}</Button>
          </div>
        </div>
      </Modal>
    </>
    )
  }

  /* ═══════════════════════ RENDER: List View (Langfuse Style) ═══════════════════════ */

  const sourceLabel = (s: string) => ({
    eval: t.traces.sourceEval,
    otel: t.traces.sourceOtel,
    sdk: t.traces.sourceSdk,
    manual: t.traces.sourceManual,
    api: t.traces.sourceApi,
  }[s] || s)

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar: Title + Stats ── */}
      <div className="px-6 pt-5 pb-0 flex-shrink-0 bg-[#09090b]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
              <Activity size={16} className="text-brand-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">{t.traces.title}</h1>
              <p className="text-[11px] text-text-muted">{t.traces.desc}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {selectedTraceIds.size > 0 && (
              <Button onClick={() => setShowImportModal(true)} className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 border-0">
                <FileText size={12} className="mr-1" />{t.traces.importCount} {selectedTraceIds.size}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onRefresh(agentFilter || undefined, nameFilter || undefined)} disabled={loading} className="text-xs px-3 py-1.5">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? t.traces.refreshing : t.common.refresh}
            </Button>
          </div>
        </div>

        {/* ── Stat Cards Row ── */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="card rounded-lg px-4 py-3">
            <div className="text-[11px] text-text-tertiary mb-1">{t.traces.totalRequests}</div>
            <div className="text-xl font-bold text-text-primary tabular-nums">{listStats.total}</div>
          </div>
          <div className="card rounded-lg px-4 py-3">
            <div className="text-[11px] text-text-tertiary mb-1 flex items-center gap-1">
              <AlertCircle size={10} className="text-red-400" /> {t.traces.errors}
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: listStats.err > 0 ? '#ef4444' : '#22c55e' }}>{listStats.err}</div>
          </div>
          <div className="card rounded-lg px-4 py-3">
            <div className="text-[11px] text-text-tertiary mb-1 flex items-center gap-1">
              <Clock size={10} className="text-cyan-400" /> {t.traces.p50Latency}
            </div>
            <div className="text-xl font-bold text-cyan-400 tabular-nums">{listStats.p50 > 0 ? fmtLatency(listStats.p50) : '-'}</div>
          </div>
          <div className="card rounded-lg px-4 py-3">
            <div className="text-[11px] text-text-tertiary mb-1 flex items-center gap-1">
              <Zap size={10} className="text-amber-400" /> {t.traces.p99Latency}
            </div>
            <div className="text-xl font-bold text-amber-400 tabular-nums">{listStats.p99 > 0 ? fmtLatency(listStats.p99) : '-'}</div>
          </div>
          <div className="card rounded-lg px-4 py-3">
            <div className="text-[11px] text-text-tertiary mb-1 flex items-center gap-1">
              <Database size={10} className="text-purple-400" /> {t.traces.totalTokens}
            </div>
            <div className="text-xl font-bold text-purple-400 tabular-nums">{listStats.totalTokens > 0 ? fmtTokens(listStats.totalTokens) : '-'}</div>
          </div>
        </div>
      </div>

      {/* ── Main Content: Filters Sidebar + Table ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Filter Sidebar ── */}
        {showFilters && (
          <div className="w-[220px] border-r border-border bg-[#0a0a0b] overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                <Filter size={12} /> {t.traces.filters}
                {activeFilterCount > 0 && (
                  <span className="bg-brand-500/20 text-brand-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>
                )}
              </div>
              <button onClick={() => setShowFilters(false)} className="text-text-muted hover:text-text-secondary">
                <X size={14} />
              </button>
            </div>

            <div className="p-3 space-y-4">
              {/* Agent */}
              <div>
                <label className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{t.traces.agent}</label>
                <select
                  className="w-full card rounded-md px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-brand-500"
                  value={agentFilter}
                  onChange={e => { setAgentFilter(e.target.value); onRefresh(e.target.value || undefined, nameFilter || undefined) }}
                >
                  <option value="">{t.traces.filterAll}</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{t.traces.statusLabel}</label>
                <div className="space-y-1">
                  {[
                    { value: '', label: t.traces.filterAll, dot: '#71717a' },
                    { value: 'ok', label: 'OK', dot: '#22c55e' },
                    { value: 'error', label: 'Error', dot: '#ef4444' },
                    { value: 'running', label: 'Running', dot: '#f59e0b' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                        statusFilter === opt.value ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
                      }`}
                      onClick={() => setStatusFilter(opt.value)}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.dot }} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{t.traces.traceSource}</label>
                <select
                  className="w-full card rounded-md px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-brand-500"
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                >
                  <option value="">{t.traces.filterAll}</option>
                  <option value="api">API</option>
                  <option value="otel">OTel</option>
                  <option value="eval">{t.traces.sourceEval}</option>
                  <option value="sdk">SDK</option>
                  <option value="manual">{t.traces.sourceManual}</option>
                </select>
              </div>

              {/* Latency Range */}
              <div>
                <label className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{t.traces.latencyRange}</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    className="w-1/2 card rounded-md px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={t.traces.min}
                    value={latencyMin}
                    onChange={e => setLatencyMin(e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-1/2 card rounded-md px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={t.traces.max}
                    value={latencyMax}
                    onChange={e => setLatencyMax(e.target.value)}
                  />
                </div>
              </div>

              {/* Name Search */}
              <div>
                <label className="block text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">{t.traces.nameSearch}</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    className="w-full card rounded-md pl-7 pr-2 py-1.5 text-xs text-text-secondary outline-none focus:border-brand-500 placeholder:text-text-muted"
                    placeholder={t.traces.searchPlaceholder}
                    value={nameFilter}
                    onChange={e => setNameFilter(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFilter()}
                  />
                </div>
              </div>

              {/* Clear All */}
              {activeFilterCount > 0 && (
                <button
                  className="w-full text-[11px] text-brand-400 hover:text-brand-300 py-1.5 border border-brand-500/20 rounded-md hover:bg-brand-500/10 transition-colors"
                  onClick={() => { setSourceFilter(''); setStatusFilter(''); setLatencyMin(''); setLatencyMax(''); setNameFilter(''); setAgentFilter(''); onRefresh() }}
                >
                  {t.traces.clearFilters}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Right: Table ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table header bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-1/50 flex-shrink-0">
            {!showFilters && (
              <button
                onClick={() => setShowFilters(true)}
                className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary px-2 py-1 border border-border rounded-md"
              >
                <Filter size={12} />
                {t.traces.filters}
                {activeFilterCount > 0 && (
                  <span className="bg-brand-500/20 text-brand-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>
                )}
              </button>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={toggleSelectAll} className="text-[11px] text-text-tertiary hover:text-text-secondary px-2 py-1 border border-border rounded-md">
                {selectedTraceIds.size === filteredTraces.length && filteredTraces.length > 0 ? t.traces.deselectAll : t.traces.selectAll}
              </button>
              <span className="text-[11px] text-text-muted">{filteredTraces.length} {t.traces.records}</span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading && !traces.length && (
              <div className="text-center py-16">
                <RefreshCw size={24} className="mx-auto mb-3 text-brand-400 animate-spin" />
                <p className="text-[13px] text-text-tertiary">{t.traces.loadingTraces}</p>
              </div>
            )}

            {/* Table Header */}
            {filteredTraces.length > 0 && (
              <div className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur border-b border-border">
                <div className="grid items-center text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-4 py-2.5"
                  style={{ gridTemplateColumns: '28px 32px minmax(120px, 1.5fr) minmax(140px, 2fr) minmax(140px, 2fr) 70px 70px 60px 80px 110px' }}
                >
                  <div></div>
                  <div>{t.common.status}</div>
                  <div>{t.common.name}</div>
                  <div>{t.traces.input}</div>
                  <div>{t.traces.output}</div>
                  <div className="text-right">{t.traces.latency}</div>
                  <div className="text-right">{t.traces.tokens}</div>
                  <div>{t.traces.traceSource}</div>
                  <div>{t.traces.agent}</div>
                  <div className="text-right">{t.traces.startTime}</div>
                </div>
              </div>
            )}

            {/* Table Rows */}
            {filteredTraces.map(trace => {
              const agentDisplayName = getAgentName(trace)
              return (
                <div
                  key={trace.id}
                  className="group grid items-center px-4 py-2.5 border-b border-surface-2/50 hover:bg-surface-3/30 cursor-pointer transition-colors"
                  style={{ gridTemplateColumns: '28px 32px minmax(120px, 1.5fr) minmax(140px, 2fr) minmax(140px, 2fr) 70px 70px 60px 80px 110px' }}
                  onClick={() => selectTrace(trace)}
                >
                  {/* Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedTraceIds.has(trace.id)}
                      onClick={(e) => toggleTraceSelection(trace.id, e)}
                      onChange={() => {}}
                      className="accent-brand-500"
                    />
                  </div>

                  {/* Status Dot */}
                  <div className="flex justify-center">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusColor(trace.status), boxShadow: `0 0 6px ${statusColor(trace.status)}40` }}
                      title={trace.status}
                    />
                  </div>

                  {/* Name */}
                  <div className="min-w-0 pr-2">
                    <div className="text-xs text-text-primary font-medium truncate">{prettyTraceName(trace.name, t.traces.evalPrefix)}</div>
                    <div className="text-[10px] text-text-muted font-mono truncate">{trace.id.substring(0, 12)}...</div>
                  </div>

                  {/* Input */}
                  <div className="min-w-0 pr-2">
                    <div className="text-[11px] text-text-secondary truncate" title={summarize(trace.input, 200)}>
                      {summarize(trace.input, 50)}
                    </div>
                  </div>

                  {/* Output */}
                  <div className="min-w-0 pr-2">
                    <div className="text-[11px] text-text-secondary truncate" title={summarize(trace.output, 200)}>
                      {summarize(trace.output, 50)}
                    </div>
                  </div>

                  {/* Latency */}
                  <div className="text-right">
                    <span className={`text-[11px] tabular-nums font-medium ${
                      trace.total_latency_ms != null
                        ? trace.total_latency_ms > 10000 ? 'text-red-400' : trace.total_latency_ms > 3000 ? 'text-amber-400' : 'text-cyan-400'
                        : 'text-text-muted'
                    }`}>
                      {fmtLatency(trace.total_latency_ms)}
                    </span>
                  </div>

                  {/* Tokens */}
                  <div className="text-right pr-1">
                    <span className="text-[11px] text-text-secondary tabular-nums">
                      {trace.total_tokens && trace.total_tokens > 0 ? fmtTokens(trace.total_tokens) : '-'}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="min-w-0">
                    {trace.source && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-surface-3/80 text-text-secondary border border-border-light/50 inline-block truncate max-w-full">
                        {sourceLabel(trace.source)}
                      </span>
                    )}
                  </div>

                  {/* Agent */}
                  <div className="min-w-0">
                    {agentDisplayName ? (
                      <span className="text-[10px] text-text-tertiary truncate block">{agentDisplayName}</span>
                    ) : (
                      <span className="text-[10px] text-text-muted">-</span>
                    )}
                  </div>

                  {/* Time */}
                  <div className="text-right flex items-center justify-end gap-1">
                    <span className="text-[10px] text-text-muted">{formatTraceTime(trace.start_time || trace.created_at)}</span>
                    <ChevronRight size={12} className="text-border group-hover:text-text-tertiary transition-colors flex-shrink-0" />
                  </div>
                </div>
              )
            })}

            {!loading && !filteredTraces.length && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl card flex items-center justify-center mx-auto mb-4">
                  <Activity size={28} className="text-text-muted" />
                </div>
                <p className="text-[15px] font-medium text-text-secondary mb-1">{t.traces.noTraces}</p>
                <p className="text-[12px] text-text-muted max-w-sm mx-auto">
                  {activeFilterCount > 0 ? t.traces.noFilterMatch : t.traces.noTracesHint}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TraceToTestCase
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        traceIds={Array.from(selectedTraceIds)}
        suites={testSuites}
        showToast={showToast}
        onSuccess={() => setSelectedTraceIds(new Set())}
      />
    </div>
  )
}
