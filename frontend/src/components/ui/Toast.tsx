import { useEffect } from 'react'
import { CheckCircle2, XCircle, AlertCircle, X, Info } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  onClose: () => void
  duration?: number
}

const icons = {
  success: <CheckCircle2 size={16} className="text-success-400 shrink-0" />,
  error: <XCircle size={16} className="text-danger-400 shrink-0" />,
  warning: <AlertCircle size={16} className="text-warn-400 shrink-0" />,
  info: <Info size={16} className="text-brand-400 shrink-0" />,
}

const borderColors = {
  success: 'border-success-500/30',
  error: 'border-danger-500/30',
  warning: 'border-warn-500/30',
  info: 'border-brand-500/30',
}

export default function Toast({ message, type = 'info', onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  return (
    <div className={`
      fixed bottom-6 right-6 z-[100] flex items-center gap-3
      px-4 py-3 rounded-xl glass-strong shadow-float max-w-md
      border ${borderColors[type]} animate-fade-up
    `}>
      {icons[type]}
      <span className="text-sm text-text-primary flex-1">{message}</span>
      <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors p-0.5 shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}
