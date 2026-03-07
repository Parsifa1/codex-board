export type AuthStatus =
  | 'unknown'
  | 'active'
  | 'pending'
  | 'refreshing'
  | 'error'
  | 'disabled'

export interface AuthFile {
  id: string
  auth_index: string
  name: string
  type: string
  provider: string
  label?: string
  status: AuthStatus
  status_message?: string
  disabled: boolean
  unavailable: boolean
  runtime_only: boolean
  source: 'file' | 'memory'
  size: number
  email?: string
  account_type?: string
  account?: string
  created_at?: string
  modtime?: string
  updated_at?: string
  last_refresh?: string
  next_retry_after?: string
  path?: string
  id_token?: Record<string, unknown>
}

export interface AuthFilesResponse {
  files: AuthFile[]
}

export type TestStatus =
  | 'unknown'
  | 'queued'
  | 'testing'
  | 'retrying'
  | 'valid'
  | 'quota'
  | 'expired'
  | 'error'

export interface CodexRateWindow {
  used_percent: number
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
}

export interface CodexRateLimit {
  allowed: boolean
  limit_reached: boolean
  primary_window: CodexRateWindow | null
  secondary_window: CodexRateWindow | null
}

export interface CodexQuota {
  plan_type: string
  rate_limit: CodexRateLimit
}

export interface CopilotQuotaSnapshot {
  entitlement?: number
  remaining?: number
  quota_remaining?: number
  percent_remaining?: number
  unlimited?: boolean
  overage_permitted?: boolean
}

export interface CopilotQuota {
  copilot_plan?: string
  quota_reset_date?: string
  quota_snapshots?: {
    premium_interactions?: CopilotQuotaSnapshot
    chat?: CopilotQuotaSnapshot
    completions?: CopilotQuotaSnapshot
  }
}

export interface TestResult {
  status: TestStatus
  statusCode?: number
  message?: string
  testedAt: number
  quota?: CodexQuota
  copilotQuota?: CopilotQuota
}

export interface UsageStats {
  total_requests: number
  success_count: number
  failure_count: number
  total_tokens: number
  requests_by_day: Record<string, number>
  requests_by_hour: Record<string, number>
  tokens_by_day: Record<string, number>
  tokens_by_hour: Record<string, number>
}

export interface UsageResponse {
  usage: UsageStats
  failed_requests: number
}

export interface ConnectionConfig {
  endpoint: string
  managementKey: string
  useProxy: boolean
}
