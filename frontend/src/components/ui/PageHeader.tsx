import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <div className="page-header flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
