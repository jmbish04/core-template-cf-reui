/**
 * @fileoverview Cloudflare Workers entry point for Astro SSR + Hono API.
 *
 * `wrangler.jsonc` `main` points HERE, at source. @astrojs/cloudflare 13+ builds
 * with @cloudflare/vite-plugin, which resolves `main` at config time — so it must
 * never point at build output (`dist/_worker.js/index.js` fails a clean build
 * with "main field ... doesn't point to an existing file"). The adapter's default
 * entry is `@astrojs/cloudflare/entrypoints/server` (`{ fetch: handle }`); this
 * file wraps that same `handle` so it can also route the Hono API and export the
 * Email Routing handler.
 *
 * Routes:
 *   - `/api/*` + doc URLs → the Hono app
 *   - everything else    → Astro SSR via the adapter's `handle()`, which also
 *                          falls through to the `ASSETS` binding for static files.
 *
 * There are no Durable Objects / Agents SDK agents in this Worker. Every
 * inference call routes through the `CORE_GUARDIAN` service binding (see
 * `backend/ai/guardian/`); chat + notifications persist to D1 directly.
 *
 * `email(message, env, ctx)` is Cloudflare Email Routing's inbound entry point.
 * It parses + stores received mail in D1 for the `/inbox` showcase (see
 * `backend/email/inbound.ts`).
 */

import { handle } from "@astrojs/cloudflare/handler";
import type { ExportedHandler } from "@cloudflare/workers-types";

import { app as honoApp } from "./backend/api/index";
import { handleInboundEmail } from "./backend/email/inbound";

/** True for paths the Hono API owns (REST + OpenAPI doc surfaces). */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar" ||
    pathname === "/scaler"
  );
  // NOTE: `/docs` is intentionally NOT an API path — it is served as an Astro
  // SSR page (`src/frontend/pages/docs/index.astro`). The docs metadata API is
  // mounted at `/api/docs/*`, which is covered by the `/api/` prefix above.
}

// `as any` bridges the lib.dom (Hono) vs @cloudflare/workers-types `Request` friction.
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (isApiPath(new URL(request.url).pathname)) {
      return honoApp.fetch(request as any, env, ctx);
    }
    return handle(request as any, env as any, ctx as any);
  },

  async email(message: any, env: Env, ctx: ExecutionContext) {
    await handleInboundEmail(message, env, ctx);
  },
} as unknown as ExportedHandler<Env>;

export default handler;
