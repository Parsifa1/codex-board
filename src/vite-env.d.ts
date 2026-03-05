interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_PROXY_MODE?: string
  readonly VITE_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
