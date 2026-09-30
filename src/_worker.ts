/**
 * @fileoverview Cloudflare Workers entry point for Astro SSR + Hono API (the
 * `workerEntryPoint` for `@astrojs/cloudflare`).
 *
 * The adapter's generated `dist/_worker.js/index.js`:
 *   1. calls `start(manifest, args)` (if exported) to hand us the SSR manifest,
 *   2. calls `createExports()` to get the default fetch handler.
 *
 * Our handler routes:
 *   - `/api/*` + doc URLs → the Hono app
 *   - everything else    → Astro SSR via the adapter's `handle()` (which also
 *                          falls through to the `ASSETS` binding for static
 *                          files). This is the piece a naive `env.ASSETS.fetch`
 *                          custom entry forgets — without it, SSR pages 404.
 *
 * There are no Durable Objects / Agents SDK agents in this Worker. Every
 * inference call routes through the `CORE_GUARDIAN` service binding (see
 * `backend/ai/guardian/`); chat + notifications persist to D1 directly.
 *
 * In addition to `fetch`, the handler exports `email(message, env, ctx)` —
 * Cloudflare Email Routing's inbound entry point. It parses + stores received
 * mail in D1 for the `/inbox` showcase (see `backend/email/inbound.ts`). The
 * handler is attached to BOTH the object returned by `createExports().default`
 * (what the Astro adapter re-exports) AND the standalone default export.
 */

import { App } from "astro/app";
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

// Astro SSR app + manifest, populated by `start()` before the first request.
let astroApp: App | undefined;
let astroManifest: any;

/**
 * Called by the adapter's generated entry with the SSR manifest. We build the
 * Astro `App` here so the fetch handler can render pages.
 */
export function start(manifest: any, _args: unknown) {
  astroManifest = manifest;
  astroApp = new App(manifest);
}

/**
 * Build the worker's default fetch handler. Invoked by the adapter's
 * generated entry (after `start`).
 *
 * NOTE: `request as any` at the call sites bridges the lib.dom (Hono) vs
 * @cloudflare/workers-types (ASSETS / Astro) `Request` type friction.
 */
export function createExports() {
  const handler = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const url = new URL(request.url);

      // 1. REST API + OpenAPI docs → Hono.
      if (isApiPath(url.pathname)) {
        return honoApp.fetch(request as any, env, ctx);
      }

      // 2. Everything else → Astro SSR (with static-asset fallthrough).
      if (astroApp) {
        return handle(astroManifest, astroApp, request as any, env as any, ctx as any);
      }
      return env.ASSETS.fetch(request as any);
    },

    // Cloudflare Email Routing inbound handler. Invoked when a routing rule
    // targets this Worker (configured in the dashboard / via `wrangler email
    // routing`). Parses + stores the email in D1 for the `/inbox` showcase.
    async email(message: any, env: Env, ctx: ExecutionContext) {
      await handleInboundEmail(message, env, ctx);
    },
  } as unknown as ExportedHandler<Env>;

  return { default: handler };
}

/**
 * Default export for standalone (non-Astro) usage. The Astro build uses
 * `createExports().default` instead; this exists only so the module is also a
 * valid Worker on its own (no SSR — API + assets only).
 */
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      return honoApp.fetch(request as any, env, ctx);
    }
    return env.ASSETS.fetch(request as any);
  },

  // Email Routing inbound handler (mirrors the one on `createExports().default`)
  // so this module is a valid standalone Worker target for a routing rule too.
  async email(message: any, env: Env, ctx: ExecutionContext) {
    await handleInboundEmail(message, env, ctx);
  },
} as unknown as ExportedHandler<Env>;

export default handler;
