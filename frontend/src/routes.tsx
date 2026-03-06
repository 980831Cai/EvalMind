import React, { Suspense, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { useAppStore } from './store/useAppStore'
import { useEvalStore } from './store/useEvalStore'
import { useTraceStore } from './store/useTraceStore'
import { useMonitorStore } from './store/useMonitorStore'

const HomePageLazy = React.lazy(() => import('./pages/HomePage'))
const MonitorPageLazy = React.lazy(() => import('./pages/MonitorPage'))
const TracesPageLazy = React.lazy(() => import('./pages/TracesPage'))
const ScoresPageLazy = React.lazy(() => import('./pages/ScoresPage'))
const AgentsPageLazy = React.lazy(() => import('./pages/AgentsPage'))
const TestSuitesPageLazy = React.lazy(() => import('./pages/TestSuitesPage'))
const EvalCenterPageLazy = React.lazy(() => import('./pages/EvalCenterPage'))
const SettingsPageLazy = React.lazy(() => import('./pages/SettingsPage'))
const EvalFrameworkPageLazy = React.lazy(() => import('./pages/EvalFrameworkPage'))
const ComparisonPageLazy = React.lazy(() => import('./pages/ComparisonPage'))
const BadCasePageLazy = React.lazy(() => import('./pages/BadCasePage'))
const SkillsAnalysisPageLazy = React.lazy(() => import('./pages/SkillsAnalysisPage'))
const PlaygroundPageLazy = React.lazy(() => import('./pages/PlaygroundPage'))
const ExperimentPageLazy = React.lazy(() => import('./pages/ExperimentPage'))
const InsightsPageLazy = React.lazy(() => import('./pages/InsightsPage'))
const OnlineEvalPageLazy = React.lazy(() => import('./pages/OnlineEvalPage'))
const AnnotationPageLazy = React.lazy(() => import('./pages/AnnotationPage'))
const GeneStorePageLazy = React.lazy(() => import('./pages/GeneStorePage'))
const EvolutionPageLazy = React.lazy(() => import('./pages/EvolutionPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    </div>
  )
}

function RouteErrorBoundary() {
  return (
    <div className="flex items-center justify-center h-full p-8 animate-fade-in">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Page Load Failed</h2>
        <p className="text-sm text-text-tertiary mb-6">An error occurred while loading the page</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-all hover:shadow-glow-brand-sm"
        >
          Refresh Page
        </button>
      </div>
    </div>
  )
}

// ===== Page Wrappers: 路由驱动数据加载，为页面组件提供 props =====

function HomePageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const stats = useMonitorStore((s) => s.stats)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const navigate = useNavigate()

  useEffect(() => {
    loadAgents()
    loadDashboard()
    loadTestSuites()
  }, [loadAgents, loadDashboard, loadTestSuites])

  return (
    <Suspense fallback={<PageFallback />}>
      <HomePageLazy
        stats={stats}
        agents={agents}
        testSuites={testSuites}
        onNewEval={() => navigate('/eval-center')}
        onGoAgents={() => navigate('/agents')}
        onGoTestSuites={() => navigate('/test-suites')}
      />
    </Suspense>
  )
}

function MonitorPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const stats = useMonitorStore((s) => s.stats)
  const obsStats = useMonitorStore((s) => s.obsStats)
  const obsStatsLoading = useMonitorStore((s) => s.obsStatsLoading)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const loadObsStats = useMonitorStore((s) => s.loadObsStats)
  const navigate = useNavigate()

  useEffect(() => {
    loadAgents()
    loadDashboard()
    loadObsStats()
  }, [loadAgents, loadDashboard, loadObsStats])

  const handleRefresh = useCallback((agentId?: string) => {
    loadDashboard(agentId)
    loadObsStats(agentId)
  }, [loadDashboard, loadObsStats])

  const handleViewTrace = useCallback((traceId: string) => {
    useTraceStore.getState().setInitialTraceId(traceId)
    navigate('/traces')
  }, [navigate])

  return (
    <Suspense fallback={<PageFallback />}>
      <MonitorPageLazy
        stats={stats}
        obsStats={obsStats}
        obsStatsLoading={obsStatsLoading}
        agents={agents}
        onRefresh={handleRefresh}
        onViewTrace={handleViewTrace}
      />
    </Suspense>
  )
}

function TracesPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const traces = useTraceStore((s) => s.traces)
  const tracesLoading = useTraceStore((s) => s.tracesLoading)
  const initialTraceId = useTraceStore((s) => s.initialTraceId)
  const loadTraces = useTraceStore((s) => s.loadTraces)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadTestSuites()
    loadTraces()
  }, [loadAgents, loadTestSuites, loadTraces])

  return (
    <Suspense fallback={<PageFallback />}>
      <TracesPageLazy
        traces={traces}
        loading={tracesLoading}
        agents={agents}
        testSuites={testSuites}
        onRefresh={loadTraces}
        initialTraceId={initialTraceId}
        showToast={showToast}
      />
    </Suspense>
  )
}

function ScoresPageWrapper() {
  const stats = useMonitorStore((s) => s.stats)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)

  useEffect(() => { loadDashboard() }, [loadDashboard])

  return (
    <Suspense fallback={<PageFallback />}>
      <ScoresPageLazy stats={stats} />
    </Suspense>
  )
}

function AgentsPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  const handleRefresh = useCallback(() => {
    loadAgents()
    loadDashboard()
  }, [loadAgents, loadDashboard])

  return (
    <Suspense fallback={<PageFallback />}>
      <AgentsPageLazy agents={agents} onRefresh={handleRefresh} showToast={showToast} />
    </Suspense>
  )
}

function TestSuitesPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
    loadTestSuites()
  }, [loadAgents, loadModelConfigs, loadTestSuites])

  const handleRefresh = useCallback(() => {
    loadTestSuites()
    loadDashboard()
  }, [loadTestSuites, loadDashboard])

  return (
    <Suspense fallback={<PageFallback />}>
      <TestSuitesPageLazy
        suites={testSuites}
        agents={agents}
        modelConfigs={modelConfigs}
        onRefresh={handleRefresh}
        showToast={showToast}
      />
    </Suspense>
  )
}

function EvalCenterPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const evalRuns = useEvalStore((s) => s.evalRuns)
  const loadEvalRuns = useEvalStore((s) => s.loadEvalRuns)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
    loadEvalRuns()
    loadTestSuites()
  }, [loadAgents, loadModelConfigs, loadEvalRuns, loadTestSuites])

  const handleRefresh = useCallback(() => {
    loadEvalRuns()
    loadDashboard()
  }, [loadEvalRuns, loadDashboard])

  return (
    <Suspense fallback={<PageFallback />}>
      <EvalCenterPageLazy
        runs={evalRuns}
        agents={agents}
        suites={testSuites}
        configs={modelConfigs}
        onRefresh={handleRefresh}
        showToast={showToast}
      />
    </Suspense>
  )
}

function SettingsPageWrapper() {
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const loadDashboard = useMonitorStore((s) => s.loadDashboard)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadModelConfigs() }, [loadModelConfigs])

  const handleRefresh = useCallback(() => {
    loadModelConfigs()
    loadDashboard()
  }, [loadModelConfigs, loadDashboard])

  return (
    <Suspense fallback={<PageFallback />}>
      <SettingsPageLazy configs={modelConfigs} onRefresh={handleRefresh} showToast={showToast} />
    </Suspense>
  )
}

function EvalFrameworkPageWrapper() {
  const showToast = useAppStore((s) => s.showToast)
  return (
    <Suspense fallback={<PageFallback />}>
      <EvalFrameworkPageLazy showToast={showToast} />
    </Suspense>
  )
}

function ComparisonPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
    loadTestSuites()
  }, [loadAgents, loadModelConfigs, loadTestSuites])

  return (
    <Suspense fallback={<PageFallback />}>
      <ComparisonPageLazy agents={agents} suites={testSuites} modelConfigs={modelConfigs} showToast={showToast} />
    </Suspense>
  )
}

function BadCasePageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadTestSuites()
  }, [loadAgents, loadTestSuites])

  return (
    <Suspense fallback={<PageFallback />}>
      <BadCasePageLazy agents={agents} suites={testSuites} showToast={showToast} />
    </Suspense>
  )
}

function SkillsAnalysisPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  return (
    <Suspense fallback={<PageFallback />}>
      <SkillsAnalysisPageLazy agents={agents} showToast={showToast} />
    </Suspense>
  )
}

function PlaygroundPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
  }, [loadAgents, loadModelConfigs])

  return (
    <Suspense fallback={<PageFallback />}>
      <PlaygroundPageLazy agents={agents} modelConfigs={modelConfigs} showToast={showToast} />
    </Suspense>
  )
}

function ExperimentPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const testSuites = useEvalStore((s) => s.testSuites)
  const loadTestSuites = useEvalStore((s) => s.loadTestSuites)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
    loadTestSuites()
  }, [loadAgents, loadModelConfigs, loadTestSuites])

  return (
    <Suspense fallback={<PageFallback />}>
      <ExperimentPageLazy agents={agents} suites={testSuites} modelConfigs={modelConfigs} showToast={showToast} />
    </Suspense>
  )
}

function InsightsPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  return (
    <Suspense fallback={<PageFallback />}>
      <InsightsPageLazy agents={agents} showToast={showToast} />
    </Suspense>
  )
}

function OnlineEvalPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const modelConfigs = useAppStore((s) => s.modelConfigs)
  const loadModelConfigs = useAppStore((s) => s.loadModelConfigs)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    loadAgents()
    loadModelConfigs()
  }, [loadAgents, loadModelConfigs])

  return (
    <Suspense fallback={<PageFallback />}>
      <OnlineEvalPageLazy agents={agents} modelConfigs={modelConfigs} showToast={showToast} />
    </Suspense>
  )
}

function AnnotationPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  return (
    <Suspense fallback={<PageFallback />}>
      <AnnotationPageLazy agents={agents} showToast={showToast} />
    </Suspense>
  )
}

function GeneStorePageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  return (
    <Suspense fallback={<PageFallback />}>
      <GeneStorePageLazy agents={agents} showToast={showToast} />
    </Suspense>
  )
}

function EvolutionPageWrapper() {
  const agents = useAppStore((s) => s.agents)
  const loadAgents = useAppStore((s) => s.loadAgents)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => { loadAgents() }, [loadAgents])

  return (
    <Suspense fallback={<PageFallback />}>
      <EvolutionPageLazy agents={agents} showToast={showToast} />
    </Suspense>
  )
}

// ===== Route Configuration =====
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomePageWrapper /> },
      { path: 'monitor', element: <MonitorPageWrapper /> },
      { path: 'traces', element: <TracesPageWrapper /> },
      { path: 'traces/:traceId', element: <TracesPageWrapper /> },
      { path: 'scores', element: <ScoresPageWrapper /> },
      { path: 'agents', element: <AgentsPageWrapper /> },
      { path: 'agents/:agentId', element: <AgentsPageWrapper /> },
      { path: 'test-suites', element: <TestSuitesPageWrapper /> },
      { path: 'eval-center', element: <EvalCenterPageWrapper /> },
      { path: 'eval-center/:runId', element: <EvalCenterPageWrapper /> },
      { path: 'settings', element: <SettingsPageWrapper /> },
      { path: 'eval-framework', element: <EvalFrameworkPageWrapper /> },
      { path: 'comparisons', element: <ComparisonPageWrapper /> },
      { path: 'bad-cases', element: <BadCasePageWrapper /> },
      { path: 'skills-analysis', element: <SkillsAnalysisPageWrapper /> },
      { path: 'playground', element: <PlaygroundPageWrapper /> },
      { path: 'experiments', element: <ExperimentPageWrapper /> },
      { path: 'insights', element: <InsightsPageWrapper /> },
      { path: 'online-eval', element: <OnlineEvalPageWrapper /> },
      { path: 'annotations', element: <AnnotationPageWrapper /> },
      { path: 'gene-store', element: <GeneStorePageWrapper /> },
      { path: 'evolution', element: <EvolutionPageWrapper /> },
    ],
  },
]
