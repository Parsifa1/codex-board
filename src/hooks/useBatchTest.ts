import { useRef, useState } from 'react'
import { useCredStore } from '@/store/credStore'
import { testAuthFile } from '@/lib/management'
import type { AuthFile } from '@/types/api'

const CONCURRENCY = 20

export function useBatchTest() {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const cancelledRef = useRef(false)

  const client = useCredStore((s) => s.client)
  const { setTestStatus, setTestResult } = useCredStore.getState()

  async function testBatch(authFiles: AuthFile[]): Promise<void> {
    if (!client || isRunning || authFiles.length === 0) return

    cancelledRef.current = false
    setIsRunning(true)
    setProgress({ done: 0, total: authFiles.length })

    authFiles.forEach((f) => setTestStatus(f.name, 'queued'))

    let done = 0
    let index = 0

    async function runNext(): Promise<void> {
      while (index < authFiles.length && !cancelledRef.current) {
        const current = index++
        const f = authFiles[current]
        try {
          setTestStatus(f.name, 'testing')
          const result = await testAuthFile(client!, f)
          setTestResult(f.name, result)
        } catch {
          setTestResult(f.name, { status: 'error', message: 'Unexpected error', testedAt: Date.now() })
        }
        done++
        setProgress({ done, total: authFiles.length })
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, runNext))

    setIsRunning(false)
  }

  function cancel(): void {
    cancelledRef.current = true
  }

  return { testBatch, isRunning, progress, cancel }
}
