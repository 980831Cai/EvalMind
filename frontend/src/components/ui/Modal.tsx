import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showClose?: boolean
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({
  open, onClose, title, description, children, footer, size = 'md', showClose = true
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === overlayRef.current && onClose()}
      />
      {/* Dialog */}
      <div className={`
        relative w-full ${sizeMap[size]} bg-surface-2 border border-border-light
        rounded-2xl shadow-modal animate-scale-in overflow-hidden
      `}>
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between px-6 pt-5 pb-0">
            <div>
              {title && <h3 className="text-base font-semibold text-text-primary">{title}</h3>}
              {description && <p className="text-xs text-text-tertiary mt-1">{description}</p>}
            </div>
            {showClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-colors -mr-1"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border bg-surface-3/30 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
