import { useState, useEffect } from 'react'
import { Wrench, Play, Trash2, ChevronDown, ChevronUp, Shield, BookOpen } from 'lucide-react'
import type { SkillsAnalysis, Agent } from '../types'
import * as api from '../services/api'
import { healthColor, healthLabel, formatTime } from '../utils/helpers'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'

interface Props {
  agents: Agent[]
  showToast: (msg: string, type?: 'success' | 'error') => void
}

export default function SkillsAnalysisPage({ agents, showToast }: Props) {
  const [analyses, setAnalyses] = useState<SkillsAnalysis[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewData, setReviewData] = useState<{ design: Record<string, unknown> | null; security: Record<string, unknown> | null }>({ design: null, security: null })

  const load = async () => {
    try {
      const data = await api.fetchSkillsAnalyses(selectedAgent || undefined)
      setAnalyses(data)
    } catch (e: unknown) {
      showToast(`加载数据失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    }
  }

  useEffect(() => { load() }, [selectedAgent])

  const handleTrigger = async () => {
    if (!selectedAgent) return
    setTriggering(true)
    try {
      await api.triggerSkillsAnalysis({ agent_id: selectedAgent })
      showToast('分析已完成')
      load()
    } catch (e: unknown) {
      showToast(`分析失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
    } finally {
      setTriggering(false)
    }
  }

  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (confirmDelId !== id) { setConfirmDelId(id); setTimeout(() => setConfirmDelId(p => p === id ? null : p), 3000); return }
    try {
      await api.deleteSkillsAnalysis(id)
      showToast('已删除'); setConfirmDelId(null)
      load()
    } catch (e: unknown) {
      showToast(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error'); setConfirmDelId(null)
    }
  }

  const getSkillsSummary = (sa: SkillsAnalysis) => {
    const entries = Object.entries(sa.usage_stats)
    const total = entries.length
    const active = entries.filter(([, s]) => s.count > 0).length
    const avgSuccess = entries.length > 0 ? entries.reduce((sum, [, s]) => sum + s.success_rate, 0) / entries.length : 0
    const avgLatency = entries.length > 0 ? entries.reduce((sum, [, s]) => sum + s.p50_ms, 0) / entries.length : 0
    return { total, active, avgSuccess, avgLatency }
  }

  const openReview = (sa: SkillsAnalysis) => {
    setReviewData({ design: sa.design_review, security: sa.security_review })
    setShowReviewModal(true)
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Wrench size={20} /> Skills 健康度分析</h2>
          <p className="text-xs text-text-tertiary mt-1">分析 Agent 的 Skills 调用频率、成功率和健康状态</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="card rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-brand-500" value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
            <option value="">全部 Agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button onClick={handleTrigger} disabled={!selectedAgent || triggering} className="bg-gradient-to-r from-brand-600 to-violet-600 border-0 hover:from-brand-500 hover:to-violet-500">
            <Play size={14} className="mr-1" />{triggering ? '分析中...' : '触发分析'}
          </Button>
        </div>
      </div>

      {analyses.length === 0 ? (
        <EmptyState icon={<Wrench size={36} className="text-text-muted" />} title="暂无分析数据" description="选择 Agent 后点击「触发分析」开始" />
      ) : (
        <div className="space-y-5">
          {analyses.map(sa => {
            const expanded = expandedId === sa.id
            const summary = getSkillsSummary(sa)
            const agentName = agents.find(a => a.id === sa.agent_id)?.name || sa.agent_id
            const entries = Object.entries(sa.usage_stats)

            return (
              <div key={sa.id} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-3/20 transition-colors" onClick={() => setExpandedId(expanded ? null : sa.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{agentName}</span>
                      <span className="text-[11px] text-text-tertiary">{formatTime(sa.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] text-text-tertiary">
                      <span>{summary.total} Skills</span>
                      <span>{summary.active} 活跃</span>
                      <span>平均成功率 {(summary.avgSuccess * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(sa.design_review || sa.security_review) && (
                      <button onClick={e => { e.stopPropagation(); openReview(sa) }} className="text-[11px] text-brand-400 hover:text-brand-300">LLM 评审</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); handleDelete(sa.id) }} className={`flex items-center gap-0.5 transition-colors ${confirmDelId === sa.id ? 'text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded text-[11px]' : 'text-text-tertiary hover:text-red-400'}`}><Trash2 size={14} />{confirmDelId === sa.id && <span className="text-[10px]">确认?</span>}</button>
                    {expanded ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                  </div>
                </div>

                {expanded && (
                  <div className="divider p-5">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      <StatCard label="总 Skills" value={summary.total} />
                      <StatCard label="活跃 Skills" value={summary.active} />
                      <StatCard label="平均成功率" value={`${(summary.avgSuccess * 100).toFixed(0)}%`} color={summary.avgSuccess >= 0.9 ? '#22c55e' : '#f59e0b'} />
                      <StatCard label="平均 P50 延迟" value={`${summary.avgLatency.toFixed(0)}ms`} />
                    </div>

                    {/* Skills Table */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-2/80 text-text-tertiary text-xs">
                            <th className="text-left px-4 py-2.5 font-medium">Skill 名称</th>
                            <th className="text-center px-3 py-2.5 font-medium">调用次数</th>
                            <th className="text-center px-3 py-2.5 font-medium">成功率</th>
                            <th className="text-center px-3 py-2.5 font-medium">P50 延迟</th>
                            <th className="text-right px-4 py-2.5 font-medium">健康状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([name, stat]) => {
                            const hc = healthColor(stat.health)
                            return (
                              <tr key={name} className="divider/60 hover:bg-surface-3/30 transition-colors">
                                <td className="px-4 py-2.5 text-text-primary font-mono text-xs">{name}</td>
                                <td className="text-center px-3 py-2.5 text-text-secondary text-xs">{stat.count}</td>
                                <td className="text-center px-3 py-2.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${stat.success_rate * 100}%`, backgroundColor: stat.success_rate >= 0.9 ? '#22c55e' : stat.success_rate >= 0.7 ? '#f59e0b' : '#ef4444' }} />
                                    </div>
                                    <span className="text-xs text-text-secondary">{(stat.success_rate * 100).toFixed(0)}%</span>
                                  </div>
                                </td>
                                <td className="text-center px-3 py-2.5 text-text-secondary text-xs">{stat.p50_ms.toFixed(0)}ms</td>
                                <td className="text-right px-4 py-2.5">
                                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full" style={{ color: hc, backgroundColor: `${hc}15` }}>
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hc }} />
                                    {healthLabel(stat.health)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* LLM Review Modal */}
      <Modal open={showReviewModal} onClose={() => setShowReviewModal(false)}>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2"><BookOpen size={16} /> LLM 评审报告</h3>
        <div className="grid gap-4 max-h-[70vh] overflow-y-auto">
          {reviewData.design && (
            <div className="bg-surface-0 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5"><BookOpen size={12} /> 设计评审</h4>
              <pre className="text-xs text-text-secondary whitespace-pre-wrap">{JSON.stringify(reviewData.design, null, 2)}</pre>
            </div>
          )}
          {reviewData.security && (
            <div className="bg-surface-0 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-text-secondary uppercase mb-2 flex items-center gap-1.5"><Shield size={12} /> 安全评审</h4>
              <pre className="text-xs text-text-secondary whitespace-pre-wrap">{JSON.stringify(reviewData.security, null, 2)}</pre>
            </div>
          )}
          {!reviewData.design && !reviewData.security && (
            <p className="text-xs text-text-tertiary text-center py-4">暂无 LLM 评审数据</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
