import type { ApiClient } from './api'
import type { AuthFile, AuthFilesResponse, CodexQuota, CopilotQuota, TestResult, UsageResponse } from '@/types/api'
import { useCredStore } from '@/store/credStore'

export async function uploadAuthFile(
  client: ApiClient,
  file: File
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file, file.name)
  await client.upload<{ status?: string }>('/auth-files', formData)
}



export async function fetchAuthFiles(client: ApiClient): Promise<AuthFile[]> {
  const res = await client.get<AuthFilesResponse>('/auth-files')
  return res.files ?? []
}

export async function deleteAuthFile(
  client: ApiClient,
  name: string
): Promise<void> {
  await client.delete('/auth-files', { name })
}

export async function deleteAllAuthFiles(client: ApiClient): Promise<number> {
  const res = await client.delete<{ deleted?: number }>('/auth-files', { all: 'true' })
  return res.deleted ?? 0
}

export async function patchAuthFileStatus(
  client: ApiClient,
  name: string,
  disabled: boolean
): Promise<void> {
  await client.patch('/auth-files/status', { name, disabled })
}

export async function fetchUsage(client: ApiClient): Promise<UsageResponse> {
  return client.get<UsageResponse>('/usage')
}

interface ApiCallResponse {
  status_code: number
  header: Record<string, string[]>
  body: string
}

const CODEX_USAGE_CHALLENGE_MAX_RETRIES = 3
const CODEX_USAGE_CHALLENGE_BASE_DELAY_MS = 1200
const CODEX_USAGE_TRANSIENT_MAX_RETRIES = 3
const CODEX_USAGE_TRANSIENT_BASE_DELAY_MS = 1200

function getHeaderValues(headers: Record<string, string[]>, name: string): string[] {
  const target = name.toLowerCase()
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return values
  }
  return []
}

