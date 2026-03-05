import { useState } from 'react'
import { useCredStore } from '@/store/credStore'
import { fetchUsage } from '@/lib/management'
import type { UsageResponse } from '@/types/api'

export default function UsagePanel() {
  const client = useCredStore((s) => s.client)
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchUsage(client)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && !data) await load()
  }

  const stats = data?.usage
  const successRate =
    stats && stats.total_requests > 0
      ? Math.round((stats.success_count / stats.total_requests) * 100)
      : 0

  return (
    <div className="bg-surface border border-border rounded-lg shadow-card overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-border/20 transition-colors"
      >
        <span className="text-sm font-medium text-ink">使用统计</span>
        <div className="flex items-center gap-3">
          {expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                load()
              }}
              className="text-2xs text-subtle hover:text-coral transition-colors"
            >
              刷新
            </button>
          )}
          <svg
            className={`w-4 h-4 text-subtle transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 20 20"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          {loading && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-border/50 rounded animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-[#B94040]">{error === 'Failed to load usage' ? '加载使用统计失败' : error}</p>
          )}

          {stats && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="总请求数" value={stats.total_requests.toLocaleString()} />
                <StatTile label="成功" value={stats.success_count.toLocaleString()} />
                <StatTile label="失败" value={stats.failure_count.toLocaleString()} />
                <StatTile
                  label="总 Token 数"
                  value={
                    stats.total_tokens > 999
                      ? `${(stats.total_tokens / 1000).toFixed(1)}k`
                      : stats.total_tokens.toLocaleString()
                  }
                />
              </div>

              {stats.total_requests > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-2xs text-subtle">
                    <span>成功率</span>
                    <span>{successRate}%</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-coral rounded-full transition-all"
                      style={{ width: `${successRate}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-2xs text-subtle">
                统计数据在服务器重启后重置。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas border border-border rounded p-3">
      <div className="text-xs text-subtle mb-1">{label}</div>
      <div className="text-lg font-medium text-ink font-mono-key">{value}</div>
    </div>
  )
}
