<!-- BEGIN colby-ecosystem: managed by pull-agents, do not edit inside this block -->
## Machine-wide agent briefings (synced — do not edit here)

Pulled from `jmbish04/colby-ecosystem` by `.github/workflows/agents-sync.yml`, right-sized to this
repo's stack. Read them before your first load-bearing change; where they and the
notes below this block disagree, they win. Edit them in `jmbish04/colby-ecosystem`, never here.

@.agents/ecosystem/AGENTS.md
@.agents/ecosystem/AGENTS-maestro.md
@.agents/ecosystem/AGENTS-github.md
@.agents/ecosystem/AGENTS-cloudflare-workers.md
@.agents/ecosystem/AGENTS-frontend.md
@.agents/ecosystem/AGENTS-python.md
@.agents/ecosystem/AGENTS-mcp.md

The scripts in `scripts/` carrying a `colby-ecosystem: managed script` banner come from there too.
Use them rather than writing another: `scripts/gh.mjs` is the GitHub entry point
and wraps the `gh-tools` CLI, which already solves the auth this machine trips on.

Work is tracked in **colby-maestro** (`https://colby-maestro.hacolby.workers.dev/mcp`,
bearer `$(tokens show WORKER_API_KEY --value-only)`) — never in this repo and never
in colby-ecosystem, which only stores config. Refresh this block with
`.agents/ecosystem/pull-agents`.
<!-- END colby-ecosystem -->

# AGENTS

- At the start of every turn, use the `cloudflare-docs` MCP server to verify Cloudflare assumptions, architecture, and deprecations before writing or changing code.
- Review and apply the best practices in `.agents/skills/` and `.github/skills/` before implementing changes.
- Build new views as React islands inside the ReUI app shell, from ReUI Pro blocks, dark by default, one surface per screen. See "ReUI design system" below — including the Base UI select trap, which is the single most repeated bug in this repo.
- Enforce Zod validation on backend endpoints, expose OpenAPI v3.1.0 at `/openapi.json`, `/swagger`, and `/scalar`, and keep endpoints strongly typed.
- Every new service or view must expose `/health` and emit structured logs/metrics into the mirrored D1 logging layer.
# Agent Workspace Overview

Welcome to the `core-template-cfw-assets-astro-shadcn` template. This is a unified full-stack template combining Cloudflare Workers (Backend & Assets) with Astro and React + Shadcn/ui (Frontend).

## Core Architecture

- **Backend:** Cloudflare Workers, Hono (Routing), D1 (Database with Drizzle ORM).
- **Frontend:** Astro (SSR/Static Hybrid), React (Interactive Islands), Tailwind CSS v4, **ReUI** (Pro registry) on shadcn/ui Base UI primitives.
- **Deployment:** Deployed using Cloudflare Workers Assets via `wrangler.jsonc`.

## Mandatory Agent Directives

This repository relies heavily on AI agents for rapid prototyping and feature generation. If you are an AI agent, you must strictly follow these directives:

