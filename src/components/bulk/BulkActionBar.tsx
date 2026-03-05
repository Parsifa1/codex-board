import { useCredStore } from '@/store/credStore'
import { deleteAuthFile, patchAuthFileStatus } from '@/lib/management'
import { useBatchTest } from '@/hooks/useBatchTest'

export default function BulkActionBar() {
  const selected = useCredStore((s) => s.selected)
  const files = useCredStore((s) => s.files)
  const client = useCredStore((s) => s.client)
  const { clearSelection, removeFile, updateFile } = useCredStore.getState()
  const { testBatch, isRunning } = useBatchTest()

  if (selected.size === 0) return null

  const count = selected.size
  const selectedFiles = files.filter((f) => selected.has(f.name))

  async function handleBulkTest() {
    await testBatch(selectedFiles)
  }

  async function handleBulkDisable(disable: boolean) {
    if (!client) return
    for (const file of selectedFiles) {
      updateFile(file.name, {
        disabled: disable,
        status: disable ? 'disabled' : 'active',
      })
      try {
        await patchAuthFileStatus(client, file.name, disable)
      } catch {
        updateFile(file.name, { disabled: file.disabled, status: file.status })
      }
    }
  }

  async function handleBulkDelete() {
    if (!client) return
    if (!window.confirm(`确定要删除选中的 ${count} 个认证文件？此操作不可撤销。`)) return

    for (const file of selectedFiles) {
      removeFile(file.name)
      try {
        await deleteAuthFile(client, file.name)
      } catch {
        useCredStore.getState().setFiles([...useCredStore.getState().files, file])
      }
    }
    clearSelection()
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-3 bg-ink text-canvas rounded-lg shadow-modal px-5 py-3 text-sm">
        <span className="text-muted text-xs">已选 {count} 个</span>

        <div className="w-px h-4 bg-subtle/30" />

        <button
          onClick={handleBulkTest}
          disabled={isRunning}
          className="hover:text-coral-light disabled:opacity-50 transition-colors text-xs font-medium"
        >
          测试
        </button>

        <button
          onClick={() => handleBulkDisable(false)}
          className="hover:text-coral-light transition-colors text-xs font-medium"
        >
          启用
        </button>

        <button
          onClick={() => handleBulkDisable(true)}
          className="hover:text-coral-light transition-colors text-xs font-medium"
        >
          禁用
        </button>

        <button
          onClick={handleBulkDelete}
          className="hover:text-[#E8A598] transition-colors text-xs font-medium"
        >
          删除
        </button>

        <div className="w-px h-4 bg-subtle/30" />

        <button
          onClick={clearSelection}
          className="text-muted hover:text-canvas transition-colors"
          title="取消选择"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

