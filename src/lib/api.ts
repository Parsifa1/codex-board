const REQUEST_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  delete<T>(path: string, params?: Record<string, string>): Promise<T>
}

function buildBaseUrl(endpoint: string, useProxy: boolean): string {
  if (useProxy) return '/api/management'
  return `${endpoint.replace(/\/$/, '')}/v0/management`
}

async function request<T>(
  baseUrl: string,
  managementKey: string,
  path: string,
  method: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let url = `${baseUrl}${path}`
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString()
    url = `${url}?${qs}`
  }

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

    const text = await res.text()

    if (!res.ok) {
      throw new ApiError(res.status, text, `HTTP ${res.status}: ${text}`)
    }

    return text ? (JSON.parse(text) as T) : ({} as T)
  } finally {
    clearTimeout(timer)
  }
}

export function createClient(
  endpoint: string,
  managementKey: string,
  useProxy: boolean
): ApiClient {
  const baseUrl = buildBaseUrl(endpoint, useProxy)

  return {
    get: <T>(path: string) =>
      request<T>(baseUrl, managementKey, path, 'GET'),
    post: <T>(path: string, body: unknown) =>
      request<T>(baseUrl, managementKey, path, 'POST', body),
    put: <T>(path: string, body: unknown) =>
      request<T>(baseUrl, managementKey, path, 'PUT', body),
    patch: <T>(path: string, body: unknown) =>
      request<T>(baseUrl, managementKey, path, 'PATCH', body),
    delete: <T>(path: string, params?: Record<string, string>) =>
      request<T>(baseUrl, managementKey, path, 'DELETE', undefined, params),
  }
}