1. **Read Startup Rules:** Immediately review `.agent/rules/startup.md` before writing any code. It contains critical instructions for your first steps.
2. **Reference App, Not a Blank Page:** The template ships a complete running app (see "Template App Surface" below) so a new project inherits working patterns. Build the user's frontend by REPLACING the parts they don't need, not by starting from an empty `index.astro`. Keep the app shell, the nav config, and the docs pointers on every page.
3. **Environment Strictness:** We use `worker-configuration.d.ts` for Cloudflare types. Never manually define `interface Bindings`. Always use `Bindings: Env` on Hono applications.
4. **Runtime Baseline:** Use Node.js 22+ when working with Wrangler or regenerating `worker-configuration.d.ts`.
5. **Package Management:** Default to `pnpm` for package installation and script execution.
6. **Authentication Rule:** Use the Secrets Store binding `WORKER_API_KEY` for protected API authentication and session creation. Do not add a `users` table back into this template.
7. **Schema Layout:** Keep Drizzle tables under `db/schemas/${useCase}/${tableName}.ts` and use Drizzle-Zod for API typing where table schemas are involved.
8. **Modularization:** Keep new code modular. Split helpers, components, routes, and persistence code by concern instead of adding large multipurpose files.
9. **Template Replacement Prompt:** If the user gives you the landing-page replacement prompt, replace the starter frontend, preserve the app shell, and keep the dynamic docs pointers to `/openapi.json`, `/swagger`, and `/scalar`.
10. **Frontend Errors:** Never use Chrome/browser alerts. Route every frontend error through the centralized frontend error handling utility and keep the copy-to-clipboard success/error feedback within shadcn components.
11. **Dependency Hygiene:** Follow `.agent/rules/dependency-maintenance.md` whenever dependencies, Wrangler, or generated Cloudflare types may be stale.
12. **Architecture Rules:** Follow `.agent/rules/architecture.md` and `.agent/rules/frontend-error-handling.md` for auth, modularization, and frontend error UX conventions.
13. **CI Ownership:** If GitHub Actions or Cloudflare PR deployment checks fail because of frozen lockfiles, outdated dependencies, or stale Wrangler types, fix them in the same turn by refreshing pnpm dependencies and re-running validation before handing work back.
14. **Import Path Aliases:** ALWAYS use tsconfig path aliases (`@/backend/*`, `@/backend/db/*`, `@/backend/ai/*`, etc.) for all backend imports. Never use relative imports (`../../foo`). Run `node scripts/migrate-imports.mjs` to convert existing relative imports. See `.agent/rules/import-paths.md` for details.
15. **Comprehensive Documentation:** Every backend TypeScript file must have a file-level JSDoc comment explaining its purpose, key features, and usage. Every exported function/class must have JSDoc with `@param`, `@returns`, `@throws`, and `@example` tags where applicable. See `.agent/rules/docstrings.md` for standards.
16. **Agent Meta-Maintenance:** Update `AGENTS.md` and `.agent/rules` files when you add/modify features that future agents should know about. Keep rules concise (<12,000 chars per file), avoid duplication, and resolve conflicts. See `.agent/rules/meta-maintenance.md` for guidelines.
17. **Shared Data Toolkit:** This template ships an isomorphic data/array/object utility toolkit built on [Remeda](https://github.com/remeda/remeda). Reach for it before hand-rolling array/object plumbing. Import from `@/backend/utils/data` on the Worker side and `@/lib/data` on the frontend — both re-export the same isomorphic core at `@/shared/data-utils`. It exposes curated Remeda re-exports (`pipe`, `groupBy`, `unique`, `sortBy`, `pick`, `difference`, …), the full Remeda surface as `R`, and template helpers Remeda doesn't ship (`diffArrays`, `findWhere`, `toggleInArray`, `moveItem`, `keyBy`, `compact`, `ensureArray`, `deal`, `truncate`, `tryParseJson`). Add genuinely-shared helpers to the shared core (never duplicate per-surface). Live demo + docs at `/showcase/utilities`. See `.agent/rules/data-utilities.md`.

## ReUI design system

Adopted 2026-09-25; the frontend was rebuilt from the ground up on ReUI Pro
blocks 2026-09-26. Authority: the ReUI Astro React design system
(https://claude.ai/artifact/74kf88M44NMA7Xh769vJge) and `~/AGENTS-frontend.md`.

- **Shell:** ReUI `app-shell-2`, adapted in `src/frontend/components/blocks/app-shell-2/`
  and mounted once by `layouts/BaseLayout.astro` (one island; pages are its slot).
  Two deliberate departures from the stock block: the sidebar-footer WORKSPACE
  SWITCHER is removed (this template is single-tenant, and a tenant picker that
  switches nothing is worse than none), and the header's WORKSPACE BREADCRUMB is
  replaced by the current page's title from the route table. Do not reinstate
  either without a real tenant model behind it.
- **Nav:** config-driven from `src/frontend/lib/config.ts` — `navGroups` (max two
  levels; a third level is a page, not a nav item), `chatSurfaces`, and
  `devLinks` (`/docs`, `/openapi.json`, `/scalar`, `/swagger`, always in the
  rail). Add a page = add an entry there; the header title and the ⌘K palette
  (`allNavEntries()`) both read from it. Never hardcode a second copy of the
  route list in a page.
- **Page chrome:** `PageBody` + `PageToolbar` from
  `blocks/app-shell-2/components/page-shell`, rendered without a client
  directive. No emoji headings.
- **SELECTS — the trap that keeps coming back.** These are **Base UI** selects,
  not Radix. `Select.Value` renders the RAW VALUE unless `Select.Root` is given
  an `items` prop, so a Radix-shaped `<SelectValue placeholder="All" />` shows
  `__all__` or `in_progress` in the trigger on load. ALWAYS use `OptionSelect` /
  `FilterSelect` from `@/components/ui/option-select` (promoted out of ReUI's
  own `solution-files-1`, which composes it correctly). Never write a raw
  `<Select>` + `<SelectValue placeholder>`.
- **Tokens:** `styles/global.css` carries the design-system tokens incl. ReUI's
  extended `info`/`success`/`warning`/`destructive-foreground`/`invert`. Use a
  `*-foreground` state colour only on its tinted ground (`bg-success/10`). No raw
  hex, `rgb()`, or Tailwind palette utilities.
- **Dark default:** `<html class="dark">`; the header toggle stores only an explicit "light".
- **Surface:** hold ONE surface per screen — `frame` or `card`, never both.
  Most screens are `frame`; `kanban-board-1`, `solution-files-1` and a few
  ai-chat blocks are `card`, which is their own surface. Pass `surface` on every
  ReUI search / `compose_page`.
- **Install:** `bash scripts/reui-add.sh <item…>` — never raw `shadcn add`. The
  dual-root `@/*` tsconfig path makes the CLI write to `src/components` and leave
  `from "cn"` imports; the wrapper fixes both, never overwrites, reads
  `REUI_LICENSE_KEY` from the tokens CLI and serializes parallel installs.
  Blocks land in `components/blocks/<name>/`, ReUI primitives in `components/reui/`.
  **To let the CLI write a canonical primitive, DELETE the stale one first** —
  the wrapper answers "n" to every overwrite prompt by design.
- **Charts:** no pies, ever (the dashboard's "status pie" dataset renders as a
  horizontal ranked bar); bars horizontal unless the x-axis is time; `chart-1..5`
  in order. **Tables:** ReUI Data Grid. **Filters:** ReUI Filters builder.
- **Verification:** `bash scripts/check.sh` builds into a throwaway directory, so
  several agents can check in parallel without corrupting `./dist`. The Astro
  build STRIPS types rather than checking them — always also run
  `pnpm run typecheck`. `pnpm run selfcheck` runs the plain-assert checks in
  `scripts/selfcheck.mjs`.
- **Local UI dev without Cloudflare auth:** `CF_REMOTE_BINDINGS=0 pnpm exec astro dev`
  renders pages without remote bindings. `/api/*` is served by the Hono worker, so
  data and chat only work under `pnpm run build && pnpm exec wrangler dev`.

## Template App Surface (reference implementation)

This template ships a real, running app so new projects inherit working
patterns (extend or delete the pieces you don't need). All of it is wired to D1
via Hono; **there is no mock data anywhere and none may be added**. If a block
decoration has no real backing, remove the decoration — do not fake it.

- **AI = core-guardian, nothing else.** There are NO Durable Objects and NO
  Agents SDK in this template (removed 2026-09-26; wrangler migration `v5`
  deletes the old classes). Every model call goes through
  **`src/backend/ai/guardian/`** over the `CORE_GUARDIAN` service binding
  (`service: core-guardian`, `entrypoint: GuardianRpc`, `remote: true`). No `ai`
  binding, no provider SDKs. Import from the folder's `index.ts`, never from the
  files inside it.
  - **Every `GuardianRpc` method has a wrapper. Copy from
    `guardian/examples.ts`** — worked samples that `pnpm run typecheck`
    compiles, so they cannot drift from the API:

    | Need | Call |
    |---|---|
    | One completion | `guardianChat(env, { task, messages, importance?, model?: "auto" })` |
    | Tool calling | `guardianChat(env, { tools, messages })` → `toolCalls`; sending `tools` adds `capabilities: ["tools"]` for you |
    | Streaming | `guardianStream` + `readGuardianStream` (full version: `POST /api/chat/stream`) |
    | Embeddings | `embed(env, texts)` → `number[][]` (bge-small, 100 per call) + `cosineSimilarity` |
    | Any other Workers AI model | `guardianWorkersAi(env, model, input, task)` |
    | Preview a route, no spend | `routeGuardian(env, sameOptionsAsTheRun)`; catalog: `guardianUseCases` |
    | Jules / Stitch / orchestration | `guardianToolkits` + `guardianTool(env, "jules.open_session", input)`, or raw `guardianJules` / `guardianStitch` / `guardianOrchestration` |

    Let guardian route: routing hints or a sentinel `model` (`auto`, `best`,
    `budget`, `cheapest`), never a concrete model unless you must. Every
    wrapper throws `GuardianError` with guardian's own message on a refusal.
    `scripts/selfcheck-guardian-surface.mjs` pins each wrapper to its method.
  - **`guardian/config.ts` builds EVERY payload.** `buildRunPayload` is the one
    construction site; `GUARDIAN_TASKS` holds the task labels so the routing log
    stays greppable. Change what is sent to the router by editing that file.
  - **The project name is a var, not a literal.** `vars.GUARDIAN_PROJECT` in
    `wrangler.jsonc` is what core-guardian bills and logs against, and
    `scripts/set-guardian-project.mjs` keeps it equal to the Worker's own `name`
    on every deploy (`pnpm run deploy` runs it; `pnpm run guardian:project:check`
    fails on drift). A hardcoded name meant a forked Worker reported its spend
    under the template's name with nothing looking broken — so a missing var now
    THROWS (`GuardianConfigError`) rather than defaulting, `/api/health` reports
    the project it is billing to and fails the verdict when it is unset, and
    `/api/chat` answers 500 with the real reason instead of a 502 that reads as
    a transient outage.
  - Router 422 = no model in budget, 429 = breaker; map both to plain-language
    errors. A `GuardianConfigError` is NOT either of those — it is this Worker
    being wrong, and retrying will not help.
  - A module a plain-Node self-check must import needs **no value imports** —
    Node's strip-only TypeScript erases `import type` but cannot resolve an
    extensionless value import. That is why the SSE parser lives in
    `guardian/stream-read.ts`, separate from `guardian/stream.ts`.
- **Chat is one backend behind twelve faces.** `POST /api/chat/stream` is the
  endpoint; `src/frontend/lib/chat.ts` (`useChatThread`) is the only client.
  SSE events, all measured against the live router: `meta`, `routed`
  (provider/model from the response HEADERS, before the first token), `delta`
  (the answer), `reasoning` (the model's THINKING — a separate channel that must
  NEVER be appended to the answer), `usage` (token counts), `title` (the model
  titles a new thread on its first reply), `done` (persisted row + measured
  latency), `error`. D1 is the store: `chat_threads`, `chat_messages`,
  `chat_documents` (one editable PlateJS canvas per thread).
  **There is no model picker** — core-guardian chooses per request, so the UI
  offers a ROUTING PROFILE and reports the model that actually served the
  turn. The wire carries the PROFILE NAME (`fast` | `balanced` | `deep`), not
  routing dials: `/api/chat` takes `profile`, and `resolveProfile` in
  `guardian/config.ts` maps it to importance+complexity server-side. A closed
  set of three names is a far smaller thing to accept from an unauthenticated
  endpoint than two free knobs, and it keeps the profile definition in one
  place instead of duplicated in every client.
- **Pages** (Astro SSR + React islands inside the ReUI app shell):
  - `/`, `/dashboard`, `/analytics` — metric row, charts, and the core-guardian
    insight. Components under `components/{overview,dashboard}/`.
  - `/projects` (card grid), `/projects/new` (ReUI `wizard-2` — a real
    multi-step create that also writes starter tasks).
  - `/tasks` (ReUI `data-grid-grouping-4` — a TREE grid over the task hierarchy
    with rolled-up measures and an ancestor-preserving search), `/tasks/board`
    (ReUI `kanban-board-1`, drag writes a real PATCH), `/tasks/[id]`.
  - `/files` — ReUI `solution-files-1` Drive Explorer over `/api/files`: the
    tree is D1, the bytes are R2 (`R2_FILES_BUCKET`).
  - `/inbox` — ReUI `app-shell-4` two-pane mail, backed by Cloudflare **Email
    Routing**: the Worker `email()` handler (`backend/email/inbound.ts`) stores
    inbound mail in `email_messages`.
  - `/notes` — **PlateJS** rich-text editor; bodies persist as a versioned
    `{v,format:"plate",value}` envelope.
  - `/chat` — a gallery of twelve ReUI Pro `ai-chat-*` surfaces, each a real
    conversation against core-guardian, all on one backend and one client
    (`lib/chat.ts` + `components/chat/**`). `chatSurfaces` in `lib/config.ts`
    is the route table; the gallery and the sidebar both render from it.
    `/chat/copilot` (1) · `/chat/docked` (2, PlateJS canvas beside the thread)
    · `/chat/welcome` (3) · `/chat/sidebar` (4, quote a sentence to reply to it)
    · `/chat/sources` (5, six real collections set the answer scope)
    · `/chat/agentic` (6, a real multi-turn plan that files a real task)
    · `/chat/compare` (7, one prompt through two routing profiles, scored on
    measured latency/tokens/cost; a comparison is two threads, so it carries
    `?a` and `?b` rather than the usual single `?t`) · `/chat/voice` (8, MediaRecorder +
    SpeechRecognition, both feature-detected) · `/chat/branching` (9, a fork is
    a real sibling thread via `parent_thread_id`) · `/chat/scoped` (10) ·
    `/chat/stage` (11, framed receipts) · `/chat/support` (12, answers only
    from `/api/docs` and the drive's text files, and files a task when they do
    not cover the question).
    **The rule every one of them follows: if a block decoration has no real
    backing, it is removed, not faked.** No tool-calling layer exists, so no
    tool trace is drawn; no votes table exists, so no thumbs are shown.
  - `/activity` (ReUI `timeline-5`), `/notifications`,
    `/settings/{preferences,notifications,webhooks,advanced}` (ReUI `settings-3`).
  - `/docs` + `/playbook` — documentation using the Shiki-backed ReUI CodeBlock.
- **Schemas** live in `db/schemas/{projects,tasks,stats,settings,notifications,
  chat,inbox,files}/` (drizzle-zod + `*_TABLE_DESCRIPTION` /
  `*_COLUMN_DESCRIPTIONS` consumed by `/docs`; register every new table in
  `api/routes/docs.ts`).
  **drizzle-zod maps a `timestamp` column to a bare `z.date()` with NO
  coercion**, so a generated body schema silently rejects every date a JSON
  client can send. Coerce at the route (see `jsonDate` in `routes/tasks.ts`)
  whenever a date column must be writable over HTTP.
- **APIs**: `/api/{projects,tasks,team-notes,settings,webhooks,activity,
  notifications,dashboard,threads,chat,inbox,files}` — CRUD + `?q=` search +
  filters + pagination. Health: `/api/health` (D1 + a no-spend
  `CORE_GUARDIAN.useCases()` check that fails the verdict when the binding is
  down).
- **Shared frontend helpers**: `lib/api.ts` (`apiGet`/`apiSend`/`ApiError`),
  `lib/format.ts`, `lib/chat.ts`, `lib/events.ts`, and `components/common/**`
  (wire types, `useProjects`, the shared empty/error/chip/avatar primitives).
- **Shared data toolkit** (isomorphic, Remeda-backed): one core at
  `shared/data-utils.ts`, re-exported by `lib/data.ts` (`@/lib/data`) and
  `backend/utils/data.ts` (`@/backend/utils/data`). Live demo:
  `/showcase/utilities`.
- **Seed demo data**: `POST /api/seed` (idempotent) — projects, tasks, notes,
  webhooks, activity, notifications, and a drive of folders and files with REAL
  R2 objects behind them. `POST /api/inbox/seed` for demo mail. Locally:
  `pnpm run migrate:local`, then POST to the running worker.
- **SSR note**: `src/_worker.ts` exports `start(manifest)` + `createExports()`;
  page requests are rendered via `@astrojs/cloudflare/handler#handle`. Do NOT
  revert this to a bare `env.ASSETS.fetch()` fallback — that 404s every SSR page.
- **Auth**: signed session cookie only (no `users`/`sessions` table). Auth gates
  `/api/admin/*`; the feature APIs are intentionally open so the template runs
  out of the box. Tighten before production.
