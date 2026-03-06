import React, { useState, useCallback } from 'react'
import type { Agent, AgentInsights, InsightItem } from '../types'
import * as api from '../services/api'
import { Lightbulb, AlertTriangle, AlertCircle, Info, RefreshCw, ChevronRight, Zap, Wrench, Brain, Gauge, Star } from 'lucide-react'

interface Props {
  agents: Agent[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const SEVERITY_CONFIG: Record<string, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  critical: {
    icon: <AlertCircle size={16} className="text-red-400" />,
    bg: 'bg-red-950/30', border: 'border-red-800/50', text: 'text-red-400',
  },
  warning: {
    icon: <AlertTriangle size={16} className="text-yellow-400" />,
    bg: 'bg-yellow-950/30', border: 'border-yellow-800/50', text: 'text-yellow-400',
  },
  info: {
    icon: <Info size={16} className="text-blue-400" />,
    bg: 'bg-blue-950/30', border: 'border-blue-800/50', text: 'text-blue-400',
  },
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  prompt_optimization: { icon: <Brain size={14} />, label: 'Prompt 优化' },
  tool_usage: { icon: <Wrench size={14} />, label: '工具使用' },
  model_selection: { icon: <Star size={14} />, label: '模型选择' },
  performance: { icon: <Gauge size={14} />, label: '性能优化' },
  quality: { icon: <Zap size={14} />, label: '质量分析' },
}

export default function InsightsPage({ agents, showToast }: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [insights, setInsights] = useState<AgentInsights | null>(null)
  const [loading, setLoading] = useState(false)

  const loadInsights = useCallback(async (agentId: string) => {
    if (!agentId) return
    setLoading(true)
    try {
      const data = await api.fetchAgentInsights(agentId)
      setInsights(data)
    } catch (e: unknown) {
      showToast((e as Error).message, 'error')
    }
    setLoading(false)
  }, [showToast])

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id)
    if (id) loadInsights(id)
    else setInsights(null)
  }

  const renderInsightCard = (item: InsightItem, idx: number) => {
    const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info
    const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.quality

    return (
      <div key={idx} className={`${sev.bg} border ${sev.border} rounded-xl p-4 space-y-2`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {sev.icon}
            <h3 className={`text-sm font-medium ${sev.text}`}>{item.title}</h3>
          </div>
          <span className="flex items-center gap-1 text-[11px] text-text-tertiary bg-surface-3/50 px-2 py-0.5 rounded">
            {typeConf.icon} {typeConf.label}
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{item.description}</p>
        <div className="flex items-start gap-2 pt-1">
          <Lightbulb size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300/80">{item.suggestion}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb size={24} className="text-amber-400" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">智能优化建议</h1>
            <p className="text-sm text-text-tertiary">基于评测历史自动分析，生成 Prompt/工具/模型/性能优化建议</p>
          </div>
        </div>
      </div>

      {/* Agent Selector */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary flex-shrink-0">选择 Agent</label>
          <select
            className="flex-1 bg-surface-3 border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary outline-none"
            value={selectedAgentId}
            onChange={e => handleSelectAgent(e.target.value)}
          >
            <option value="">-- 选择要分析的 Agent --</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>)}
          </select>
          {selectedAgentId && (
            <button
              onClick={() => loadInsights(selectedAgentId)}
              disabled={loading}
              className="px-3 py-2 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg flex items-center gap-1.5 text-text-secondary"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!selectedAgentId && (
        <div className="card p-12 text-center">
          <ChevronRight size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-tertiary">请先选择一个 Agent 来查看优化建议</p>
        </div>
      )}

      {loading && (
        <div className="card p-12 text-center">
          <RefreshCw size={24} className="text-text-tertiary mx-auto mb-3 animate-spin" />
          <p className="text-sm text-text-tertiary">正在分析评测数据...</p>
        </div>
      )}

      {!loading && insights && (
        <>
          {/* Summary */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium text-text-primary">{insights.agent_name}</h2>
              <span className="text-xs text-text-tertiary">共 {insights.total_runs} 次评测</span>
            </div>
            <p className={`text-sm ${
              insights.insights.some(i => i.severity === 'critical') ? 'text-red-400' :
              insights.insights.some(i => i.severity === 'warning') ? 'text-yellow-400' :
              'text-emerald-400'
            }`}>
              {insights.summary}
            </p>

            {insights.insights.length > 0 && (
              <div className="flex gap-3 mt-3">
                {(['critical', 'warning', 'info'] as const).map(sev => {
                  const count = insights.insights.filter(i => i.severity === sev).length
                  if (!count) return null
                  const conf = SEVERITY_CONFIG[sev]
                  return (
                    <span key={sev} className={`flex items-center gap-1 text-xs ${conf.text}`}>
                      {conf.icon} {count}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Insights List */}
          {insights.insights.length > 0 ? (
            <div className="space-y-3">
              {/* Critical first, then warning, then info */}
              {['critical', 'warning', 'info'].flatMap(sev =>
                insights.insights
                  .filter(i => i.severity === sev)
                  .map((item, idx) => renderInsightCard(item, idx))
              )}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <Lightbulb size={28} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-tertiary">暂无优化建议 — 需要更多评测数据</p>
              <p className="text-xs text-text-muted mt-1">建议先运行至少 2 次评测后再查看</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
