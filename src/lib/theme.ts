export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'cliproxy_theme'

const LIGHT_VARS: Record<string, string> = {
  '--color-canvas': '240 238 230',
  '--color-surface': '245 244 241',
  '--color-border': '232 230 225',
  '--color-muted': '200 196 188',
  '--color-ink': '26 26 26',
  '--color-subtle': '107 101 96',
}

const DARK_VARS: Record<string, string> = {
  '--color-canvas': '18 17 16',
  '--color-surface': '26 25 24',
  '--color-border': '42 41 40',
  '--color-muted': '94 90 85',
  '--color-ink': '242 240 236',
  '--color-subtle': '177 170 161',
}

function resolveSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return resolveSystemTheme()
}

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const isDark = mode === 'dark'
  const vars = isDark ? DARK_VARS : LIGHT_VARS

  Object.entries(vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value)
  })

  document.documentElement.classList.toggle('dark', isDark)
  document.body.classList.toggle('dark', isDark)
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_KEY, mode)
}

export function applyStoredThemeOnBoot(): void {
  applyThemeMode(loadThemeMode())
}
