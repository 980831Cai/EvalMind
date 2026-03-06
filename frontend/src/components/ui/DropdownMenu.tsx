import { useState, useRef, useEffect, type ReactNode } from 'react'

interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface DropdownMenuProps {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
}

export default function DropdownMenu({ trigger, items, align = 'right' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div className={`
          absolute top-full mt-1.5 z-50 min-w-[160px]
          bg-surface-3 border border-border-light rounded-xl shadow-float
          py-1.5 animate-scale-in
          ${align === 'right' ? 'right-0' : 'left-0'}
        `}>
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false) }}
              disabled={item.disabled}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors
                ${item.danger
                  ? 'text-danger-400 hover:bg-danger-500/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-4/60'}
                ${item.disabled ? 'opacity-40 pointer-events-none' : ''}
              `}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
