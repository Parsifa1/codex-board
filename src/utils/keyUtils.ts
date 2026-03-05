import type { TestStatus } from '@/types/api'

export function maskKey(key: string): string {
  if (key.length <= 8) return key
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export function parseTestStatusFromCode(statusCode: number): TestStatus {
  if (statusCode === 200) return 'valid'
  if (statusCode === 429) return 'quota'
  if (statusCode === 401 || statusCode === 403) return 'expired'
  return 'error'
}

export function formatRelativeTime(isoString: string | undefined): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function getProviderColor(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower.includes('claude')) return '#C96442'
  if (lower.includes('gemini')) return '#4A90D9'
  if (lower.includes('codex') || lower.includes('openai')) return '#10A37F'
  if (lower.includes('qwen')) return '#7B5EA7'
  if (lower.includes('kiro')) return '#E67E22'
  return '#9A948C'
}
