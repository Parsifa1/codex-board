import type { AuthStatus, TestStatus } from '@/types/api'

interface StatusConfig {
  label: string
  bg: string
  text: string
}

type DisplayStatus = TestStatus | AuthStatus

const STATUS_CONFIG: Record<string, StatusConfig> = {
  valid:      { label: '有效',    bg: '#FEF0EB', text: '#C96442' },
  active:     { label: '活跃',    bg: '#FEF0EB', text: '#C96442' },
  disabled:   { label: '已禁用',  bg: '#F2F1EF', text: '#9A948C' },
  testing:    { label: '测试中',  bg: '#FDF5E6', text: '#C4933A' },
  refreshing: { label: '刷新中',  bg: '#FDF5E6', text: '#C4933A' },
  pending:    { label: '等待中',  bg: '#FDF5E6', text: '#C4933A' },
  error:      { label: '错误',    bg: '#FCEAEA', text: '#B94040' },
  expired:    { label: '已过期',  bg: '#FCEAEA', text: '#B94040' },
  quota:      { label: '超限额',  bg: '#F5F3E6', text: '#7A6830' },
  unknown:    { label: '未知',    bg: '#F2F1EF', text: '#9A948C' },
}

interface StatusBadgeProps {
  status: DisplayStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown
  const spinning = status === 'testing' || status === 'refreshing' || status === 'pending'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {spinning && (
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {config.label}
    </span>
  )
}
