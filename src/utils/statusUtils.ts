import type { AuthFile, AuthStatus, TestResult, TestStatus } from '@/types/api'

export type EffectiveStatus = TestStatus | AuthStatus

function parseTime(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function getEffectiveStatus(file: AuthFile, testResult: TestResult | undefined): EffectiveStatus {
  if (!testResult) return file.status

  const fileTime = parseTime(file.last_refresh ?? file.updated_at ?? file.modtime)
  if (fileTime !== null && testResult.testedAt < fileTime) {
    return file.status
  }

  return testResult.status
}

export function isExpiredStatus(status: EffectiveStatus): boolean {
  return status === 'expired'
}
