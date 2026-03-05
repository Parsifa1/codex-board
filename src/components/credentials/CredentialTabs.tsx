import { useState, useMemo, useRef, useEffect } from 'react'
import { useCredStore } from '@/store/credStore'
import { useConnection } from '@/hooks/useConnection'
import { useBatchTest } from '@/hooks/useBatchTest'
import { getProviderColor } from '@/utils/keyUtils'
import { getEffectiveStatus, isExpiredStatus } from '@/utils/statusUtils'
import { deleteAuthFile, patchAuthFileStatus } from '@/lib/management'
import CredentialTable from './CredentialTable'
import type { AuthFile } from '@/types/api'
type SortMode = 'default' | 'quota-first' | 'status-first'
type QuickFilter = 'all' | 'expired' | 'quota' | 'has-quota' | 're-enable'
const SORT_MODE_KEY = 'cliproxy_sort_mode'

function loadSortMode(): SortMode {
  if (typeof window === 'undefined') return 'default'
  const value = window.localStorage.getItem(SORT_MODE_KEY)
  if (value === 'quota-first' || value === 'status-first' || value === 'default') {
    return value
  }
  return 'default'
}

export default function CredentialTabs() {
  const [activeProvider, setActiveProvider] = useState<string>('全部')
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkDisabling, setBulkDisabling] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>(() => loadSortMode())
  const [searchQuery, setSearchQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [bulkProgress, setBulkProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SORT_MODE_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    if (!bulkMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setBulkMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [bulkMenuOpen])

  const files = useCredStore((s) => s.files)
  const testResults = useCredStore((s) => s.testResults)
  const client = useCredStore((s) => s.client)
  const loading = useCredStore((s) => s.loading)
  const refreshing = useCredStore((s) => s.refreshing)
  const { updateFile, removeFile } = useCredStore.getState()
  const { refresh } = useConnection()
  const { testBatch, isRunning, progress } = useBatchTest()

  const providers = useMemo(() => {
    const set = new Set(files.map((f) => f.provider || f.type || '未知'))
    return ['全部', ...Array.from(set).sort()]
  }, [files])

  function getQuotaRemainingPercent(file: AuthFile): number | null {
    const result = testResults[file.name]
    if (result?.quota?.rate_limit.primary_window) {
      const usedPercent = result.quota.rate_limit.primary_window.used_percent ?? 100
      return Math.max(0, Math.min(100, 100 - usedPercent))
    }

    const snap = result?.copilotQuota?.quota_snapshots?.premium_interactions
    if (snap?.unlimited) return 100
    const entitlement = snap?.entitlement ?? 0
    const remaining = snap?.remaining ?? snap?.quota_remaining ?? 0
    if (entitlement > 0) {
      return Math.max(0, Math.min(100, Math.round((remaining / entitlement) * 100)))
    }

    const status = getEffectiveStatus(file, testResults[file.name])
    if (status === 'valid') return 100
    if (status === 'quota') return 0
    return null
  }

  function getStatusRank(file: AuthFile): number {
    if (file.disabled) return 99
    const status = getEffectiveStatus(file, testResults[file.name])
    if (status === 'valid') return 0
    if (status === 'testing') return 1
    if (status === 'quota') return 3
    if (status === 'expired' || status === 'error') return 4
    return 2
  }

  function hasAvailableQuota(file: AuthFile): boolean {
    const result = testResults[file.name]

    const codexWindow = result?.quota?.rate_limit?.primary_window
    if (codexWindow) {
      const usedPercent = codexWindow.used_percent ?? 100
      return usedPercent < 100
    }

    const copilotSnapshot = result?.copilotQuota?.quota_snapshots?.premium_interactions
    if (copilotSnapshot) {
      if (copilotSnapshot.unlimited) return true
      const remaining = copilotSnapshot.remaining ?? copilotSnapshot.quota_remaining ?? 0
      const entitlement = copilotSnapshot.entitlement ?? 0
      if (entitlement > 0) return remaining > 0
      return remaining > 0
    }

    const status = getEffectiveStatus(file, result)
    return status === 'valid'
  }

  const filesInProviderScope = useMemo(() => {
    const byProvider = activeProvider === '全部'
      ? files
      : files.filter((f) => (f.provider || f.type || '未知') === activeProvider)

    const keyword = searchQuery.trim().toLowerCase()
    if (!keyword) return byProvider

    return byProvider.filter((f) => {
      const targets = [f.name, f.email ?? '', f.provider ?? '', f.type ?? '']
      return targets.some((item) => item.toLowerCase().includes(keyword))
    })
  }, [files, activeProvider, searchQuery])

  const filteredFiles = useMemo(() => {
    return filesInProviderScope.filter((f) => {
      if (quickFilter === 'all') return true
      const status = getEffectiveStatus(f, testResults[f.name])
      if (quickFilter === 'expired') return isExpiredStatus(status)
      if (quickFilter === 'quota') return status === 'quota'
      if (quickFilter === 'has-quota') return !f.disabled && hasAvailableQuota(f)
      if (quickFilter === 're-enable') return f.disabled && hasAvailableQuota(f)
      return true
    })
  }, [filesInProviderScope, quickFilter, testResults])

  const displayFiles = useMemo(() => {
    const list = [...filteredFiles]
    if (sortMode === 'default') return list

    if (sortMode === 'quota-first') {
      return list.sort((a, b) => {
        const aScore = getQuotaRemainingPercent(a) ?? -1
        const bScore = getQuotaRemainingPercent(b) ?? -1
        if (bScore !== aScore) return bScore - aScore
        return a.name.localeCompare(b.name)
      })
    }

    return list.sort((a, b) => {
      const rankDiff = getStatusRank(a) - getStatusRank(b)
      if (rankDiff !== 0) return rankDiff
      const bScore = getQuotaRemainingPercent(b) ?? -1
      const aScore = getQuotaRemainingPercent(a) ?? -1
      if (bScore !== aScore) return bScore - aScore
      return a.name.localeCompare(b.name)
    })
  }, [filteredFiles, sortMode, testResults])

  const expiredFiles = useMemo(
    () => displayFiles.filter((f) => {
      const s = getEffectiveStatus(f, testResults[f.name])
      return !f.disabled && isExpiredStatus(s)
    }),
    [displayFiles, testResults]
  )

  const quotaFiles = useMemo(
    () => displayFiles.filter((f) => {
      const s = getEffectiveStatus(f, testResults[f.name])
      return !f.disabled && s === 'quota'
    }),
    [displayFiles, testResults]
  )

  const allQuotaFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      const s = getEffectiveStatus(f, testResults[f.name])
      return s === 'quota'
    }),
    [filesInProviderScope, testResults]
  )

  const reenableQuotaRecoveredFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      return f.disabled && hasAvailableQuota(f)
    }),
    [filesInProviderScope, testResults]
  )

  const allHasQuotaFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      return !f.disabled && hasAvailableQuota(f)
    }),
    [filesInProviderScope, testResults]
  )

  const allExpiredFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      const s = getEffectiveStatus(f, testResults[f.name])
      return isExpiredStatus(s)
    }),
    [filesInProviderScope, testResults]
  )

  async function handleBulkDisable(targets: AuthFile[], label: string) {
    if (!client || targets.length === 0) return
    setBulkDisabling(true)
    setBulkMenuOpen(false)
    setBulkProgress({ label, done: 0, total: targets.length })
    for (let i = 0; i < targets.length; i++) {
      const file = targets[i]
      updateFile(file.name, { disabled: true, status: 'disabled' })
      try {
        await patchAuthFileStatus(client, file.name, true)
      } catch {
        updateFile(file.name, { disabled: file.disabled, status: file.status })
      }
      setBulkProgress({ label, done: i + 1, total: targets.length })
    }
    setBulkDisabling(false)
    setBulkProgress(null)
  }

  async function handleBulkDeleteExpired(targets: AuthFile[]) {
    if (!client || targets.length === 0) return
    const confirmed = window.confirm(`确定要删除 ${targets.length} 个已过期凭据？此操作不可撤销。`)
    if (!confirmed) return

    setBulkDisabling(true)
    setBulkMenuOpen(false)
    setBulkProgress({ label: '删除已过期', done: 0, total: targets.length })

    for (let i = 0; i < targets.length; i++) {
      const file = targets[i]
      try {
        await deleteAuthFile(client, file.name)
        removeFile(file.name)
      } catch {
      }
      setBulkProgress({ label: '删除已过期', done: i + 1, total: targets.length })
    }

    setBulkDisabling(false)
    setBulkProgress(null)
  }

  async function handleBulkEnable(targets: AuthFile[], label: string) {
    if (!client || targets.length === 0) return
    setBulkDisabling(true)
    setBulkMenuOpen(false)
    setBulkProgress({ label, done: 0, total: targets.length })
    for (let i = 0; i < targets.length; i++) {
      const file = targets[i]
      updateFile(file.name, { disabled: false, status: 'active' })
      try {
        await patchAuthFileStatus(client, file.name, false)
      } catch {
        updateFile(file.name, { disabled: file.disabled, status: file.status })
      }
      setBulkProgress({ label, done: i + 1, total: targets.length })
    }
    setBulkDisabling(false)
    setBulkProgress(null)
  }

  const progressLabel = bulkProgress?.label ?? '批量测试'
  const progressDone = bulkProgress?.done ?? progress.done
  const progressTotal = bulkProgress?.total ?? progress.total
  const showProgress = (bulkProgress && bulkProgress.total > 0) || (isRunning && progress.total > 0)
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0

  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface">
        <div className="flex gap-0 overflow-x-auto no-scrollbar">
          {providers.map((provider) => {
            const count = provider === '全部'
              ? files.length
              : files.filter((f) => (f.provider || f.type || '未知') === provider).length
            const isActive = provider === activeProvider
            const color = provider === '全部' ? undefined : getProviderColor(provider)

            return (
              <button
                key={provider}
                onClick={() => setActiveProvider(provider)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                  isActive ? '-mb-px' : 'text-subtle hover:text-ink'
                }`}
                style={isActive ? {
                  color: color ?? '#C96442',
                  borderBottom: `2px solid ${color ?? '#C96442'}`,
                } : {}}
              >
                {provider}
                <span
                  className="ml-2 rounded-full px-1.5 text-2xs"
                  style={isActive
                    ? { backgroundColor: `${color ?? '#C96442'}18`, color: color ?? '#C96442' }
                    : { backgroundColor: '#E8E6E1', color: '#6B6560' }
                  }
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 pb-1 pl-4 flex-shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件名 / 邮箱"
            className="w-44 text-2xs text-ink bg-canvas border border-border rounded px-2.5 py-1.5 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-coral"
          />

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-2xs text-subtle bg-canvas border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-coral"
            title="排序方式"
          >
            <option value="default">默认排序</option>
            <option value="status-first">状态优先</option>
            <option value="quota-first">额度剩余优先</option>
          </select>

          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-medium text-subtle rounded hover:bg-black/5 hover:text-ink disabled:opacity-50 transition-colors"
          >
            <RefreshIcon spinning={refreshing} />
            刷新
          </button>

          <button
            onClick={() => testBatch(displayFiles)}
            disabled={isRunning || displayFiles.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-medium text-coral rounded hover:bg-coral/10 disabled:opacity-50 transition-colors"
          >
            批量测试
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setBulkMenuOpen((v) => !v)}
              disabled={bulkDisabling || (expiredFiles.length === 0 && quotaFiles.length === 0 && allExpiredFiles.length === 0 && reenableQuotaRecoveredFiles.length === 0)}
              className="flex items-center gap-1 px-3 py-1.5 text-2xs font-medium text-subtle rounded hover:bg-black/5 hover:text-ink disabled:opacity-50 transition-colors"
              title="一键处理"
            >
              {bulkDisabling ? <SpinIcon /> : <BanIcon />}
              一键处理
              <ChevronIcon />
            </button>

            {bulkMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-canvas border border-border rounded shadow-card z-20">
                <button
                  onClick={() => handleBulkDisable(expiredFiles, '禁用已过期')}
                  disabled={expiredFiles.length === 0}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-ink font-medium">禁用已过期</span>
                  <span className="ml-1.5 text-subtle">({expiredFiles.length})</span>
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => handleBulkDisable(quotaFiles, '禁用已超额')}
                  disabled={quotaFiles.length === 0}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-ink font-medium">禁用已超额</span>
                  <span className="ml-1.5 text-subtle">({quotaFiles.length})</span>
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => handleBulkDeleteExpired(allExpiredFiles)}
                  disabled={allExpiredFiles.length === 0}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-[#B94040] font-medium">删除全部过期</span>
                  <span className="ml-1.5 text-subtle">({allExpiredFiles.length})</span>
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => handleBulkEnable(reenableQuotaRecoveredFiles, '启用已恢复额度')}
                  disabled={reenableQuotaRecoveredFiles.length === 0}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-ink font-medium">启用恢复额度</span>
                  <span className="ml-1.5 text-subtle">({reenableQuotaRecoveredFiles.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showProgress && (
        <div className="px-4 py-2 border-b border-border bg-canvas">
          <div className="flex items-center justify-between text-2xs text-subtle mb-1">
            <span>{progressLabel}</span>
            <span className="tabular-nums">{progressDone}/{progressTotal}</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-coral rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-b border-border bg-canvas flex items-center gap-2">
        <QuickFilterButton
          active={quickFilter === 'all'}
          onClick={() => setQuickFilter('all')}
          label="全部"
        />
        <QuickFilterButton
          active={quickFilter === 'expired'}
          onClick={() => setQuickFilter('expired')}
          label={`已过期 (${allExpiredFiles.length})`}
        />
        <QuickFilterButton
          active={quickFilter === 'quota'}
          onClick={() => setQuickFilter('quota')}
          label={`已超额 (${allQuotaFiles.length})`}
        />
        <QuickFilterButton
          active={quickFilter === 'has-quota'}
          onClick={() => setQuickFilter('has-quota')}
          label={`有配额 (${allHasQuotaFiles.length})`}
        />
        <QuickFilterButton
          active={quickFilter === 're-enable'}
          onClick={() => setQuickFilter('re-enable')}
          label={`可启用 (${reenableQuotaRecoveredFiles.length})`}
        />

        <span className="ml-auto text-2xs text-subtle tabular-nums">
          统计：过期 {allExpiredFiles.length} · 超额 {allQuotaFiles.length} · 有配额 {allHasQuotaFiles.length} · 可启用 {reenableQuotaRecoveredFiles.length}
        </span>
      </div>

      <CredentialTable files={displayFiles} loading={loading} />
    </div>
  )
}

function QuickFilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-2xs border transition-colors ${
        active
          ? 'border-coral text-coral bg-coral/10'
          : 'border-border text-subtle hover:text-ink hover:border-ink'
      }`}
    >
      {label}
    </button>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function BanIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

function SpinIcon() {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}
