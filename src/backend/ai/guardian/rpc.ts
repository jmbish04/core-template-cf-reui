/**
 * @fileoverview The one place this Worker talks to the `CORE_GUARDIAN` binding.
 *
 * The generated `Service` binding type has no static knowledge of
 * `GuardianRpc`'s methods — they live in a different Worker's source tree — so
 * the cast happens here once instead of at every call site.
 *
 * A service binding, not `fetch`: a Worker fetching another Worker's
 * workers.dev hostname on the same account is refused with Cloudflare error
 * 1042, and the binding needs no API key because it is itself the trust
 * boundary.
 */

import type {
  GuardianRouteRequest,
  GuardianRoutingDecision,
  GuardianRunResult,
  GuardianToolkitManifest,
  GuardianUseCaseCatalog,
  GuardianWorkersAiResult,
} from "./types";

/**
 * Every method `GuardianRpc` exposes, as of core-guardian `origin/main` on
 * 2026-09-30 (`src/backend/guardian/ai-router/rpc.ts`). Call them through the
 * wrappers in this folder, which build the payload and turn a refusal into a
 * `GuardianError`; reach for the raw stub only for something they do not cover.
 */
export interface GuardianRpc {
  /** Route and execute one inference call. */
  run(payload: unknown): Promise<GuardianRunResult>;
  /** The routing decision `run` would make, without spending. */
  route(payload: unknown): Promise<GuardianRoutingDecision>;
  /** Every use_case and the models that currently serve it. */
  useCases(): Promise<GuardianUseCaseCatalog>;
  /** One attributed Workers AI call — embeddings live here, not in `run`. */
  workersAi(
    model: string,
    origin: string,
    input: unknown,
    opts?: { taskDescription?: string; operationId?: string },
  ): Promise<GuardianWorkersAiResult>;
  /** One call against `/api/jules` (repoless Jules sessions). GET/POST only. */
  jules(request: GuardianRouteRequest): Promise<{ status: number; body: unknown }>;
  /** One call against `/api/stitch` (Google Stitch proxy and mirror). */
  stitch(request: GuardianRouteRequest): Promise<{ status: number; body: unknown }>;
  /** One call against `/api/orchestration` (CRUD over the run tables, and `/run`). */
  orchestration(request: GuardianRouteRequest): Promise<{ status: number; body: unknown }>;
  /** The agent toolkit catalog, with each tool's input JSON Schema. */
  toolkits(): Promise<GuardianToolkitManifest>;
  /** Invoke one catalog tool by id, e.g. `stitch.projects`. */
  tool(toolId: string, input?: unknown): Promise<{ status: number; body: unknown }>;
}

/**
 * The core-guardian stub, typed.
 *
 * @param env The Worker environment carrying the `CORE_GUARDIAN` binding.
 * @returns The RPC stub.
 */
export function guardianRpc(env: Env): GuardianRpc {
  return env.CORE_GUARDIAN as unknown as GuardianRpc;
}

/**
 * Execute one run against the router.
 *
 * @param env The Worker environment.
 * @param payload A payload from `buildRunPayload`.
 * @returns Either `{ status, body }` or `{ stream }`, verbatim from the router.
 */
export function runGuardian(env: Env, payload: unknown): Promise<GuardianRunResult> {
  return guardianRpc(env).run(payload);
}
