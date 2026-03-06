export function scoreColor(s: number): string {
  if (s >= 0.8) return '#22c55e'
  if (s >= 0.6) return '#f59e0b'
  if (s > 0) return '#ef4444'
  return '#52525b'
}

export function formatNumber(n: number | undefined | null): string {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function formatTime(t: string | undefined | null): string {
  if (!t) return '-'
  try {
    const d = new Date(t)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return t
  }
}

export function formatTraceTime(ts: string | undefined | null): string {
  if (!ts) return '-'
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

export function statusBadge(s: string): string {
  const map: Record<string, string> = {
    completed: 'badge-green',
    running: 'badge-yellow',
    failed: 'badge-red',
    pending: 'badge-gray',
    cancelled: 'badge-gray',
  }
  return map[s] || 'badge-gray'
}

export function statusText(s: string): string {
  const map: Record<string, string> = {
    completed: '已完成',
    running: '运行中',
    failed: '失败',
    pending: '等待中',
    cancelled: '已取消',
  }
  return map[s] || s
}

const DIM_LABELS: Record<string, string> = {
  accuracy: '准确性', completeness: '完整性', helpfulness: '实用性',
  relevance: '相关性', safety: '安全性', instruction_following: '指令遵循', tool_usage: '工具使用',
  trajectory_tool_selection: '工具选择', trajectory_param_accuracy: '参数准确',
  trajectory_order: '调用顺序', trajectory_efficiency: '执行效率', trajectory_error_recovery: '错误恢复',
  hallucination: '幻觉检测', privacy: '隐私保护', tone_style: '语气风格',
  code_quality: '代码质量', citation_quality: '引用质量', context_utilization: '上下文利用',
  answer_relevancy: '回答相关度', faithfulness: '忠实度', coherence: '逻辑连贯性', tool_correctness: '工具正确性',
}
const DIM_DESCS: Record<string, string> = {
  accuracy: '信息是否正确', completeness: '是否覆盖所有方面', helpfulness: '是否有实际帮助',
  relevance: '是否紧扣主题', safety: '是否安全无害', instruction_following: '是否按要求回答', tool_usage: '工具选择是否合理',
  trajectory_tool_selection: '每步是否选了对的工具', trajectory_param_accuracy: '工具参数是否正确完整',
  trajectory_order: '步骤执行顺序是否合理', trajectory_efficiency: '是否有冗余或遗漏步骤', trajectory_error_recovery: '异常时是否合理补救',
  hallucination: '是否包含编造事实', privacy: '是否泄露隐私信息', tone_style: '语气风格是否合适',
  code_quality: '代码是否正确高效', citation_quality: '引用是否准确', context_utilization: '是否有效利用上下文',
  answer_relevancy: '回答与问题是否相关（免参考）', faithfulness: '回答是否忠于上下文（免参考）',
  coherence: '推理逻辑是否连贯（免参考）', tool_correctness: '工具使用是否正确（免参考）',
}
export function dimensionLabel(d: string): string { return DIM_LABELS[d] || d }
export function dimensionDesc(d: string): string { return DIM_DESCS[d] || '' }

export const ALL_DIMENSIONS = ['accuracy', 'completeness', 'helpfulness', 'relevance', 'safety', 'instruction_following', 'tool_usage']
export const ALL_TRAJECTORY_DIMENSIONS = ['trajectory_tool_selection', 'trajectory_param_accuracy', 'trajectory_order', 'trajectory_efficiency', 'trajectory_error_recovery']

export function stepTypeColor(t: string): string {
  return ({ thinking: '#a78bfa', tool_call: '#60a5fa', tool_result: '#34d399', text_output: '#fbbf24' } as Record<string, string>)[t] || '#71717a'
}
export function stepTypeIcon(t: string): string {
  return ({ thinking: '🧠', tool_call: '🔧', tool_result: '📋', text_output: '💬' } as Record<string, string>)[t] || '●'
}
export function stepTypeLabel(t: string): string {
  return ({ thinking: '思考', tool_call: '工具调用', tool_result: '工具结果', text_output: '文本输出' } as Record<string, string>)[t] || t
}

const MODEL_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']
export function modelColor(model: string): string {
  let hash = 0
  for (let i = 0; i < (model || '').length; i++) hash = model.charCodeAt(i) + ((hash << 5) - hash)
  return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length]
}

// ===== 断言类型标签 =====
const ASSERTION_TYPE_LABELS: Record<string, string> = {
  contains: '包含', not_contains: '不包含', regex_match: '正则匹配',
  exact_match: '精确匹配', starts_with: '开头匹配', ends_with: '结尾匹配',
  json_valid: 'JSON合法', max_length: '最大长度', min_length: '最小长度',
  tool_called: '工具已调用', tool_not_called: '工具未调用',
  tool_count_max: '工具调用上限', tool_count_min: '工具调用下限',
  latency_max: '延迟上限', token_max: 'Token上限', semantic_match: '语义匹配',
}
export function assertionTypeLabel(t: string): string { return ASSERTION_TYPE_LABELS[t] || t }

const ASSERTION_TYPE_COLORS: Record<string, string> = {
  contains: '#60a5fa', not_contains: '#60a5fa', regex_match: '#a78bfa',
  exact_match: '#a78bfa', starts_with: '#60a5fa', ends_with: '#60a5fa',
  json_valid: '#34d399', max_length: '#fbbf24', min_length: '#fbbf24',
  tool_called: '#06b6d4', tool_not_called: '#06b6d4',
  tool_count_max: '#06b6d4', tool_count_min: '#06b6d4',
  latency_max: '#f59e0b', token_max: '#f59e0b', semantic_match: '#ec4899',
}
export function assertionTypeColor(t: string): string { return ASSERTION_TYPE_COLORS[t] || '#71717a' }

// ===== 回归变化颜色 =====
export function regressionLevelColor(level: string): string {
  const map: Record<string, string> = {
    improved: '#22c55e',
    stable: '#71717a',
    slight_degradation: '#f59e0b',
    severe_degradation: '#ef4444',
  }
  return map[level] || '#71717a'
}
export function regressionLevelLabel(level: string): string {
  const map: Record<string, string> = {
    improved: '改善', stable: '持平', slight_degradation: '轻微退化', severe_degradation: '严重退化',
  }
  return map[level] || level
}

// ===== 雷达图坐标计算 =====
export function radarPoints(values: number[], cx: number, cy: number, radius: number): string {
  const n = values.length
  if (n === 0) return ''
  return values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const r = radius * Math.min(Math.max(v, 0), 1)
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
  }).join(' ')
}

