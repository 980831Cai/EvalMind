import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null; showStack: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showStack: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    const { error, showStack } = this.state

    return (
      <div className="flex items-center justify-center min-h-[400px] p-8 animate-fade-in">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center">
            <AlertTriangle size={28} className="text-danger-400" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p className="text-sm text-text-tertiary mb-6">{error?.message || 'An unexpected error occurred'}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-all hover:shadow-glow-brand-sm"
            >
              <RefreshCw size={14} />
              Reload Page
            </button>
            {error?.stack && (
              <button
                onClick={() => this.setState(s => ({ showStack: !s.showStack }))}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {showStack ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Details
              </button>
            )}
          </div>
          {showStack && error?.stack && (
            <pre className="mt-4 p-4 bg-surface-3 rounded-lg text-xs text-text-tertiary text-left overflow-auto max-h-48 border border-border">
              {error.stack}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
