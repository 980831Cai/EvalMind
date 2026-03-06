import { useState, type ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

const positionStyles = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export default function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className={`absolute z-50 ${positionStyles[side]} pointer-events-none animate-fade-in`}>
          <div className="px-2.5 py-1.5 rounded-lg bg-surface-5 border border-border-light shadow-float text-[11px] text-text-primary whitespace-nowrap">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}
