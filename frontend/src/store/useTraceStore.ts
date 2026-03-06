import { create } from 'zustand'
import type { TraceRecord } from '../types'
import * as api from '../services/api'

interface TraceState {
  traces: TraceRecord[]
  tracesLoading: boolean
  initialTraceId: string | null
  setInitialTraceId: (id: string | null) => void
  loadTraces: (agentId?: string, name?: string) => Promise<void>
}

export const useTraceStore = create<TraceState>((set, get) => ({
  traces: [],
  tracesLoading: false,
  initialTraceId: null,
  setInitialTraceId: (id) => set({ initialTraceId: id }),
  loadTraces: async (agentId?: string, name?: string) => {
    if (get().tracesLoading) return
    set({ tracesLoading: true })
    try {
      const resp = await api.fetchTraces({ limit: 100, agent_id: agentId, name })
      set({ traces: resp.data || [] })
    } catch {
      // silent
    } finally {
      set({ tracesLoading: false })
    }
  },
}))
