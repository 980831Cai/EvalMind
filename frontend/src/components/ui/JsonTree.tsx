import React, { useState } from 'react'

interface JsonTreeProps {
  data: unknown
  rootLabel?: string
  defaultExpanded?: boolean
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function countItems(v: unknown): number {
  if (isObject(v)) return Object.keys(v).length
  if (isArray(v)) return v.length
  return 0
}

function ValueDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-text-muted italic">null</span>
  if (typeof value === 'boolean') return <span className="text-yellow-400">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-cyan-400">{value}</span>
  if (typeof value === 'string') {
    if (value.length > 500) {
      return <span className="text-green-400">"{value.substring(0, 500)}..."</span>
    }
    return <span className="text-green-400">"{value}"</span>
  }
  return <span className="text-text-secondary">{String(value)}</span>
}

function JsonNode({ keyName, value, depth, defaultExpanded }: { keyName?: string; value: unknown; depth: number; defaultExpanded: boolean }) {
  const expandable = isObject(value) || isArray(value)
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 2)

  if (!expandable) {
    return (
      <div className="flex items-start gap-1.5 py-[3px]" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="text-text-secondary flex-shrink-0">{keyName}</span>
        )}
        <ValueDisplay value={value} />
      </div>
    )
  }

  const items = isArray(value) ? value : Object.entries(value as Record<string, unknown>)
  const count = countItems(value)
  const typeLabel = isArray(value) ? `${count} items` : `${count} items`

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-[3px] cursor-pointer hover:bg-surface-3/40 rounded-sm -mx-1 px-1"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-text-muted text-[10px] w-3 flex-shrink-0 select-none">
          {expanded ? '▼' : '▶'}
        </span>
        {keyName !== undefined && (
          <span className="text-text-secondary flex-shrink-0">{keyName}</span>
        )}
        <span className="text-text-muted text-[11px] ml-1">{typeLabel}</span>
      </div>
      {expanded && (
        <div>
          {isArray(value)
            ? (value as unknown[]).map((item, idx) => (
                <JsonNode key={idx} keyName={String(idx)} value={item} depth={depth + 1} defaultExpanded={defaultExpanded} />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <JsonNode key={k} keyName={k} value={v} depth={depth + 1} defaultExpanded={defaultExpanded} />
              ))
          }
        </div>
      )}
    </div>
  )
}

export default function JsonTree({ data, rootLabel, defaultExpanded = true }: JsonTreeProps) {
  if (data === null || data === undefined) {
    return <div className="text-text-muted text-xs italic py-2">null</div>
  }

  const expandable = isObject(data) || isArray(data)

  if (!expandable) {
    return (
      <div className="text-xs font-mono py-1">
        {rootLabel && <span className="text-text-secondary mr-1.5">{rootLabel}:</span>}
        <ValueDisplay value={data} />
      </div>
    )
  }

  return (
    <div className="text-xs font-mono leading-relaxed">
      {rootLabel ? (
        <JsonNode keyName={rootLabel} value={data} depth={0} defaultExpanded={defaultExpanded} />
      ) : (
        isObject(data)
          ? Object.entries(data).map(([k, v]) => (
              <JsonNode key={k} keyName={k} value={v} depth={0} defaultExpanded={defaultExpanded} />
            ))
          : (data as unknown[]).map((item, idx) => (
              <JsonNode key={idx} keyName={String(idx)} value={item} depth={0} defaultExpanded={defaultExpanded} />
            ))
      )}
    </div>
  )
}
