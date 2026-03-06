import { create } from 'zustand'
import type { EvalRun, TestSuite } from '../types'
import * as api from '../services/api'

interface EvalState {
  // Eval Runs
  evalRuns: EvalRun[]
  evalRunsLoading: boolean
  loadEvalRuns: () => Promise<void>

  // Test Suites
  testSuites: TestSuite[]
  testSuitesLoading: boolean
  loadTestSuites: () => Promise<void>
}

export const useEvalStore = create<EvalState>((set, get) => ({
  // Eval Runs
  evalRuns: [],
  evalRunsLoading: false,
  loadEvalRuns: async () => {
    if (get().evalRunsLoading) return
    set({ evalRunsLoading: true })
    try {
      const evalRuns = await api.fetchEvalRuns()
      set({ evalRuns })
    } catch {
      // silent
    } finally {
      set({ evalRunsLoading: false })
    }
  },

  // Test Suites
  testSuites: [],
  testSuitesLoading: false,
  loadTestSuites: async () => {
    if (get().testSuitesLoading) return
    set({ testSuitesLoading: true })
    try {
      const testSuites = await api.fetchTestSuites()
      set({ testSuites })
    } catch {
      // silent
    } finally {
      set({ testSuitesLoading: false })
    }
  },
}))