function isCloudflareChallenge(res: ApiCallResponse): boolean {
  const cfMitigated = getHeaderValues(res.header, 'cf-mitigated').join(',').toLowerCase()
  if (cfMitigated.includes('challenge')) return true

  const setCookie = getHeaderValues(res.header, 'set-cookie').join(',').toLowerCase()
  if (setCookie.includes('__cf_bm=') || setCookie.includes('cf_clearance=')) {
    if (res.status_code === 403 || res.status_code === 429 || res.status_code === 503) {
      return true
    }
  }

  const contentType = getHeaderValues(res.header, 'content-type').join(',').toLowerCase()
  const body = res.body.toLowerCase()

  if (contentType.includes('text/html')) {
    if (body.includes('just a moment') || body.includes('/cdn-cgi/challenge-platform') || body.includes('_cf_chl_opt')) {
      return true
    }
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getCodexChallengeDelayMs(retryIndex: number): number {
  return CODEX_USAGE_CHALLENGE_BASE_DELAY_MS * (retryIndex + 1)
}

function getCodexTransientDelayMs(retryIndex: number): number {
  return CODEX_USAGE_TRANSIENT_BASE_DELAY_MS * (retryIndex + 1)
}

function getChallengeBlockedMessage(retryCount: number): string {
  if (retryCount <= 0) return 'Cloudflare challenge blocked usage endpoint'
  return `Cloudflare challenge blocked usage endpoint after ${retryCount} retries`
}

function isRetryableCodexUsageError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return true

  const message = err.message.toLowerCase()
  return message.includes('networkerror')
    || message.includes('failed to fetch')
    || message.includes('operation was aborted')
    || message.includes('network request failed')
    || message.includes('load failed')
}

async function requestCodexUsage(client: ApiClient, authFile: AuthFile): Promise<ApiCallResponse> {
  return client.post<ApiCallResponse>('/api-call', {
    auth_index: authFile.auth_index,
    method: 'GET',
    url: 'https://chatgpt.com/backend-api/codex/usage',
    header: {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'User-Agent': 'codex_cli_rs/0.101.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464',
      Version: '0.101.0',
      Originator: 'codex_cli_rs',
    },
  })
}

async function requestCodexUsageWithChallengeRetry(
  client: ApiClient,
  authFile: AuthFile
): Promise<{ response: ApiCallResponse; challengeRetries: number; transientRetries: number }> {
  const { setTestStatus } = useCredStore.getState()
  let challengeRetries = 0
  let transientRetries = 0

  while (true) {
    try {
      const response = await requestCodexUsage(client, authFile)

      if (isCloudflareChallenge(response) && challengeRetries < CODEX_USAGE_CHALLENGE_MAX_RETRIES) {
        setTestStatus(authFile.name, 'retrying')
        await sleep(getCodexChallengeDelayMs(challengeRetries))
        challengeRetries += 1
        continue
      }

      return { response, challengeRetries, transientRetries }
    } catch (err) {
      if (!isRetryableCodexUsageError(err) || transientRetries >= CODEX_USAGE_TRANSIENT_MAX_RETRIES) {
        if (transientRetries > 0) {
          const message = err instanceof Error ? err.message : String(err)
          throw new Error(`usage request failed after ${transientRetries} retries: ${message}`)
        }
        throw err
      }

      setTestStatus(authFile.name, 'retrying')
      await sleep(getCodexTransientDelayMs(transientRetries))
      transientRetries += 1
    }
  }
}

export async function testAuthFile(
  client: ApiClient,
  authFile: AuthFile
): Promise<TestResult> {
  const provider = (authFile.provider || authFile.type || '').toLowerCase()

  if (provider === 'github-copilot' || provider === 'copilot') {
    return testCopilotFile(client, authFile)
  }

  return testCodexFile(client, authFile)
}

async function testCodexFile(
  client: ApiClient,
  authFile: AuthFile
): Promise<TestResult> {
  const now = Date.now()

  try {
    const initialAttempt = await requestCodexUsageWithChallengeRetry(client, authFile)
    const res = initialAttempt.response

    if (isCloudflareChallenge(res)) {
      return {
        status: 'error',
        statusCode: res.status_code,
        message: getChallengeBlockedMessage(initialAttempt.challengeRetries),
        testedAt: now,
      }
    }

    if (res.status_code === 401 || res.status_code === 403) {
      try {
        const retryAttempt = await requestCodexUsageWithChallengeRetry(client, authFile)
        const retry = retryAttempt.response

        if (isCloudflareChallenge(retry)) {
          return {
            status: 'error',
            statusCode: retry.status_code,
            message: getChallengeBlockedMessage(retryAttempt.challengeRetries),
            testedAt: now,
          }
        }

        if (retry.status_code === 401 || retry.status_code === 403) {
          return { status: 'expired', statusCode: retry.status_code, testedAt: now }
        }
        if (retry.status_code === 429) {
          return { status: 'quota', statusCode: 429, testedAt: now }
        }
        if (retry.status_code !== 200) {
          return { status: 'error', statusCode: retry.status_code, message: retry.body.slice(0, 120), testedAt: now }
        }

        let retryQuota: CodexQuota | undefined
        try {
          retryQuota = JSON.parse(retry.body) as CodexQuota
        } catch {
          return { status: 'valid', statusCode: 200, testedAt: now }
        }

        const retryRateLimit = retryQuota.rate_limit
        if (!retryRateLimit.allowed || retryRateLimit.limit_reached) {
          return { status: 'quota', statusCode: 200, testedAt: now, quota: retryQuota }
        }

        return { status: 'valid', statusCode: 200, testedAt: now, quota: retryQuota }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'retry failed'
        return { status: 'error', statusCode: res.status_code, message: `auth retry failed: ${message}`, testedAt: now }
      }
    }

    if (res.status_code === 429) {
      return { status: 'quota', statusCode: 429, testedAt: now }
    }

    if (res.status_code !== 200) {
      return { status: 'error', statusCode: res.status_code, message: res.body.slice(0, 120), testedAt: now }
    }

    let quota: CodexQuota | undefined
    try {
      quota = JSON.parse(res.body) as CodexQuota
    } catch {
      return { status: 'valid', statusCode: 200, testedAt: now }
    }

    const rl = quota.rate_limit
    if (!rl.allowed || rl.limit_reached) {
      return { status: 'quota', statusCode: 200, testedAt: now, quota }
    }

    return { status: 'valid', statusCode: 200, testedAt: now, quota }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return { status: 'error', message, testedAt: now }
  }
}

async function testCopilotFile(
  client: ApiClient,
  authFile: AuthFile
): Promise<TestResult> {
  const now = Date.now()
  const baseHeader = {
    Authorization: 'Bearer $TOKEN$',
    'User-Agent': 'GitHubCopilot/1.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    const res = await client.post<ApiCallResponse>('/api-call', {
      auth_index: authFile.auth_index,
      method: 'GET',
      url: 'https://api.github.com/user',
      header: baseHeader,
    })

    if (res.status_code === 401 || res.status_code === 403) {
      return { status: 'expired', statusCode: res.status_code, testedAt: now }
    }

    if (res.status_code === 429) {
      return { status: 'quota', statusCode: 429, testedAt: now }
    }

    if (res.status_code !== 200) {
      return { status: 'error', statusCode: res.status_code, message: res.body.slice(0, 120), testedAt: now }
    }

    try {
      const quotaRes = await client.post<ApiCallResponse>('/api-call', {
        auth_index: authFile.auth_index,
        method: 'GET',
        url: 'https://api.github.com/copilot_internal/user',
        header: {
          Authorization: 'Bearer $TOKEN$',
          Accept: 'application/json',
          'User-Agent': 'GitHubCopilotChat/0.26.7',
          'x-github-api-version': '2025-04-01',
        },
      })

      if (quotaRes.status_code === 200) {
        const copilotQuota = JSON.parse(quotaRes.body) as CopilotQuota
        const snap = copilotQuota.quota_snapshots?.premium_interactions
        const remaining = snap?.remaining ?? snap?.quota_remaining ?? 0
        const entitlement = snap?.entitlement ?? 0
        if (!snap?.unlimited && entitlement > 0 && remaining === 0) {
          return { status: 'quota', statusCode: 200, testedAt: now, copilotQuota }
        }
        return { status: 'valid', statusCode: 200, testedAt: now, copilotQuota }
      }

      return { status: 'valid', statusCode: 200, testedAt: now, message: `quota ${quotaRes.status_code}: ${quotaRes.body.slice(0, 80)}` }
    } catch (e) {
      return { status: 'valid', statusCode: 200, testedAt: now, message: `quota err: ${e instanceof Error ? e.message : String(e)}` }
    }

    return { status: 'valid', statusCode: 200, testedAt: now }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return { status: 'error', message, testedAt: now }
  }
}
