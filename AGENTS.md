# AGENTS.md

## 1) Project Mission

Build a local-first web dashboard for managing CLIProxyAPI auth files, focused on:

- connect to remote management endpoint
- inspect and batch test auth files (primarily codex)
- identify expired / quota-exhausted credentials quickly
- execute safe bulk operations (disable / delete)
- keep UX lightweight for large datasets (thousands of rows)

This project prioritizes operator efficiency, low-latency status checks, and clear failure visibility.

---

## 2) Tech Stack and Runtime

- Framework: React 18 + TypeScript + Vite
- State: Zustand
- Styling: Tailwind CSS
- Large list rendering: `@tanstack/react-virtual`
- Package manager: **pnpm only**

### Commands

```bash
pnpm install
pnpm dev
pnpm build
```

---

## 3) High-Level Architecture

### Entrypoint and Composition

- `src/main.tsx`: app bootstrap
- `src/App.tsx`: top-level composition
  - always renders: `Header`, `ConnectionPanel`, `BulkActionBar`
  - renders `CredentialTabs` and `UsagePanel` only after connected

### State and Data Ownership

- `src/store/credStore.ts` is the single source of truth for:
  - connection config and API client
  - auth file list
  - test results map (`Record<fileName, TestResult>`)
  - selected rows set
- `src/lib/storage.ts` persists:
  - connection config
  - test results by endpoint key (`cliproxy_results_${endpoint}`)

### API Layer

- `src/lib/api.ts`: typed API client wrapper around `/v0/management` (or Vite proxy path)
- `src/lib/management.ts`: domain API operations
  - auth files CRUD/status
  - usage fetch
  - provider-based test routing

### UI Modules

- `src/components/connection/*`: connect/disconnect and key masking
- `src/components/credentials/*`: provider tabs, table, row actions, quota bars
- `src/components/bulk/BulkActionBar.tsx`: floating bulk action panel for selected rows
- `src/components/usage/UsagePanel.tsx`: collapsible usage metrics

---

## 4) Critical Product Behaviors

### Auth Testing Strategy

All token checks must go through management proxy endpoint:

- `POST /v0/management/api-call`
- server injects real token via `$TOKEN$`

Avoid expensive “real request” probe patterns when lightweight quota/status endpoints exist.

### Codex Path

- usage endpoint: `https://chatgpt.com/backend-api/codex/usage`
- classify result:
  - 401/403 => expired
  - 429 => quota
  - 200 + `rate_limit.allowed=false` or `limit_reached=true` => quota
  - otherwise => valid

### Copilot Path (if present)

- verify identity first via `https://api.github.com/user`
- then fetch quota via `https://api.github.com/copilot_internal/user`
- parse `quota_snapshots.premium_interactions`

Note: this endpoint is internal and may change. Keep graceful fallback behavior.

### Batch Test Concurrency

- implemented in `src/hooks/useBatchTest.ts`
- current pool concurrency: `20`
- update progress continuously

### Large Dataset UX

- virtualized rows in `CredentialTable`
- avoid table element virtualization conflicts; current layout uses div-based rows

---

## 5) Coding Conventions (Project-Specific)

### TypeScript and Data Safety

- keep strict typing (`tsconfig` strict mode is enabled)
- do not use `as any`, `@ts-ignore`, or silent unsafe casts
- preserve API response typing in `src/types/api.ts`

### State Update Rules

- prefer optimistic update + rollback on failure for row operations
- always keep store and persistence consistent after result updates

### UI and Language

- current UI copy is mainly Simplified Chinese
- keep new user-facing strings consistent (Chinese-first unless introducing explicit i18n framework)
- maintain Anthropic-like visual language already established in Tailwind tokens

### Performance Rules

- for 1k+ rows, avoid non-virtualized full render
- avoid unnecessary rerender triggers in row-level actions
- avoid sequential network loops where bounded concurrency pool is more appropriate

---

## 6) Verification Checklist (Before Merge)

Run:

```bash
pnpm build
```

Must verify:

1. TypeScript compile passes
2. Vite build passes
3. No broken import paths after refactor
4. Core flows still work manually:
   - connect/disconnect
   - refresh auth files
   - batch test updates statuses
   - bulk disable/delete rollbacks on API failure
   - persisted test results survive page refresh

---

## 7) Known Risks and Watchpoints

1. **Copilot internal endpoint volatility**
   - `/copilot_internal/user` is not a public stable contract
   - must keep fallback parsing and non-blocking UI behavior

2. **Result key stability**
   - test results keyed by `file.name`
   - renaming files can orphan persisted results

3. **Bulk operation throughput**
   - some bulk actions still execute sequentially
   - for very large sets, operation time can be high

4. **Error observability**
   - compact message display may hide full server context
   - add structured debug surface if operator troubleshooting becomes frequent

---

## 8) Safe Extension Priorities

If adding features, prioritize in this order:

1. better filtering/search/sort for large credential inventories
2. operation audit trail and exportable action log
3. retry policies and failure buckets for batch operations
4. richer i18n support (zh/en switch) without breaking existing Chinese UX
5. backend-safe telemetry for operation latency and failure patterns

---

## 9) Do / Don’t

### Do

- reuse `credStore` as single source of truth
- add new API contracts to `src/types/api.ts` first
- keep UI changes visually consistent with existing design tokens
- preserve low-latency quota checking behavior

### Don’t

- don’t replace quota checks with heavy real API generation calls
- don’t bypass `/api-call` token indirection in frontend
- don’t introduce non-pnpm package workflows
- don’t couple component-local state to cross-page business state when store already owns it
