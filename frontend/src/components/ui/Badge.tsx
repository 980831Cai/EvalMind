import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'outline'
  | 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'gray' // backward compat aliases
type BadgeSize = 'sm' | 'md'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-4/80 text-text-secondary border-border',
  brand: 'bg-brand-500/15 text-brand-400 border-brand-500/20',
  success: 'bg-success-500/15 text-success-400 border-success-500/20',
  danger: 'bg-danger-500/15 text-danger-400 border-danger-500/20',
  warning: 'bg-warn-500/15 text-warn-400 border-warn-500/20',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  outline: 'bg-transparent text-text-secondary border-border-light',
  // Aliases
  green: 'bg-success-500/15 text-success-400 border-success-500/20',
  red: 'bg-danger-500/15 text-danger-400 border-danger-500/20',
  yellow: 'bg-warn-500/15 text-warn-400 border-warn-500/20',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  gray: 'bg-surface-4/80 text-text-secondary border-border',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
}

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  dotColor?: string
  className?: string
}

export default function Badge({ children, variant = 'default', size = 'md', dot, dotColor, className = '' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center gap-1.5 font-medium rounded-full border whitespace-nowrap
      ${variantStyles[variant]} ${sizeStyles[size]} ${className}
    `}>
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor || 'currentColor' }} />}
      {children}
    </span>
  )
}
