/**
 * @fileoverview Tokens Service Example API Router.
 *
 * Demonstrates how to query the tokens service (`CORE_TK_CLI` service binding
 * over VPC tunnel) from Cloudflare Workers with graceful `try...catch` error
 * handling.
 *
 * Endpoints:
 *  - GET /api/tokens-example/status      — Check VPC tunnel connection and RPC health
 *  - GET /api/tokens-example/find        — Search tokens by keyword (names + descriptions)
 *  - GET /api/tokens-example/check/{name} — Verify a token's presence with safe fallback
 *
 * Mount at `/api/tokens-example` in `src/backend/api/index.ts`.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  getSecret,
  getTokensRpc,
  safeFetchToken,
  safeFindTokens,
} from "../../utils/secrets";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TokenItemSchema = z.object({
  name: z.string().openapi({ description: "Token key name (e.g. WORKER_API_KEY)" }),
  description: z.string().openapi({ description: "Brief description of the token's purpose" }),
});

const StatusResponseSchema = z.object({
  connected: z.boolean().openapi({ description: "Whether CORE_TK_CLI responded successfully" }),
  message: z.string().openapi({ description: "Human-readable status summary" }),
  tokenCount: z.number().optional().openapi({ description: "Total tokens cataloged in local database" }),
  error: z.string().optional().openapi({ description: "Graceful error message if offline" }),
  durationMs: z.number().openapi({ description: "RPC round-trip latency in milliseconds" }),
});

const FindQuerySchema = z.object({
  q: z.string().min(1).openapi({ description: "Keyword to search token names and descriptions" }),
});

const FindResponseSchema = z.object({
  success: z.boolean(),
  keyword: z.string(),
  matches: z.array(TokenItemSchema),
  count: z.number(),
  error: z.string().optional(),
});

const CheckParamSchema = z.object({
  name: z.string().min(1).openapi({ description: "Token key name to check" }),
});

const CheckResponseSchema = z.object({
  name: z.string(),
  exists: z.boolean(),
  source: z.enum(["core_tk_cli_rpc", "secrets_store", "environment", "none"]),
  preview: z.string().openapi({ description: "Redacted representation (values are NEVER leaked in full)" }),
  error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const tokensExampleRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /status — Verify the CORE_TK_CLI binding health with graceful try/catch.
 */
tokensExampleRouter.openapi(
  createRoute({
    method: "get",
    path: "/status",
    operationId: "getTokensServiceStatus",
    summary: "Check tokens service connectivity over VPC",
    description: "Calls CORE_TK_CLI.list() over the VPC tunnel to verify end-to-end connectivity.",
    responses: {
      200: {
        description: "Status report (returns 200 even if offline, reporting error gracefully)",
        content: { "application/json": { schema: StatusResponseSchema } },
      },
    },
  }),
  async (c) => {
    const start = Date.now();
    try {
      const tk = getTokensRpc(c.env);
      if (!tk) {
        return c.json({
          connected: false,
          message: "CORE_TK_CLI service binding not bound in worker environment",
          durationMs: Date.now() - start,
          error: "Missing CORE_TK_CLI in wrangler.jsonc services",
        });
      }

      // Live RPC call over VPC into local tokens service
      const tokens = await tk.list();
      return c.json({
        connected: true,
        message: `Connected to tokens service via VPC tunnel (${tokens.length} tokens indexed)`,
        tokenCount: tokens.length,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      // Graceful error handling: catch network/VPC/tunnel issues without throwing 500
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[tokens-example] Status probe failed gracefully:", message);
      return c.json({
        connected: false,
        message: "Failed to reach local tokens service through VPC tunnel",
        error: message,
        durationMs: Date.now() - start,
      });
    }
  },
);

/**
 * GET /find — Search tokens with keyword filtering and graceful try/catch.
 */
tokensExampleRouter.openapi(
  createRoute({
    method: "get",
    path: "/find",
    operationId: "findTokensExample",
    summary: "Search tokens by keyword",
    description: "Searches token names and descriptions via CORE_TK_CLI.find(). Safe for transcripts.",
    request: { query: FindQuerySchema },
    responses: {
      200: {
        description: "Matching tokens list",
        content: { "application/json": { schema: FindResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { q } = c.req.valid("query");

    // Use the safeFindTokens helper which encapsulates the try/catch logic
    const result = await safeFindTokens(c.env, q);

    if (!result.success) {
      return c.json({
        success: false,
        keyword: q,
        matches: [],
        count: 0,
        error: result.error,
      });
    }

    return c.json({
      success: true,
      keyword: q,
      matches: result.data,
      count: result.data.length,
    });
  },
);

/**
 * GET /check/{name} — Check presence of a specific token with graceful try/catch and redacted preview.
 */
tokensExampleRouter.openapi(
  createRoute({
    method: "get",
    path: "/check/{name}",
    operationId: "checkTokenExample",
    summary: "Check token presence and resolution source",
    description: "Resolves a secret using the graceful fallback cascade (CORE_TK_CLI -> Secrets Store -> env).",
    request: { params: CheckParamSchema },
    responses: {
      200: {
        description: "Resolution result with redacted preview",
        content: { "application/json": { schema: CheckResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { name } = c.req.valid("param");

    try {
      // 1. First test if CORE_TK_CLI has it directly
      const rpc = getTokensRpc(c.env);
      let foundInRpc = false;
      if (rpc) {
        try {
          foundInRpc = await rpc.has(name);
        } catch (rpcErr) {
          console.warn(`[tokens-example] RPC has() check failed for '${name}':`, rpcErr);
        }
      }

      if (foundInRpc) {
        // Fetch value safely with try/catch
        const res = await safeFetchToken(c.env, name);
        if (res.success && res.data) {
          const len = res.data.length;
          const preview = len > 8 ? `${res.data.slice(0, 4)}...[${len} chars]` : `[present: ${len} chars]`;
          return c.json({
            name,
            exists: true,
            source: "core_tk_cli_rpc" as const,
            preview,
          });
        }
      }

      // 2. Fall back to standard getSecret cascade (handles Secrets Store & env)
      const fallbackValue = await getSecret(c.env, name);
      if (fallbackValue) {
        const len = fallbackValue.length;
        const preview = len > 8 ? `${fallbackValue.slice(0, 4)}...[${len} chars]` : `[present: ${len} chars]`;
        return c.json({
          name,
          exists: true,
          source: "secrets_store" as const,
          preview,
        });
      }

      // Token not found anywhere
      return c.json({
        name,
        exists: false,
        source: "none" as const,
        preview: "[not configured]",
      });
    } catch (err) {
      // Top-level error catch ensures graceful degradation
      const message = err instanceof Error ? err.message : String(err);
      return c.json({
        name,
        exists: false,
        source: "none" as const,
        preview: "[error]",
        error: `Gracefully handled resolution error: ${message}`,
      });
    }
  },
);
