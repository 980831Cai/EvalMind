import { create } from 'zustand'
import type { DashboardStats, ObsStats } from '../types'
import * as api from '../services/api'

const emptyStats: DashboardStats = {
  total_agents: 0, total_test_suites: 0, total_eval_runs: 0, total_eval_results: 0,
  completed_runs: 0, failed_runs: 0, running_runs: 0,
  avg_score: 0, avg_latency_ms: 0,
  dimension_averages: {}, agent_stats: [], recent_runs: [],
}

const emptyObsStats: ObsStats = {
  total_traces: 0, total_observations: 0,
  trace_latency_table: [], generation_latency_table: [], span_latency_table: [],
  model_latency_table: [], model_usage_table: [],
}

interface MonitorState {
  stats: DashboardStats
  obsStats: ObsStats
  obsStatsLoading: boolean
  loadDashboard: (agentId?: string) => Promise<void>
  loadObsStats: (agentId?: string) => Promise<void>
}

export const useMonitorStore = create<MonitorState>((set) => ({
  stats: emptyStats,
  obsStats: emptyObsStats,
  obsStatsLoading: false,
  loadDashboard: async (agentId?: string) => {
    try {
      const stats = await api.fetchDashboard(agentId)
      set({ stats })
    } catch {
      // silent
    }
  },
  loadObsStats: async (agentId?: string) => {
    set({ obsStatsLoading: true })
    try {
      const obsStats = await api.fetchObsStats(agentId)
      set({ obsStats })
    } catch {
      // silent
    } finally {
      set({ obsStatsLoading: false })
    }
  },
}))
