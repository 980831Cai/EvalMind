import React, { useState, useEffect, useCallback } from 'react'
import type { Score, TraceDetail } from '../types'
import * as api from '../services/api'
import ScoreBadge from './ScoreBadge'
import { Star, Plus, Send, Award, CheckCircle, XCircle } from 'lucide-react'

interface ScorePanelProps {
  traceId: string
  spanId?: string | null
  showToast: (message: string, type?: 'success' | 'error') => void
  traceDetail?: TraceDetail | null
}

const QUICK_DIMENSIONS = [
  { name: 'accuracy', label: '准确性', type: 'numeric' as const },
  { name: 'helpfulness', label: '实用性', type: 'numeric' as const },
  { name: 'safety', label: '安全性', type: 'numeric' as const },
  { name: 'relevance', label: '相关性', type: 'numeric' as const },
  { name: 'user_satisfaction', label: '用户满意度', type: 'categorical' as const, options: ['positive', 'negative', 'neutral'] },
]

export default function ScorePanel({ traceId, spanId, showToast, traceDetail }: ScorePanelProps) {
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(false)

  // 新建评分表单
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<'numeric' | 'categorical'>('numeric')
  const [formValue, setFormValue] = useState(0.8)
  const [formStringValue, setFormStringValue] = useState('')
  const [formComment, setFormComment] = useState('')
  const [formAuthor, setFormAuthor] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadScores = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.fetchTraceScores(traceId)
      setScores(data)
    } catch {
      /* silent */
    }
    setLoading(false)
  }, [traceId])

  useEffect(() => { loadScores() }, [loadScores])

  const handleSubmit = useCallback(async () => {
    if (!formName.trim()) { showToast('请输入评分维度名称', 'error'); return }
    setSubmitting(true)
    try {
      await api.createScore({
        trace_id: traceId,
        span_id: spanId || undefined,
        name: formName.trim(),
        value: formType === 'numeric' ? formValue : undefined,
        string_value: formType === 'categorical' ? formStringValue : undefined,
        comment: formComment || undefined,
        author: formAuthor || undefined,
        source: 'manual',
      })
      showToast('评分已提交')
      setShowForm(false)
      setFormName('')
      setFormValue(0.8)
      setFormStringValue('')
      setFormComment('')
      loadScores()
    } catch (e) {
      showToast('评分提交失败', 'error')
    }
    setSubmitting(false)
  }, [traceId, spanId, formName, formType, formValue, formStringValue, formComment, formAuthor, showToast, loadScores])

  const handleQuickScore = useCallback(async (dim: typeof QUICK_DIMENSIONS[0], val: number | string) => {
    try {
      await api.createScore({
        trace_id: traceId,
        span_id: spanId || undefined,
        name: dim.name,
        value: typeof val === 'number' ? val : undefined,
        string_value: typeof val === 'string' ? val : undefined,
        source: 'manual',
      })
      showToast(`${dim.label} 已评分`)
      loadScores()
    } catch {
      showToast('评分失败', 'error')
    }
  }, [traceId, spanId, showToast, loadScores])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteScore(id)
      loadScores()
    } catch {
      showToast('删除失败', 'error')
    }
  }, [loadScores, showToast])

  // Dimension label mapping
  const dimLabel = (d: string): string => ({
    accuracy: '准确性', completeness: '完整性', helpfulness: '实用性',
    relevance: '相关性', safety: '安全性', instruction_following: '指令遵循',
    tool_usage: '工具使用', hallucination: '幻觉检测', privacy: '隐私保护',
    tone_style: '语气风格', code_quality: '代码质量', citation_quality: '引用质量',
    context_utilization: '上下文利用', answer_relevancy: '回答相关度',
    faithfulness: '忠实度', coherence: '逻辑连贯性', tool_correctness: '工具正确性',
  }[d] || d)

  const scoreBarColor = (v: number) => v >= 0.8 ? '#22c55e' : v >= 0.6 ? '#f59e0b' : v >= 0.4 ? '#f97316' : '#ef4444'

  // Check if trace is from eval
  const evalResults = traceDetail?.eval_results?.filter(er => er.scores && Object.keys(er.scores).length > 0) || []
  const isEvalTrace = traceDetail?.source === 'eval' || evalResults.length > 0

  return (
    <div className="space-y-4">
      {/* LLM 评测评分 — 仅在评测触发的 Trace 中展示 */}
      {isEvalTrace && evalResults.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 mb-2">
            <Award size={12} className="text-purple-400" />
            LLM 评测评分
            <span className="text-text-muted">({evalResults.length} 次评测)</span>
          </div>
          {evalResults.map((er, idx) => (
            <div key={er.id} className="bg-surface-2 border border-border rounded-lg p-4 mb-2">
              {/* Overall score header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="text-lg font-bold tabular-nums"
                    style={{ color: scoreBarColor(er.overall_score) }}
                  >
                    {(er.overall_score * 100).toFixed(0)}%
                  </div>
                  {er.passed ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle size={10} /> 通过
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                      <XCircle size={10} /> 未通过
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-text-muted font-mono">{er.id.substring(0, 8)}</span>
              </div>

              {/* Dimension scores */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(er.scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([dim, val]) => (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="text-[11px] text-text-secondary w-[80px] flex-shrink-0 truncate" title={dim}>
                      {dimLabel(dim)}
                    </span>
                    <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(val * 100, 100)}%`,
                          backgroundColor: scoreBarColor(val),
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-semibold tabular-nums w-[36px] text-right"
                      style={{ color: scoreBarColor(val) }}
                    >
                      {(val * 100).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Reasoning */}
              {er.reasoning && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-[10px] text-text-tertiary mb-1">评测理由</div>
                  <div className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{er.reasoning}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 已有评分 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <Star size={12} className="text-amber-400" />
            已有评分
            {scores.length > 0 && <span className="text-text-muted">({scores.length})</span>}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 border border-brand-600/30 transition-colors"
          >
            <Plus size={11} /> 添加评分
          </button>
        </div>

        {loading && <div className="text-[11px] text-text-muted py-3 text-center">加载中...</div>}

        {!loading && scores.length === 0 && (
          <div className="text-[11px] text-text-muted py-4 text-center border border-dashed border-border rounded-lg">
            暂无评分，点击上方按钮添加
          </div>
        )}

        {!loading && scores.length > 0 && (
          <div className="space-y-1.5">
            {scores.map(s => (
              <ScoreBadge key={s.id} score={s} onDelete={() => handleDelete(s.id)} />
            ))}
          </div>
        )}
      </div>

      {/* 快速评分 */}
      {!showForm && (
        <div>
          <div className="text-xs font-semibold text-text-secondary mb-2">快速评分</div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_DIMENSIONS.filter(d => d.type === 'numeric').map(dim => (
              <div key={dim.name} className="bg-surface-2 border border-border rounded-lg p-2.5">
                <div className="text-[11px] text-text-secondary mb-1.5">{dim.label}</div>
                <div className="flex gap-1">
                  {[0.2, 0.4, 0.6, 0.8, 1.0].map(v => (
                    <button
                      key={v}
                      onClick={() => handleQuickScore(dim, v)}
                      className={`flex-1 py-1 text-[10px] rounded font-medium transition-colors ${
                        v >= 0.8 ? 'bg-emerald-950 text-emerald-400 hover:bg-emerald-900'
                        : v >= 0.6 ? 'bg-yellow-950 text-yellow-400 hover:bg-yellow-900'
                        : v >= 0.4 ? 'bg-orange-950 text-orange-400 hover:bg-orange-900'
                        : 'bg-red-950 text-red-400 hover:bg-red-900'
                      }`}
                    >
                      {(v * 100).toFixed(0)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {QUICK_DIMENSIONS.filter(d => d.type === 'categorical').map(dim => (
              <div key={dim.name} className="bg-surface-2 border border-border rounded-lg p-2.5 col-span-2">
                <div className="text-[11px] text-text-secondary mb-1.5">{dim.label}</div>
                <div className="flex gap-1.5">
                  {(dim.options || []).map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleQuickScore(dim, opt)}
                      className={`px-3 py-1 text-[11px] rounded-md font-medium transition-colors ${
                        opt === 'positive' ? 'bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800'
                        : opt === 'negative' ? 'bg-red-950 text-red-400 hover:bg-red-900 border border-red-800'
                        : 'bg-surface-3 text-text-secondary hover:bg-surface-4 border border-border-light'
                      }`}
                    >
                      {opt === 'positive' ? '👍 正面' : opt === 'negative' ? '👎 负面' : '😐 中立'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 自定义评分表单 */}
      {showForm && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-text-secondary mb-1">自定义评分</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-text-tertiary mb-1 block">维度名称 *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="如: accuracy, quality"
                className="w-full px-2.5 py-1.5 text-xs bg-surface-3 border border-border-light rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-tertiary mb-1 block">评分类型</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value as 'numeric' | 'categorical')}
                className="w-full px-2.5 py-1.5 text-xs bg-surface-3 border border-border-light rounded-md text-text-primary focus:outline-none focus:border-brand-500"
              >
                <option value="numeric">数值型 (0-1)</option>
                <option value="categorical">分类型</option>
              </select>
            </div>
          </div>

          {formType === 'numeric' ? (
            <div>
              <label className="text-[11px] text-text-tertiary mb-1 block">分值: {formValue.toFixed(2)}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={formValue}
                onChange={e => setFormValue(parseFloat(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                <span>0</span><span>0.5</span><span>1.0</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-text-tertiary mb-1 block">分类值</label>
              <input
                value={formStringValue}
                onChange={e => setFormStringValue(e.target.value)}
                placeholder="如: positive, negative, neutral"
                className="w-full px-2.5 py-1.5 text-xs bg-surface-3 border border-border-light rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] text-text-tertiary mb-1 block">标注人</label>
            <input
              value={formAuthor}
              onChange={e => setFormAuthor(e.target.value)}
              placeholder="你的名字"
              className="w-full px-2.5 py-1.5 text-xs bg-surface-3 border border-border-light rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="text-[11px] text-text-tertiary mb-1 block">备注</label>
            <textarea
              value={formComment}
              onChange={e => setFormComment(e.target.value)}
              placeholder="评分理由（可选）"
              rows={2}
              className="w-full px-2.5 py-1.5 text-xs bg-surface-3 border border-border-light rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-md bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              <Send size={11} /> {submitting ? '提交中...' : '提交评分'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
