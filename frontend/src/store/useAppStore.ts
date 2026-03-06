import { createContext, useContext } from 'react'
import { create } from 'zustand'
import type { Agent, ModelConfig } from '../types'
import * as api from '../services/api'

// ===== Legacy types (保持向后兼容) =====
export type Page = 'home' | 'monitor' | 'traces' | 'scores' | 'agents' | 'test-suites' | 'eval-center' | 'settings' | 'eval-framework' | 'comparisons' | 'bad-cases' | 'skills-analysis' | 'playground' | 'experiments' | 'insights' | 'online-eval' | 'annotations'

export interface Toast {
  message: string
  type: 'success' | 'error'
}

// ===== Legacy context (渐进迁移期间保留) =====
export interface AppContextValue {
  page: Page
  setPage: (p: Page) => void
  showToast: (message: string, type?: 'success' | 'error') => void
}

export const AppContext = createContext<AppContextValue>({
  page: 'home',
  setPage: () => {},
  showToast: () => {},
})

export const useApp = () => useContext(AppContext)

// ===== Zustand Store =====
interface AppState {
  // Toast
  toast: Toast | null
  toastTimer: ReturnType<typeof setTimeout> | null
  showToast: (message: string, type?: 'success' | 'error') => void
  clearToast: () => void

  // Agents (全局共享)
  agents: Agent[]
  agentsLoading: boolean
  loadAgents: () => Promise<void>

  // Model Configs (全局共享)
  modelConfigs: ModelConfig[]
  modelConfigsLoading: boolean
  loadModelConfigs: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Toast
  toast: null,
  toastTimer: null,
  showToast: (message, type = 'success') => {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => set({ toast: null, toastTimer: null }), 3000)
    set({ toast: { message, type }, toastTimer: timer })
  },
  clearToast: () => {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    set({ toast: null, toastTimer: null })
  },

  // Agents
  agents: [],
  agentsLoading: false,
  loadAgents: async () => {
    if (get().agentsLoading) return
    set({ agentsLoading: true })
    try {
      const agents = await api.fetchAgents()
      set({ agents })
    } catch {
      // silent
    } finally {
      set({ agentsLoading: false })
    }
  },

  // Model Configs
  modelConfigs: [],
  modelConfigsLoading: false,
  loadModelConfigs: async () => {
    if (get().modelConfigsLoading) return
    set({ modelConfigsLoading: true })
    try {
      const modelConfigs = await api.fetchModelConfigs()
      set({ modelConfigs })
    } catch {
      // silent
    } finally {
      set({ modelConfigsLoading: false })
    }
  },
}))
