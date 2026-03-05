import { create } from 'zustand'
import { createClient, type ApiClient } from '@/lib/api'
import { loadTestResults, saveTestResults } from '@/lib/storage'
import type { AuthFile, ConnectionConfig, TestResult } from '@/types/api'

interface CredStore {
  connection: ConnectionConfig | null
  connected: boolean
  client: ApiClient | null

  files: AuthFile[]
  loading: boolean
  refreshing: boolean

  testResults: Record<string, TestResult>

  selected: Set<string>

  setConnection: (config: ConnectionConfig) => void
  disconnect: () => void
  setFiles: (files: AuthFile[]) => void
  updateFile: (name: string, updated: Partial<AuthFile>) => void
  removeFile: (name: string) => void
  setTestResult: (name: string, result: TestResult) => void
  setTestStatus: (name: string, status: 'testing') => void
  toggleSelect: (name: string) => void
  selectAll: (names: string[]) => void
  clearSelection: () => void
  setLoading: (v: boolean) => void
  setRefreshing: (v: boolean) => void
}

export const useCredStore = create<CredStore>((set) => ({
  connection: null,
  connected: false,
  client: null,

  files: [],
  loading: false,
  refreshing: false,

  testResults: {},
  selected: new Set<string>(),

  setConnection: (config) => {
    const client = createClient(config.endpoint, config.managementKey, config.useProxy)
    const testResults = loadTestResults(config.endpoint)
    set({ connection: config, connected: true, client, testResults })
  },

  disconnect: () =>
    set({
      connection: null,
      connected: false,
      client: null,
      files: [],
      testResults: {},
      selected: new Set<string>(),
    }),

  setFiles: (files) => set({ files }),

  updateFile: (name, updated) =>
    set((state) => {
      const files = state.files.map((f) => (f.name === name ? { ...f, ...updated } : f))
      const nextTestResults = { ...state.testResults }

      if (Object.prototype.hasOwnProperty.call(updated, 'status') || Object.prototype.hasOwnProperty.call(updated, 'disabled')) {
        delete nextTestResults[name]
      }

      if (state.connection?.endpoint) {
        saveTestResults(state.connection.endpoint, nextTestResults)
      }

      return { files, testResults: nextTestResults }
    }),

  removeFile: (name) =>
    set((state) => {
      const nextSelected = new Set(state.selected)
      nextSelected.delete(name)
      const nextTestResults = { ...state.testResults }
      delete nextTestResults[name]
      if (state.connection?.endpoint) {
        saveTestResults(state.connection.endpoint, nextTestResults)
      }
      return {
        files: state.files.filter((f) => f.name !== name),
        selected: nextSelected,
        testResults: nextTestResults,
      }
    }),

  setTestResult: (name, result) =>
    set((state) => {
      const testResults = { ...state.testResults, [name]: result }
      if (state.connection?.endpoint) {
        saveTestResults(state.connection.endpoint, testResults)
      }
      return { testResults }
    }),

  setTestStatus: (name, status) =>
    set((state) => ({
      testResults: {
        ...state.testResults,
        [name]: {
          ...(state.testResults[name] ?? {}),
          status,
          testedAt: Date.now(),
        },
      },
    })),

  toggleSelect: (name) =>
    set((state) => {
      const next = new Set(state.selected)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { selected: next }
    }),

  selectAll: (names) =>
    set((state) => {
      const next = new Set(state.selected)
      names.forEach((n) => next.add(n))
      return { selected: next }
    }),

  clearSelection: () => set({ selected: new Set<string>() }),

  setLoading: (v) => set({ loading: v }),

  setRefreshing: (v) => set({ refreshing: v }),
}))
