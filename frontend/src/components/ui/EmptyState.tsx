import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title?: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-surface-3/60 border border-border flex items-center justify-center mb-4">
        {icon || <Inbox size={24} className="text-text-muted" />}
      </div>
      {title && <h3 className="text-sm font-semibold text-text-secondary mb-1">{title}</h3>}
      {description && <p className="text-xs text-text-muted text-center max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
