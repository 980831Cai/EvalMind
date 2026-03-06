import { useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAppStore, AppContext } from '../../store/useAppStore'
import { useEvalStore } from '../../store/useEvalStore'
import { useTraceStore } from '../../store/useTraceStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useLocationPage } from '../../hooks/useLocationPage'
import { setApiErrorHandler } from '../../services/api'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import Toast from '../ui/Toast'

export { AppContext }

export default function Layout() {
  const { page, setPage } = useLocationPage()
  const agents = useAppStore((s) => s.agents)
  const testSuites = useEvalStore((s) => s.testSuites)
  const traces = useTraceStore((s) => s.traces)
  const stats = useMonitorStore((s) => s.stats)
  const toast = useAppStore((s) => s.toast)
  const showToast = useAppStore((s) => s.showToast)
  const clearToast = useAppStore((s) => s.clearToast)

  useEffect(() => {
    setApiErrorHandler((err) => {
      showToast(err.message, 'error')
    })
  }, [showToast])

  // Fix Ctrl+A / Cmd+A in IDE embedded browser
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  const handleTracesClick = useCallback(() => {
    setPage('traces')
  }, [setPage])

  return (
    <AppContext.Provider value={{ page, setPage, showToast }}>
      <div className="flex h-screen overflow-hidden bg-surface-1">
        <Sidebar
          agentCount={agents.length}
          testSuiteCount={testSuites.length}
          traceCount={traces.length}
          runningRuns={stats?.running_runs}
          onTracesClick={handleTracesClick}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-surface-1">
          {/* Multi-layer ambient background */}
          <div className="fixed inset-0 pointer-events-none gradient-hero opacity-25" />
          <div className="fixed inset-0 pointer-events-none bg-grid opacity-15" />
          <div className="fixed inset-0 pointer-events-none bg-noise opacity-40" />
          <div className="relative z-10">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={clearToast}
          />
        )}
      </div>
    </AppContext.Provider>
  )
}
