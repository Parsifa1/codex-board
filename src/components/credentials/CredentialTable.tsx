import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCredStore } from '@/store/credStore'
import CredentialRow from './CredentialRow'
import type { AuthFile } from '@/types/api'

export type SortMode =
  | 'default'
  | 'quota-first'
  | 'status-first'
  | 'name-asc'
  | 'name-desc'
  | 'quota-asc'
  | 'quota-desc'
  | 'status-asc'
  | 'status-desc'
  | 'reset-asc'
  | 'reset-desc'
  | 'refresh-asc'
  | 'refresh-desc'

interface CredentialTableProps {
  files: AuthFile[]
  loading: boolean
  sortMode?: SortMode
  onSortChange?: (mode: SortMode) => void
}

const ROW_HEIGHT = 56

type SortCol = 'name' | 'status' | 'reset' | 'refresh'
const SORT_PAIRS: Record<SortCol, [SortMode, SortMode]> = {
  name:    ['name-asc',    'name-desc'],
  status:  ['quota-desc',  'quota-asc'],
  reset:   ['reset-asc',   'reset-desc'],
  refresh: ['refresh-desc','refresh-asc'],
}

function getActiveCol(mode: SortMode | undefined): SortCol | null {
  if (!mode) return null
  for (const [col, [first, second]] of Object.entries(SORT_PAIRS) as [SortCol, [SortMode, SortMode]][]) {
    if (mode === first || mode === second) return col
  }
  if (mode === 'quota-first') return 'status'
  if (mode === 'status-first' || mode === 'status-asc' || mode === 'status-desc') return 'status'
  return null
}

function getDirection(mode: SortMode | undefined, col: SortCol): 'asc' | 'desc' | null {
  if (!mode) return null
  const pair = SORT_PAIRS[col]
  if (!pair) return null
  if (col === 'status') {
    if (mode === 'quota-desc' || mode === 'quota-first' || mode === 'status-first') return 'desc'
    if (mode === 'quota-asc') return 'asc'
    return null
  }
  if (mode === pair[0]) return 'asc'
  if (mode === pair[1]) return 'desc'
  return null
}

