/**
 * @fileoverview The one place this Worker talks to the `CORE_GUARDIAN` binding.
 *
 * The generated `Service` binding type has no static knowledge of
 * `GuardianRpc`'s methods — they live in a different Worker's source tree — so
 * the cast happens here once instead of at every call site.
 */

import type { GuardianRunResult } from "./types";

/** The subset of `GuardianRpc` this Worker calls. */
interface GuardianRpc {
  run(payload: unknown): Promise<GuardianRunResult>;
  useCases(): Promise<unknown>;
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
