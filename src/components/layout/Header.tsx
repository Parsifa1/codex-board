import { useEffect, useState } from 'react'
import { useCredStore } from '@/store/credStore'
import { applyThemeMode, loadThemeMode, saveThemeMode, type ThemeMode } from '@/lib/theme'

export default function Header() {
  const connected = useCredStore((s) => s.connected)
  const connection = useCredStore((s) => s.connection)
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemeMode())

  useEffect(() => {
    applyThemeMode(theme)
    saveThemeMode(theme)
  }, [theme])

  const hostname = connection?.endpoint
    ? (() => {
        try {
          return new URL(connection.endpoint).host
        } catch {
          return connection.endpoint
        }
      })()
    : null

  return (
    <div className="border-b border-border pb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-sm bg-coral" />
          <h1 className="font-serif text-2xl text-ink font-normal tracking-tight">
            CLIProxy Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="inline-flex items-center justify-center w-8 h-8 rounded border border-border bg-surface text-subtle shadow-sm hover:text-ink hover:bg-canvas transition-colors"
            title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-[#4CAF50]' : 'bg-muted'
            }`}
          />
          <span className="text-sm text-subtle">
            {connected && hostname ? `已连接到 ${hostname}` : '未连接'}
          </span>
        </div>
      </div>
    </div>
  )
}

function SunIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25M12 18.75V21m8.25-9H21M3 12h2.25m12.364 6.364l1.591 1.591M4.795 4.795l1.591 1.591m10.228-1.591l-1.591 1.591M6.386 17.614l-1.591 1.591M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7.5 7.5 0 009.79 9.79z" />
    </svg>
  )
}
