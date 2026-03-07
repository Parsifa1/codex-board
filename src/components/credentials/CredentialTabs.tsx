import { useState, useMemo, useRef, useEffect } from 'react'
import { useCredStore } from '@/store/credStore'
import { useConnection } from '@/hooks/useConnection'
import { useBatchTest } from '@/hooks/useBatchTest'
import { getProviderColor } from '@/utils/keyUtils'
import { getEffectiveStatus, isExpiredStatus } from '@/utils/statusUtils'
import { deleteAuthFile, patchAuthFileStatus } from '@/lib/management'
import CredentialTable, { type SortMode } from './CredentialTable'
import UploadModal from './UploadModal'
import type { AuthFile } from '@/types/api'
type QuickFilter = 'all' | 'expired' | 'quota' | 'has-quota' | 'other' | 'error' | 'can-disable' | 'can-enable'
const SORT_MODE_KEY = 'cliproxy_sort_mode'

const VALID_SORT_MODES: SortMode[] = [
  'default', 'quota-first', 'status-first',
  'name-asc', 'name-desc',
  'quota-asc', 'quota-desc',
  'status-asc', 'status-desc',
  'reset-asc', 'reset-desc',
  'refresh-asc', 'refresh-desc',
]

function loadSortMode(): SortMode {
  if (typeof window === 'undefined') return 'default'
  const value = window.localStorage.getItem(SORT_MODE_KEY)
  if (value && (VALID_SORT_MODES as string[]).includes(value)) {
    return value as SortMode
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
  const [uploadOpen, setUploadOpen] = useState(false)
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

    const codexRateLimit = result?.quota?.rate_limit
    if (codexRateLimit) {
      return codexRateLimit.allowed && !codexRateLimit.limit_reached
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

  function getQuotaResetTimestamp(file: AuthFile): number | null {
    const result = testResults[file.name]

    const codexWindow = result?.quota?.rate_limit.primary_window
    if (codexWindow) {
      if (typeof codexWindow.reset_at === 'number' && Number.isFinite(codexWindow.reset_at) && codexWindow.reset_at > 0) {
        return codexWindow.reset_at > 1_000_000_000_000
          ? codexWindow.reset_at
          : codexWindow.reset_at * 1000
      }
      if (
        typeof codexWindow.reset_after_seconds === 'number'
        && Number.isFinite(codexWindow.reset_after_seconds)
        && codexWindow.reset_after_seconds >= 0
        && Number.isFinite(result?.testedAt)
      ) {
        return result.testedAt + codexWindow.reset_after_seconds * 1000
      }
    }

    const copilotReset = result?.copilotQuota?.quota_reset_date
    if (copilotReset) {
      const parsed = new Date(copilotReset).getTime()
      if (Number.isFinite(parsed)) return parsed
    }

    if (file.next_retry_after) {
      const parsed = new Date(file.next_retry_after).getTime()
      if (Number.isFinite(parsed)) return parsed
    }

    return null
  }

  function isHiddenTestingStatus(file: AuthFile): boolean {
    const status = getEffectiveStatus(file, testResults[file.name])
    return status === 'queued' || status === 'testing' || status === 'retrying'
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
      const status = getEffectiveStatus(f, testResults[f.name])
      if (status === 'queued' || status === 'testing' || status === 'retrying') return false
      if (quickFilter === 'all') return true
      if (quickFilter === 'expired') return isExpiredStatus(status)
      if (quickFilter === 'quota') return status === 'quota'
      if (quickFilter === 'has-quota') return hasAvailableQuota(f)
      if (quickFilter === 'error') return status === 'error'
      if (quickFilter === 'other') {
        return !isExpiredStatus(status) && status !== 'quota' && status !== 'error' && !hasAvailableQuota(f)
      }
      if (quickFilter === 'can-disable') return !f.disabled && status === 'quota'
      if (quickFilter === 'can-enable') return f.disabled && hasAvailableQuota(f)
      return true
    })
  }, [filesInProviderScope, quickFilter, testResults])

  const displayFiles = useMemo(() => {
    const list = [...filteredFiles]

    if (sortMode === 'default') return list

    if (sortMode === 'name-asc') {
      return list.sort((a, b) => a.name.localeCompare(b.name))
    }
    if (sortMode === 'name-desc') {
      return list.sort((a, b) => b.name.localeCompare(a.name))
    }

    if (sortMode === 'status-asc' || sortMode === 'status-first') {
      return list.sort((a, b) => {
        const rankDiff = getStatusRank(a) - getStatusRank(b)
        if (rankDiff !== 0) return rankDiff
        const bScore = getQuotaRemainingPercent(b) ?? -1
        const aScore = getQuotaRemainingPercent(a) ?? -1
        if (bScore !== aScore) return bScore - aScore
        return a.name.localeCompare(b.name)
      })
    }
    if (sortMode === 'status-desc') {
      return list.sort((a, b) => {
        const rankDiff = getStatusRank(b) - getStatusRank(a)
        if (rankDiff !== 0) return rankDiff
        const aScore = getQuotaRemainingPercent(a) ?? -1
        const bScore = getQuotaRemainingPercent(b) ?? -1
        if (aScore !== bScore) return aScore - bScore
        return a.name.localeCompare(b.name)
      })
    }

    if (sortMode === 'quota-first' || sortMode === 'quota-desc') {
      return list.sort((a, b) => {
        const aScore = getQuotaRemainingPercent(a) ?? -1
        const bScore = getQuotaRemainingPercent(b) ?? -1
        if (bScore !== aScore) return bScore - aScore
        return a.name.localeCompare(b.name)
      })
    }
    if (sortMode === 'quota-asc') {
      return list.sort((a, b) => {
        const aScore = getQuotaRemainingPercent(a) ?? 101
        const bScore = getQuotaRemainingPercent(b) ?? 101
        if (aScore !== bScore) return aScore - bScore
        return a.name.localeCompare(b.name)
      })
    }

    if (sortMode === 'reset-asc') {
      return list.sort((a, b) => {
        const aTime = getQuotaResetTimestamp(a) ?? Infinity
        const bTime = getQuotaResetTimestamp(b) ?? Infinity
        if (aTime !== bTime) return aTime - bTime
        return a.name.localeCompare(b.name)
      })
    }
    if (sortMode === 'reset-desc') {
      return list.sort((a, b) => {
        const aTime = getQuotaResetTimestamp(a) ?? -Infinity
        const bTime = getQuotaResetTimestamp(b) ?? -Infinity
        if (aTime !== bTime) return bTime - aTime
        return a.name.localeCompare(b.name)
      })
    }

    if (sortMode === 'refresh-asc') {
      return list.sort((a, b) => {
        const aTime = a.last_refresh ? new Date(a.last_refresh).getTime() : Infinity
        const bTime = b.last_refresh ? new Date(b.last_refresh).getTime() : Infinity
        return aTime - bTime
      })
    }
    if (sortMode === 'refresh-desc') {
      return list.sort((a, b) => {
        const aTime = a.last_refresh ? new Date(a.last_refresh).getTime() : -Infinity
        const bTime = b.last_refresh ? new Date(b.last_refresh).getTime() : -Infinity
        return bTime - aTime
      })
    }

    return list
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
      if (isHiddenTestingStatus(f)) return false
      const s = getEffectiveStatus(f, testResults[f.name])
      return s === 'quota'
    }),
    [filesInProviderScope, testResults]
  )

  const allErrorFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      const s = getEffectiveStatus(f, testResults[f.name])
      return s === 'error'
    }),
    [filesInProviderScope, testResults]
  )

  async function handleBulkRetest(targets: AuthFile[]) {
    if (targets.length === 0 || isRunning) return
    setBulkMenuOpen(false)
    await testBatch(targets)
  }

  const reenableQuotaRecoveredFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      return f.disabled && hasAvailableQuota(f)
    }),
    [filesInProviderScope, testResults]
  )

  const canDisableQuotaFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      const s = getEffectiveStatus(f, testResults[f.name])
      return !f.disabled && s === 'quota'
    }),
    [filesInProviderScope, testResults]
  )

  const allHasQuotaFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      return !f.disabled && hasAvailableQuota(f)
    }),
    [filesInProviderScope, testResults]
  )

  const allOtherFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      const s = getEffectiveStatus(f, testResults[f.name])
      const isExpired = isExpiredStatus(s)
      const isQuota = s === 'quota'
      const isError = s === 'error'
      const isHasQuota = !f.disabled && hasAvailableQuota(f)
      return !isExpired && !isQuota && !isError && !isHasQuota
    }),
    [filesInProviderScope, testResults]
  )

  const allExpiredFiles = useMemo(
    () => filesInProviderScope.filter((f) => {
      if (isHiddenTestingStatus(f)) return false
      const s = getEffectiveStatus(f, testResults[f.name])
      return isExpiredStatus(s)
    }),
    [filesInProviderScope, testResults]
  )

  useEffect(() => {
    if (isRunning) return
    if (quickFilter === 'all') return

    const hasEntriesByFilter: Record<Exclude<QuickFilter, 'all'>, boolean> = {
      expired: allExpiredFiles.length > 0,
      quota: allQuotaFiles.length > 0,
      'has-quota': allHasQuotaFiles.length > 0,
      other: allOtherFiles.length > 0,
      error: allErrorFiles.length > 0,
      'can-disable': canDisableQuotaFiles.length > 0,
      'can-enable': reenableQuotaRecoveredFiles.length > 0,
    }

    if (!hasEntriesByFilter[quickFilter]) {
      setQuickFilter('all')
    }
  }, [
    isRunning,
    quickFilter,
    allExpiredFiles.length,
    allQuotaFiles.length,
    allHasQuotaFiles.length,
    allOtherFiles.length,
    allErrorFiles.length,
    canDisableQuotaFiles.length,
    reenableQuotaRecoveredFiles.length,
  ])

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
            className="text-2xs text-subtle bg-canvas border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-coral sr-only"
            title="排序方式"
            aria-hidden="true"
          >
            <option value="default">默认排序</option>
            <option value="status-first">状态优先</option>
            <option value="quota-first">额度剩余优先</option>
          </select>

          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-medium text-subtle rounded hover:bg-black/5 hover:text-ink transition-colors"
            title="上传凭证文件"
          >
            <UploadIcon />
            上传
          </button>

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
            测试当前类别
          </button>

          <div className="relative" ref={menuRef}>
              <button
                onClick={() => setBulkMenuOpen((v) => !v)}
                disabled={bulkDisabling || (expiredFiles.length === 0 && quotaFiles.length === 0 && allErrorFiles.length === 0 && allExpiredFiles.length === 0 && reenableQuotaRecoveredFiles.length === 0)}
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
                  onClick={() => void handleBulkRetest(allErrorFiles)}
                  disabled={allErrorFiles.length === 0 || isRunning}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-ink font-medium">重试错误</span>
                  <span className="ml-1.5 text-subtle">({allErrorFiles.length})</span>
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
                  onClick={() => handleBulkEnable(reenableQuotaRecoveredFiles, '启用有配额')}
                  disabled={reenableQuotaRecoveredFiles.length === 0}
                  className="w-full text-left px-3 py-2 text-2xs hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-ink font-medium">启用有配额</span>
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
        {allExpiredFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'expired'}
            onClick={() => setQuickFilter('expired')}
            label={`已过期 (${allExpiredFiles.length})`}
          />
        )}
        {allQuotaFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'quota'}
            onClick={() => setQuickFilter('quota')}
            label={`已超额 (${allQuotaFiles.length})`}
          />
        )}
        {allHasQuotaFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'has-quota'}
            onClick={() => setQuickFilter('has-quota')}
            label={`有配额 (${allHasQuotaFiles.length})`}
          />
        )}
        {allOtherFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'other'}
            onClick={() => setQuickFilter('other')}
            label={`其他 (${allOtherFiles.length})`}
          />
        )}
        {canDisableQuotaFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'can-disable'}
            onClick={() => setQuickFilter('can-disable')}
            label={`可禁用 (${canDisableQuotaFiles.length})`}
          />
        )}
        {reenableQuotaRecoveredFiles.length > 0 && (
          <QuickFilterButton
            active={quickFilter === 'can-enable'}
            onClick={() => setQuickFilter('can-enable')}
            label={`可启用 (${reenableQuotaRecoveredFiles.length})`}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xs text-subtle tabular-nums whitespace-nowrap">
            统计：过期 {allExpiredFiles.length} · 超额 {allQuotaFiles.length} · 有配额 {allHasQuotaFiles.length} · 其他 {allOtherFiles.length} · 可禁用 {canDisableQuotaFiles.length} · 可启用 {reenableQuotaRecoveredFiles.length} · 错误 {allErrorFiles.length}
          </span>

          {allErrorFiles.length > 0 && (
            <QuickFilterButton
              active={quickFilter === 'error'}
              onClick={() => setQuickFilter('error')}
              label={`错误 (${allErrorFiles.length})`}
              tone="danger"
            />
          )}
        </div>
      </div>

      <CredentialTable files={displayFiles} loading={loading} sortMode={sortMode} onSortChange={setSortMode} />

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
    </div>
  )
}

function QuickFilterButton({
  active,
  onClick,
  label,
  tone = 'default',
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: 'default' | 'danger'
}) {
  const isDanger = tone === 'danger'

  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-2xs border transition-colors ${
        isDanger
          ? active
            ? 'border-[#D55353] text-[#B94040] bg-[#FCEAEA]'
            : 'border-[#EBC4C4] text-[#B94040] bg-[#FFF7F7] hover:border-[#D55353] hover:bg-[#FCEAEA]'
          : active
            ? 'border-coral text-coral bg-coral/10'
            : 'border-border text-subtle hover:text-ink hover:border-ink'
      }`}
    >
      {label}
    </button>
  )
}

function UploadIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
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
