import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary: `
    bg-brand-600 text-white border border-brand-500/50
    hover:bg-brand-500 hover:shadow-glow-brand-sm
    active:bg-brand-700
  `,
  secondary: `
    bg-surface-3 text-text-primary border border-border
    hover:bg-surface-4 hover:border-border-light
    active:bg-surface-5
  `,
  ghost: `
    bg-transparent text-text-secondary border border-transparent
    hover:bg-surface-3/60 hover:text-text-primary
    active:bg-surface-4
  `,
  danger: `
    bg-danger-600/80 text-white border border-danger-500/50
    hover:bg-danger-600 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]
    active:bg-danger-700
  `,
  outline: `
    bg-transparent text-text-secondary border border-border
    hover:text-text-primary hover:border-brand-500/40 hover:bg-brand-500/5
    active:bg-brand-500/10
  `,
}

const sizeStyles: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-5 text-sm gap-2 rounded-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, icon, iconRight, children, className = '', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-150 ease-spring
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
)

Button.displayName = 'Button'
export default Button
