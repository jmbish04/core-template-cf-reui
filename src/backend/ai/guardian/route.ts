/**
 * @fileoverview Asking core-guardian questions that cost nothing: which model a
 * run WOULD get, and which use cases exist.
 *
 * Call `routeGuardian` before an expensive or budget-capped run to see the
 * model, its estimated cost and every model it ruled out — then decide whether
 * to run at all. `/api/health` already calls `useCases()` as its liveness
 * probe for the binding.
 */

import { buildRoutePayload } from "./config";
import { guardianRpc } from "./rpc";
import type {
  GuardianRoutingDecision,
  GuardianRoutingOptions,
  GuardianRunOptions,
  GuardianUseCaseCatalog,
} from "./types";

/**
 * Preview the routing decision for a run, without executing it.
 *
 * No spend: guardian may still run its complexity classifier, but no model
 * answers. A `status` of `no_model_in_budget` carries `lowestAvailable`, the
 * cheapest model that would have served — the same 422 `run` would return.
 *
 * @param env The Worker environment.
 * @param options The same options you would pass to `guardianChat`; `messages`
 *   is optional but lets guardian classify the prompt.
 * @returns The decision, verbatim.
 * @throws {GuardianConfigError} when `GUARDIAN_PROJECT` is unset.
 * @example
 * const decision = await routeGuardian(env, { useCase: "chat", budgetRange: { maxUsd: 0.01 } });
 * if (decision.status !== "routed") console.warn(decision.reason.join("; "));
 */
export function routeGuardian(
  env: Env,
  options: GuardianRoutingOptions & Partial<Pick<GuardianRunOptions, "messages" | "tools">>,
): Promise<GuardianRoutingDecision> {
  return guardianRpc(env).route(buildRoutePayload(env, options));
}

/**
 * Every use_case guardian knows, with the models that currently serve it and
 * whether each still has quota. Use it to pick a valid `useCase` instead of
 * guessing one.
 *
 * @param env The Worker environment.
 * @returns The catalog, verbatim.
 */
export function guardianUseCases(env: Env): Promise<GuardianUseCaseCatalog> {
  return guardianRpc(env).useCases();
}
