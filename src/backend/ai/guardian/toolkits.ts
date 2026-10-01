/**
 * @fileoverview core-guardian's agent toolkits: Jules, Stitch, orchestrations.
 *
 * Two ways in, and they reach the same handlers:
 *   - `guardianToolkits` / `guardianTool` — the catalog. Every tool has an id
 *     (`jules.open_session`, `stitch.projects`, ...) and an input JSON Schema,
 *     and guardian audits every state-changing call. Prefer this: a new
 *     guardian tool appears here with no change to this Worker.
 *   - `guardianJules` / `guardianStitch` / `guardianOrchestration` — one raw
 *     call against that surface's REST routes, for anything the catalog does
 *     not wrap. Paths are relative to the surface and guardian refuses (400)
 *     any path outside it.
 *
 * Every helper returns the body on 2xx and throws `GuardianError` otherwise,
 * carrying guardian's `error` message.
 */

import { GuardianError } from "./errors";
import { guardianRpc } from "./rpc";
import type { GuardianRouteRequest, GuardianToolkitManifest } from "./types";

/** Return the body of a 2xx, or throw with guardian's own reason. */
function settle<T>({ status, body }: { status: number; body: unknown }): T {
  if (status >= 200 && status < 300) return body as T;
  throw new GuardianError(status, body);
}

/**
 * Every toolkit guardian offers, whether it is configured, and each tool's
 * input schema. Read it before calling `guardianTool`.
 *
 * @param env The Worker environment.
 * @returns The manifest.
 */
export function guardianToolkits(env: Env): Promise<GuardianToolkitManifest> {
  return guardianRpc(env).toolkits();
}

/**
 * Invoke one catalog tool.
 *
 * @param env The Worker environment.
 * @param toolId An id from `guardianToolkits`, e.g. `stitch.projects`.
 * @param input The tool's input; guardian validates it against the schema.
 * @returns The tool's `output`.
 * @throws {GuardianError} 400 bad input, 404 unknown tool or row, 409 wrong
 *   state, 503 toolkit unconfigured, 502 upstream failure.
 */
export async function guardianTool<T = unknown>(env: Env, toolId: string, input: unknown = {}): Promise<T> {
  return settle<{ output: T }>(await guardianRpc(env).tool(toolId, input)).output;
}

/**
 * One call against core-guardian's `/api/jules` (repoless Jules sessions).
 *
 * @param env The Worker environment.
 * @param request `method` GET or POST; `path` e.g. `/sessions`,
 *   `/sessions/{id}/prompts`, `/sessions/{id}/results`, `/usage`.
 * @returns The route's JSON body.
 * @throws {GuardianError} on any non-2xx.
 * @example
 * const { sessionId } = await guardianJules<{ sessionId: string }>(env, {
 *   method: "POST", path: "/sessions", body: { project: guardianProject(env), title: "Audit" },
 * });
 */
export async function guardianJules<T = unknown>(
  env: Env,
  request: GuardianRouteRequest & { method: "GET" | "POST" },
): Promise<T> {
  return settle<T>(await guardianRpc(env).jules(request));
}

/**
 * One call against core-guardian's `/api/stitch` (Google Stitch). `POST /mcp`
 * with a JSON-RPC body is the raw Stitch MCP passthrough, so this Worker never
 * needs the Stitch key.
 *
 * @param env The Worker environment.
 * @param request e.g. `{ method: "GET", path: "/projects" }`.
 * @returns The route's JSON body.
 * @throws {GuardianError} on any non-2xx.
 */
export async function guardianStitch<T = unknown>(env: Env, request: GuardianRouteRequest): Promise<T> {
  return settle<T>(await guardianRpc(env).stitch(request));
}

/**
 * One call against core-guardian's `/api/orchestration`: CRUD over
 * `/tables/{table}[/{id}]`, and `POST /run`.
 *
 * @param env The Worker environment.
 * @param request e.g. `{ method: "GET", path: "/tables" }`.
 * @returns The route's JSON body.
 * @throws {GuardianError} on any non-2xx.
 */
export async function guardianOrchestration<T = unknown>(env: Env, request: GuardianRouteRequest): Promise<T> {
  return settle<T>(await guardianRpc(env).orchestration(request));
}