// ===== 模板类别 =====
const CATEGORY_LABELS: Record<string, string> = {
  generic: '通用', customer_service: '客服', coding: '代码', rag: 'RAG', ops_troubleshooting: '运维排障',
}
const CATEGORY_COLORS: Record<string, string> = {
  generic: '#6366f1', customer_service: '#06b6d4', coding: '#22c55e', rag: '#f59e0b', ops_troubleshooting: '#ef4444',
}
export function categoryLabel(c: string): string { return CATEGORY_LABELS[c] || c }
export function categoryColor(c: string): string { return CATEGORY_COLORS[c] || '#71717a' }

// ===== 健康状态 =====
export function healthColor(h: string): string {
  const map: Record<string, string> = { healthy: '#22c55e', warning: '#f59e0b', degraded: '#ef4444', critical: '#dc2626' }
  return map[h] || '#71717a'
}
export function healthLabel(h: string): string {
  const map: Record<string, string> = { healthy: '健康', warning: '警告', degraded: '退化', critical: '严重' }
  return map[h] || h
}

// ===== 评分方法标签 =====
export function scoringMethodLabel(m: string): string {
  const map: Record<string, string> = { code: '确定性', llm: 'LLM', hybrid: '混合', g_eval: 'G-Eval', rule_tree: '规则树' }
  return map[m] || m
}
export function scoringMethodColor(m: string): string {
  const map: Record<string, string> = { code: '#22c55e', llm: '#a78bfa', hybrid: '#06b6d4', g_eval: '#ec4899', rule_tree: '#f59e0b' }
  return map[m] || '#71717a'
}
