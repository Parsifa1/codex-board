import { useCredStore } from '@/store/credStore'
import { deleteAuthFile, patchAuthFileStatus, testAuthFile } from '@/lib/management'
import { formatRelativeTime, getProviderColor } from '@/utils/keyUtils'
import { getEffectiveStatus } from '@/utils/statusUtils'
import StatusBadge from './StatusBadge'
import type { AuthFile } from '@/types/api'

interface CredentialRowProps {
  file: AuthFile
  isSelected: boolean
}

export default function CredentialRow({ file, isSelected }: CredentialRowProps) {
  const store = useCredStore.getState()
  const client = useCredStore((s) => s.client)
  const testResult = useCredStore((s) => s.testResults[file.name])

  const displayStatus = getEffectiveStatus(file, testResult)

  async function handleTest() {
    if (!client) return
    store.setTestStatus(file.name, 'testing')
    const result = await testAuthFile(client, file)
    store.setTestResult(file.name, result)
  }

  async function handleToggleDisable() {
    if (!client) return
    const newDisabled = !file.disabled
    store.updateFile(file.name, { disabled: newDisabled, status: newDisabled ? 'disabled' : 'active' })
    try {
      await patchAuthFileStatus(client, file.name, newDisabled)
    } catch {
      store.updateFile(file.name, { disabled: file.disabled, status: file.status })
    }
  }

  async function handleDelete() {
    if (!client) return
    if (!window.confirm(`确定要删除认证文件 "${file.name}"？此操作不可撤销。`)) return
    store.removeFile(file.name)
    try {
      await deleteAuthFile(client, file.name)
    } catch {
      store.setFiles([...useCredStore.getState().files, file])
    }
  }

  const providerColor = getProviderColor(file.provider)
  const providerLabel = (file.provider || file.type || '未知').toLowerCase()
  const availabilityColor = file.disabled ? '#9A948C' : '#10A37F'
  const availabilityTitle = file.disabled ? '已禁用' : '已启用'
  const quotaResetLabel = getQuotaResetLabel(testResult)

  return (
    <div className="flex items-center hover:bg-surface/60 transition-colors group border-b border-border last:border-0">
      <div className="pl-4 pr-2 py-3 w-10 flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => store.toggleSelect(file.name)}
          className="checkbox-ui"
        />
      </div>

      <div className="px-3 py-3 flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: availabilityColor }}
            title={availabilityTitle}
          />
          <div className="min-w-0">
            <div className="text-sm text-ink font-medium leading-tight truncate">{file.name}</div>
            {file.email && (
              <div className="text-2xs text-subtle mt-0.5 truncate">{file.email}</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-3 w-24 flex-shrink-0">
        <span
          className="inline-block text-2xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ backgroundColor: `${providerColor}18`, color: providerColor }}
        >
          {providerLabel}
        </span>
      </div>

      <div className="px-3 py-3 w-56 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={displayStatus} />
          {testResult?.quota && (
            <QuotaBar usedPercent={testResult.quota.rate_limit.primary_window?.used_percent ?? 0} resetAfterSeconds={testResult.quota.rate_limit.primary_window?.reset_after_seconds} />
          )}
          {testResult?.copilotQuota && (
            <CopilotQuotaBar quota={testResult.copilotQuota} />
          )}
        </div>
        {testResult?.message && !testResult.quota && !testResult.copilotQuota && (
          <div className="text-2xs text-subtle mt-0.5 truncate" title={testResult.message}>
            {testResult.message}
          </div>
        )}
      </div>

      <div className="px-3 py-3 w-28 flex-shrink-0 text-2xs text-subtle tabular-nums" title={quotaResetLabel.full}> 
        {quotaResetLabel.short}
      </div>

      <div className="px-3 py-3 w-24 flex-shrink-0 text-2xs text-subtle">
        {formatRelativeTime(file.last_refresh)}
      </div>

      <div className="px-3 pr-4 py-3 w-24 flex-shrink-0">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton title="测试" onClick={handleTest}>
            <PlayIcon />
          </ActionButton>

          <ActionButton
            title={file.disabled ? '启用' : '禁用'}
            onClick={handleToggleDisable}
          >
            {file.disabled ? <EnableIcon /> : <DisableIcon />}
          </ActionButton>

          <ActionButton title="删除" onClick={handleDelete} className="hover:text-[#B94040]">
            <TrashIcon />
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function getQuotaResetLabel(testResult: ReturnType<typeof useCredStore.getState>['testResults'][string] | undefined): { short: string; full: string } {
  if (!testResult) return { short: '—', full: '暂无测试结果' }

  const codexResetSeconds = testResult.quota?.rate_limit.primary_window?.reset_after_seconds
  if (typeof codexResetSeconds === 'number' && codexResetSeconds >= 0) {
    const resetAt = new Date(Date.now() + codexResetSeconds * 1000)
    const short = formatResetDate(resetAt)
    const full = `约 ${Math.max(0, Math.round(codexResetSeconds / 60))} 分钟后重置（${resetAt.toLocaleString('zh-CN', { hour12: false })}）`
    return { short, full }
  }

  const copilotReset = testResult.copilotQuota?.quota_reset_date
  if (copilotReset) {
    const parsed = new Date(copilotReset)
    if (!isNaN(parsed.getTime())) {
      const short = formatResetDate(parsed)
      const full = `重置于 ${parsed.toLocaleString('zh-CN', { hour12: false })}`
      return { short, full }
    }
    return { short: copilotReset, full: copilotReset }
  }

  return { short: '—', full: '暂无重置时间' }
}

function formatResetDate(date: Date): string {
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function ActionButton({
  title,
  onClick,
  children,
  className = '',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 text-subtle hover:text-ink rounded transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  )
}

function DisableIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

function EnableIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

function QuotaBar({ usedPercent, resetAfterSeconds }: { usedPercent: number; resetAfterSeconds?: number }) {
  const remaining = 100 - usedPercent
  const barColor = usedPercent >= 90 ? '#B94040' : usedPercent >= 70 ? '#C4933A' : '#4CAF50'
  const resetLabel = resetAfterSeconds == null ? null
    : resetAfterSeconds < 3600 ? `${Math.round(resetAfterSeconds / 60)}m`
    : `${Math.round(resetAfterSeconds / 3600)}h`

  return (
    <div
      className="flex items-center gap-1.5 text-2xs flex-shrink-0"
      title={resetLabel ? `已用 ${usedPercent}%，${resetLabel}后重置` : `已用 ${usedPercent}%`}
    >
      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${remaining}%`, backgroundColor: barColor }} />
      </div>
      <span style={{ color: barColor }} className="tabular-nums">{remaining}%</span>
    </div>
  )
}

function CopilotQuotaBar({ quota }: { quota: import('@/types/api').CopilotQuota }) {
  const snap = quota.quota_snapshots?.premium_interactions
  if (!snap || snap.unlimited) return null
  const entitlement = snap.entitlement ?? 0
  const remaining = snap.remaining ?? snap.quota_remaining ?? 0
  if (entitlement === 0) return null
  const usedPercent = Math.round(((entitlement - remaining) / entitlement) * 100)
  const barColor = usedPercent >= 90 ? '#B94040' : usedPercent >= 70 ? '#C4933A' : '#4CAF50'
  const resetDate = quota.quota_reset_date ?? ''

  return (
    <div
      className="flex items-center gap-1.5 text-2xs flex-shrink-0"
      title={`Premium 剩余 ${remaining}/${entitlement}${resetDate ? `，重置于 ${resetDate}` : ''}`}
    >
      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${(remaining / entitlement) * 100}%`, backgroundColor: barColor }} />
      </div>
      <span style={{ color: barColor }} className="tabular-nums">{remaining}</span>
    </div>
  )
}
