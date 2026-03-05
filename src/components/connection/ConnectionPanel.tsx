import { useState, useEffect } from 'react'
import { useCredStore } from '@/store/credStore'
import { useConnection } from '@/hooks/useConnection'
import type { ConnectionConfig } from '@/types/api'

export default function ConnectionPanel() {
  const canUseDevProxy = import.meta.env.DEV
  const connected = useCredStore((s) => s.connected)
  const connection = useCredStore((s) => s.connection)
  const { connect, disconnect, error, isConnecting } = useConnection()

  const [endpoint, setEndpoint] = useState('')
  const [managementKey, setManagementKey] = useState('')
  const [useProxy, setUseProxy] = useState(false)

  useEffect(() => {
    if (connection) {
      setEndpoint(connection.endpoint)
      setManagementKey(connection.managementKey)
      setUseProxy(canUseDevProxy ? connection.useProxy : false)
    }
  }, [connection, canUseDevProxy])

  async function handleConnect() {
    const config: ConnectionConfig = {
      endpoint: endpoint.trim(),
      managementKey: managementKey.trim(),
      useProxy: canUseDevProxy ? useProxy : false,
    }
    await connect(config)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConnect()
  }

  const [keyVisible, setKeyVisible] = useState(false)

  if (connected && connection) {
    return (
      <div className="flex items-center justify-between bg-surface border border-border rounded px-4 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-subtle">端点</span>
          <span className="font-mono-key text-ink">{connection.endpoint}</span>
          <span className="text-border">·</span>
          <span className="text-subtle">密钥</span>
          <button
            onClick={() => setKeyVisible((v) => !v)}
            className="flex items-center gap-1.5 font-mono-key text-ink tracking-widest hover:text-coral transition-colors"
            title={keyVisible ? '隐藏密钥' : '显示密钥'}
          >
            {keyVisible ? connection.managementKey : '••••••••'}
            <svg className="w-3 h-3 text-subtle flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {keyVisible
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
              }
            </svg>
          </button>
        </div>
        <button
          onClick={disconnect}
          className="text-xs font-medium text-subtle border border-border rounded px-2.5 py-1 hover:border-ink hover:text-ink transition-colors"
        >
          断开连接
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-lg shadow-card p-6">
      <h2 className="font-serif text-xl text-ink font-normal mb-1">
        连接到端点
      </h2>
      <p className="text-sm text-subtle mb-5">
        输入 CLIProxyAPI 的端点地址和管理密钥以开始使用。
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            端点地址
          </label>
          <input
            type="url"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="http://localhost:8317"
            className="w-full px-3 py-2 bg-canvas border border-border rounded text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-coral focus:border-coral transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            管理密钥
          </label>
          <input
            type="password"
            value={managementKey}
            onChange={(e) => setManagementKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="your-management-key"
            className="w-full px-3 py-2 bg-canvas border border-border rounded text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-coral focus:border-coral transition-colors"
          />
        </div>

        {canUseDevProxy ? (
          <div className="flex items-start gap-2.5">
            <input
              id="use-proxy"
              type="checkbox"
              checked={useProxy}
              onChange={(e) => setUseProxy(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 rounded border-border accent-coral"
            />
            <div>
              <label
                htmlFor="use-proxy"
                className="text-sm font-medium text-ink cursor-pointer"
              >
                使用 Vite 代理转发（仅本地开发）
              </label>
              <p className="text-2xs text-subtle mt-0.5">
                线上部署到 Cloudflare Pages 后无需此项。仅在本地开发模式下可用，需设置{' '}
                <code className="font-mono-key bg-border/50 px-1 rounded">
                  VITE_PROXY_MODE=true
                </code>{' '}
                并重启开发服务器。
              </p>
            </div>
          </div>
        ) : (
          <p className="text-2xs text-subtle">
            当前为线上环境：Vite 代理不会生效，请直接连接可跨域访问的管理端点，或使用同域反向代理。
          </p>
        )}

        {error && (
          <div className="px-3 py-2.5 bg-[#FCEAEA] border border-[#EBC4C4] rounded text-sm text-[#B94040]">
            {error}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isConnecting || !endpoint || !managementKey}
          className="w-full py-2 px-4 bg-coral text-white text-sm font-medium rounded hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isConnecting ? '连接中…' : '连接'}
        </button>
      </div>
    </div>
  )
}
