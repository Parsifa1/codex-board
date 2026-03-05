import type { ConnectionConfig, TestResult } from '@/types/api'

const STORAGE_KEY = 'cliproxy_connection'

export function saveConnection(config: ConnectionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function loadConnection(): ConnectionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>
    if (
      typeof parsed.endpoint === 'string' &&
      typeof parsed.managementKey === 'string' &&
      typeof parsed.useProxy === 'boolean'
    ) {
      return parsed as ConnectionConfig
    }
    return null
  } catch {
    return null
  }
}

export function clearConnection(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function testResultsKey(endpoint: string): string {
  return `cliproxy_results_${endpoint}`
}

export function saveTestResults(endpoint: string, results: Record<string, TestResult>): void {
  try {
    localStorage.setItem(testResultsKey(endpoint), JSON.stringify(results))
  } catch {
  }
}

export function loadTestResults(endpoint: string): Record<string, TestResult> {
  try {
    const raw = localStorage.getItem(testResultsKey(endpoint))
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, TestResult>
  } catch {
    return {}
  }
}

export function clearTestResults(endpoint: string): void {
  localStorage.removeItem(testResultsKey(endpoint))
}
