import { useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { Assertion } from '../../types'
import { assertionTypeLabel, assertionTypeColor } from '../../utils/helpers'

const ASSERTION_TYPES = [
  'contains', 'not_contains', 'regex_match', 'exact_match', 'starts_with', 'ends_with',
  'json_valid', 'max_length', 'min_length',
  'tool_called', 'tool_not_called', 'tool_count_max', 'tool_count_min',
  'latency_max', 'token_max', 'semantic_match',
]

const NO_VALUE_TYPES = ['json_valid']

interface AssertionEditorProps {
  assertions: Assertion[]
  onChange: (assertions: Assertion[]) => void
  compact?: boolean
}

export default function AssertionEditor({ assertions, onChange, compact = false }: AssertionEditorProps) {
  const [expanded, setExpanded] = useState(!compact || assertions.length > 0)

  const addAssertion = () => {
    onChange([...assertions, { type: 'contains', value: '', critical: false }])
  }

  const removeAssertion = (index: number) => {
    onChange(assertions.filter((_, i) => i !== index))
  }

  const updateAssertion = (index: number, field: keyof Assertion, value: unknown) => {
    const updated = [...assertions]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <Plus size={12} />
        添加断言 ({assertions.length})
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          断言规则 ({assertions.length})
        </span>
        <button
          onClick={addAssertion}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
        >
          <Plus size={12} />
          添加
        </button>
      </div>

      {assertions.map((a, i) => (
        <div key={i} className="flex items-center gap-2 bg-surface-2/50 rounded-lg px-3 py-2 border border-border">
          {/* Type selector */}
          <select
            value={a.type}
            onChange={(e) => updateAssertion(i, 'type', e.target.value)}
            className="bg-surface-3 border border-border-light rounded px-2 py-1 text-xs text-text-secondary min-w-[120px] focus:outline-none focus:border-brand-500"
            style={{ borderLeftColor: assertionTypeColor(a.type), borderLeftWidth: 3 }}
          >
            {ASSERTION_TYPES.map((t) => (
              <option key={t} value={t}>{assertionTypeLabel(t)}</option>
            ))}
          </select>

          {/* Value input */}
          {!NO_VALUE_TYPES.includes(a.type) && (
            <input
              type="text"
              value={String(a.value ?? '')}
              onChange={(e) => updateAssertion(i, 'value', e.target.value)}
              placeholder="值..."
              className="flex-1 bg-surface-3 border border-border-light rounded px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-brand-500"
            />
          )}

          {/* Critical toggle */}
          <button
            onClick={() => updateAssertion(i, 'critical', !a.critical)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              a.critical
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-surface-3 text-text-tertiary border border-border-light hover:text-text-secondary'
            }`}
            title="关键断言：失败将跳过 LLM 评分"
          >
            <AlertTriangle size={11} />
            {a.critical ? '关键' : '普通'}
          </button>

          {/* Delete */}
          <button
            onClick={() => removeAssertion(i)}
            className="text-text-muted hover:text-red-400 transition-colors p-1"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {assertions.length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">
          暂无断言规则，点击"添加"创建
        </p>
      )}
    </div>
  )
}
