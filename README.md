# codex-detect

CLIProxyAPI auth dashboard.

## Development

```bash
pnpm install
pnpm dev
```

Optional local dev proxy (Vite only):

```bash
VITE_PROXY_MODE=true VITE_ENDPOINT=http://localhost:8317 pnpm dev
```

## Build

```bash
pnpm build
```

## Cloudflare Pages Deployment

- Framework preset: `None`
- Build command: `pnpm build`
- Build output directory: `dist`

`useProxy` is only for local Vite development. In Cloudflare Pages production, Vite proxy is not active.

For production API access, choose one:

1. Target endpoint supports CORS for your Pages domain
2. Configure a same-origin reverse proxy on Cloudflare side