export default function CredentialTable({ files, loading, sortMode, onSortChange }: CredentialTableProps) {
  const selected = useCredStore((s) => s.selected)
  const { selectAll, clearSelection } = useCredStore.getState()

  const allNames = files.map((f) => f.name)
  const allSelected = allNames.length > 0 && allNames.every((n) => selected.has(n))
  const someSelected = allNames.some((n) => selected.has(n))

  function handleSelectAll(checked: boolean) {
    if (checked) selectAll(allNames)
    else clearSelection()
  }

  function handleColSort(col: SortCol) {
    if (!onSortChange) return
    const pair = SORT_PAIRS[col]
    const activeCol = getActiveCol(sortMode)
    if (activeCol !== col) {
      onSortChange(pair[0])
      return
    }
    const dir = getDirection(sortMode, col)
    if (dir === null) {
      onSortChange(pair[0])
    } else if (sortMode === pair[0]) {
      onSortChange(pair[1])
    } else {
      onSortChange('default')
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => files[index]?.name ?? index,
    estimateSize: () => ROW_HEIGHT,
    overscan: 30,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()

  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollToBottom() {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const activeCol = getActiveCol(sortMode)
  const sortable = !!onSortChange

  return (
    <div className="overflow-hidden">
      <div className="bg-surface border-b border-border">
        <div className="flex items-center text-2xs font-medium text-subtle uppercase tracking-wide">
          <div className="pl-4 pr-2 py-3 w-10 flex-shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allSelected
              }}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="checkbox-ui"
            />
          </div>

          <SortHeader
            label="文件名"
            col="name"
            activeCol={activeCol}
            direction={getDirection(sortMode, 'name')}
            sortable={sortable}
            className="px-3 py-3 flex-1 min-w-0"
            onClick={handleColSort}
          />
          <div className="px-3 py-3 w-24 flex-shrink-0 whitespace-nowrap">提供商</div>
          <SortHeader
            label="状态 / 额度"
            col="status"
            activeCol={activeCol}
            direction={getDirection(sortMode, 'status')}
            sortable={sortable}
            className="px-3 py-3 w-56 flex-shrink-0 whitespace-nowrap"
            onClick={handleColSort}
          />
          <SortHeader
            label="额度重置"
            col="reset"
            activeCol={activeCol}
            direction={getDirection(sortMode, 'reset')}
            sortable={sortable}
            className="px-3 py-3 w-28 flex-shrink-0 whitespace-nowrap"
            onClick={handleColSort}
          />
          <SortHeader
            label="最近刷新"
            col="refresh"
            activeCol={activeCol}
            direction={getDirection(sortMode, 'refresh')}
            sortable={sortable}
            className="px-3 py-3 w-24 flex-shrink-0 whitespace-nowrap"
            onClick={handleColSort}
          />
          <div className="px-3 pr-4 py-3 w-24 flex-shrink-0 text-right whitespace-nowrap">操作</div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-y-auto bg-canvas"
          style={{ height: 'calc(100vh - 280px)', minHeight: '300px' }}
        >
        {loading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-border last:border-0">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-3 bg-border/60 rounded animate-pulse"
                    style={{ width: j === 0 ? '1rem' : j === 1 ? '40%' : '12%' }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-subtle">
            暂无认证文件
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {virtualItems.map((virtualItem) => {
              const file = files[virtualItem.index]
              return (
                <div
                  key={file.name}
                  data-index={virtualItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <CredentialRow
                    file={file}
                    isSelected={selected.has(file.name)}
                  />
                </div>
              )
            })}
          </div>
        )}
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5 z-10">
          <button
            onClick={scrollToTop}
            className="w-7 h-7 rounded bg-canvas border border-border text-subtle hover:text-ink hover:border-ink transition-colors flex items-center justify-center"
            title="滚动到顶部"
          >
            <ChevronUpIcon />
          </button>
          <button
            onClick={scrollToBottom}
            className="w-7 h-7 rounded bg-canvas border border-border text-subtle hover:text-ink hover:border-ink transition-colors flex items-center justify-center"
            title="滚动到底部"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

interface SortHeaderProps {
  label: string
  col: SortCol
  activeCol: SortCol | null
  direction: 'asc' | 'desc' | null
  sortable: boolean
  className?: string
  onClick: (col: SortCol) => void
}

function SortHeader({ label, col, activeCol, direction, sortable, className = '', onClick }: SortHeaderProps) {
  const isActive = activeCol === col
  if (!sortable) {
    return <div className={className}>{label}</div>
  }
  return (
    <button
      onClick={() => onClick(col)}
      className={`${className} flex items-center gap-1 group transition-colors select-none hover:text-ink ${
        isActive ? 'text-ink' : ''
      }`}
      title={`按${label}排序`}
    >
      <span>{label}</span>
      <SortIndicator active={isActive} direction={direction} />
    </button>
  )
}

function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' | null }) {
  return (
    <span className={`inline-flex flex-col gap-px transition-opacity ${active ? 'opacity-60' : 'opacity-0 group-hover:opacity-30'}`}>
      <svg
        className={`w-[7px] h-[5px] transition-opacity ${active && direction === 'asc' ? 'opacity-100' : 'opacity-50'}`}
        fill="none" viewBox="0 0 7 4" stroke="currentColor" strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M0.5 3.5L3.5 0.5l3 3" />
      </svg>
      <svg
        className={`w-[7px] h-[5px] transition-opacity ${active && direction === 'desc' ? 'opacity-100' : 'opacity-50'}`}
        fill="none" viewBox="0 0 7 4" stroke="currentColor" strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M0.5 0.5l3 3 3-3" />
      </svg>
    </span>
  )
}

function ChevronUpIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12L10 7l-5 5" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8l5 5 5-5" />
    </svg>
  )
}
