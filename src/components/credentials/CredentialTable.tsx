import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCredStore } from '@/store/credStore'
import CredentialRow from './CredentialRow'
import type { AuthFile } from '@/types/api'

interface CredentialTableProps {
  files: AuthFile[]
  loading: boolean
}

const ROW_HEIGHT = 56

export default function CredentialTable({ files, loading }: CredentialTableProps) {
  const selected = useCredStore((s) => s.selected)
  const { selectAll, clearSelection } = useCredStore.getState()

  const allNames = files.map((f) => f.name)
  const allSelected = allNames.length > 0 && allNames.every((n) => selected.has(n))
  const someSelected = allNames.some((n) => selected.has(n))

  function handleSelectAll(checked: boolean) {
    if (checked) selectAll(allNames)
    else clearSelection()
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
          <div className="px-3 py-3 flex-1 min-w-0">文件名</div>
          <div className="px-3 py-3 w-24 flex-shrink-0 whitespace-nowrap">提供商</div>
          <div className="px-3 py-3 w-56 flex-shrink-0 whitespace-nowrap">状态 / 额度</div>
          <div className="px-3 py-3 w-28 flex-shrink-0 whitespace-nowrap">额度重置</div>
          <div className="px-3 py-3 w-24 flex-shrink-0 whitespace-nowrap">最近刷新</div>
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
