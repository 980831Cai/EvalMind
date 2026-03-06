import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  glow?: boolean
  padding?: boolean
}

export function Card({ children, hover, glow, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        ${glow ? 'card-glow' : hover ? 'card-hover' : 'card'}
        ${padding ? 'p-5' : ''} ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, icon, className = '' }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {icon}
      <h3 className="text-sm font-semibold text-text-primary">{children}</h3>
    </div>
  )
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
