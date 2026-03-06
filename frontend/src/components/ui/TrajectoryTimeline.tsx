import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { TrajectoryStep } from '../../types'
import { stepTypeColor, stepTypeIcon, stepTypeLabel } from '../../utils/helpers'

interface Props {
  steps: TrajectoryStep[]
}

export default function TrajectoryTimeline({ steps }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  if (!steps || steps.length === 0) {
    return <div className="text-xs text-text-tertiary text-center py-6">无轨迹数据</div>
  }

  return (
    <div className="relative pl-6">
      {/* 竖线 */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

      {steps.map((step, i) => {
        const color = stepTypeColor(step.step_type)
        const icon = stepTypeIcon(step.step_type)
        const label = stepTypeLabel(step.step_type)
        const isExpanded = expandedIdx === i

        return (
          <div key={i} className="relative mb-2 last:mb-0">
            {/* 圆点 */}
            <div
              className="absolute -left-6 top-2 w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center text-[8px]"
              style={{ borderColor: color, backgroundColor: `${color}20` }}
            >
              <span style={{ fontSize: '8px' }}>{icon}</span>
            </div>

            <div
              className="card border-border/60 rounded-lg px-3 py-2 cursor-pointer hover:border-border-light/60 transition-colors"
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                  >
                    {label}
                  </span>
                  {step.tool_name && (
                    <span className="text-[11px] text-cyan-400 font-mono">{step.tool_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  {step.timestamp_ms > 0 && <span>{step.timestamp_ms}ms</span>}
                  {step.duration_ms > 0 && <span className="text-amber-600">耗时 {step.duration_ms}ms</span>}
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </div>
              </div>

              {/* 摘要（未展开时显示） */}
              {!isExpanded && step.content && (
                <div className="text-[11px] text-text-tertiary mt-1 line-clamp-1">
                  {step.content.slice(0, 120)}
                </div>
              )}

              {/* 展开的完整内容 */}
              {isExpanded && (
                <div className="mt-2 space-y-1.5">
                  {step.content && (
                    <div className="bg-surface-0 rounded p-2 text-[11px] text-text-secondary whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {step.content}
                    </div>
                  )}
                  {step.tool_args && (
                    <div>
                      <span className="text-[10px] text-text-muted uppercase">参数</span>
                      <div className="bg-surface-0 rounded p-2 text-[11px] text-text-secondary font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto mt-0.5">
                        {step.tool_args}
                      </div>
                    </div>
                  )}
                  {step.tool_result && (
                    <div>
                      <span className="text-[10px] text-text-muted uppercase">结果</span>
                      <div className="bg-surface-0 rounded p-2 text-[11px] text-text-secondary whitespace-pre-wrap max-h-[150px] overflow-y-auto mt-0.5">
                        {step.tool_result}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
