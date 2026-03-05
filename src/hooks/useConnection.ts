import { useState } from 'react'
import { useCredStore } from '@/store/credStore'
import { fetchAuthFiles } from '@/lib/management'
import { saveConnection, clearConnection, loadConnection } from '@/lib/storage'
import type { ConnectionConfig } from '@/types/api'

export function useConnection() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const { setConnection, disconnect: storeDisconnect, setFiles, setLoading } =
    useCredStore()

  async function connect(config: ConnectionConfig): Promise<void> {
    if (!config.endpoint.trim() || !config.managementKey.trim()) {
      setError('Endpoint and management key are required.')
      return
    }
    setError(null)
    setIsConnecting(true)
    setLoading(true)

    try {
      setConnection(config)
      const freshClient = useCredStore.getState().client!
      const files = await fetchAuthFiles(freshClient)
      setFiles(files)
      saveConnection(config)
    } catch (err) {
      storeDisconnect()
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to connect. Check endpoint and key.'
      )
    } finally {
      setIsConnecting(false)
      setLoading(false)
    }
  }

  function disconnect(): void {
    clearConnection()
    storeDisconnect()
    setError(null)
  }

  async function reconnectFromStorage(): Promise<void> {
    const saved = loadConnection()
    if (!saved) return
    setIsConnecting(true)
    setLoading(true)
    try {
      setConnection(saved)
      const freshClient = useCredStore.getState().client!
      const files = await fetchAuthFiles(freshClient)
      setFiles(files)
    } catch {
    } finally {
      setIsConnecting(false)
      setLoading(false)
    }
  }

  async function refresh(): Promise<void> {
    const client = useCredStore.getState().client
    if (!client) return
    const { setRefreshing, setFiles: _setFiles } = useCredStore.getState()
    setRefreshing(true)
    try {
      const files = await fetchAuthFiles(client)
      _setFiles(files)
    } finally {
      setRefreshing(false)
    }
  }

  return {
    connect,
    disconnect,
    reconnectFromStorage,
    refresh,
    error,
    isConnecting,
  }
}
