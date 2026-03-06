import { useState, useRef, useEffect, type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
  badge?: number | string
}

interface TabsProps {
  tabs: Tab[]
  activeTab?: string
  onChange?: (id: string) => void
  variant?: 'underline' | 'pills'
  className?: string
}

export default function Tabs({ tabs, activeTab, onChange, variant = 'underline', className = '' }: TabsProps) {
  const [active, setActive] = useState(activeTab ?? tabs[0]?.id ?? '')
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const current = activeTab ?? active

  useEffect(() => {
    const el = tabRefs.current.get(current)
    const container = containerRef.current
    if (el && container) {
      const cr = container.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      setIndicator({ left: er.left - cr.left, width: er.width })
    }
  }, [current])

  const handleClick = (id: string) => {
    setActive(id)
    onChange?.(id)
  }

  if (variant === 'pills') {
    return (
      <div className={`flex items-center gap-1 p-1 bg-surface-3/50 rounded-lg border border-border ${className}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleClick(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              ${current === tab.id
                ? 'bg-surface-4 text-text-primary shadow-sm border border-border-light'
                : 'text-text-secondary hover:text-text-primary'}
            `}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-1 px-1.5 py-0 rounded-full bg-surface-5 text-[10px] text-text-muted">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative flex items-center gap-0 border-b border-border ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          ref={el => { if (el) tabRefs.current.set(tab.id, el) }}
          onClick={() => handleClick(tab.id)}
          className={`
            relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors duration-150
            ${current === tab.id ? 'text-brand-400' : 'text-text-secondary hover:text-text-primary'}
          `}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && (
            <span className={`ml-1 px-1.5 rounded-full text-[10px] ${current === tab.id ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-4 text-text-muted'}`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
      {/* Animated indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-brand-500 rounded-full transition-all duration-200 ease-spring"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  )
}
