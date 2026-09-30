/**
 * @fileoverview Every core-guardian payload is built here, and nowhere else.
 *
 * WHY THIS FILE EXISTS: the run payload carries the identity core-guardian
 * bills and logs against. That used to be a string literal inside the client,
 * which meant a project forked from this template kept reporting its spend and
 * its routing decisions under the template's name until someone noticed —
 * and nothing looked broken while it happened.
 *
 * The project name now comes from the `GUARDIAN_PROJECT` var in
 * `wrangler.jsonc`, which `scripts/set-guardian-project.mjs` keeps equal to the
 * Worker's own `name` on every deploy. Rename the Worker and the attribution
 * follows it, with no second place to remember.
 *
 * Change what is sent to the router by editing this file. `buildRunPayload` is
 * the single construction site; the client, the stream and the titler all go
 * through it.
 */

import { GuardianConfigError } from "./errors";
import type { GuardianEffort, GuardianRunOptions } from "./types";

/**
 * Defaults applied to every run a caller does not override.
 *
 * `useCase` must be one core-guardian knows — `CORE_GUARDIAN.useCases()` lists
 * them, and the `/api/health` check calls exactly that.
 */
export const GUARDIAN_DEFAULTS = {
  useCase: "chat",
  importance: "low",
  complexity: undefined,
} as const;

/**
 * The task labels this Worker sends.
 *
 * Collected here so the `ai_routing_decisions` log stays greppable: a task
 * spelled two ways in two routes is two things as far as any later analysis
 * is concerned.
 */
export const GUARDIAN_TASKS = {
  /** A reply in the /chat surfaces. */
  chatReply: "chat_reply",
  /** The short thread title generated on a thread's first reply. */
  threadTitle: "threads_title",
  /** Follow-up prompt suggestions for a thread. */
  threadFollowups: "threads_followups",
  /** The dashboard's plain-language read of the current numbers. */
  dashboardInsights: "dashboard_insights",
} as const;

export type GuardianTask = (typeof GUARDIAN_TASKS)[keyof typeof GUARDIAN_TASKS];

/**
 * The routing profiles a REQUEST may ask for.
 *
 * The chat surfaces show this as a picker. The server owns the mapping
 * deliberately: a closed set of three names is a far smaller thing to accept
 * from an unauthenticated caller than two free routing dials, and it keeps the
 * profile definition in one place instead of duplicated in the client.
 *
 * core-guardian still chooses the provider and model itself — these are hints,
 * not a model name, which is why there is no model list anywhere in this repo.
 */
export const ROUTING_PROFILES = {
  fast: { importance: "low", complexity: "low" },
  balanced: { importance: "medium", complexity: "medium" },
  deep: { importance: "high", complexity: "high" },
} as const satisfies Record<string, { importance: GuardianEffort; complexity: GuardianEffort }>;

export type RoutingProfile = keyof typeof ROUTING_PROFILES;

/** Every profile name, for a zod enum at a route boundary. */
export const ROUTING_PROFILE_NAMES = Object.keys(ROUTING_PROFILES) as [RoutingProfile, ...RoutingProfile[]];

/**
 * Turn a profile name into the routing hints the router understands.
 *
 * @param profile A profile name, or undefined for the defaults.
 * @returns The importance/complexity pair to send.
 * @example
 * const hints = resolveProfile("deep"); // { importance: "high", complexity: "high" }
 */
export function resolveProfile(
  profile: RoutingProfile | undefined,
): { importance: GuardianEffort; complexity?: GuardianEffort } {
  if (!profile) {
    return { importance: GUARDIAN_DEFAULTS.importance, complexity: GUARDIAN_DEFAULTS.complexity };
  }
  return ROUTING_PROFILES[profile];
}

/**
 * The project core-guardian attributes this Worker's spend and decisions to.
 *
 * @param env The Worker environment.
 * @returns The configured project name.
 * @throws {GuardianConfigError} when `GUARDIAN_PROJECT` is unset or blank.
 *   Deliberately loud: a missing value is a misconfiguration, and defaulting
 *   would bill a real run to whatever name happened to be in the code.
 * @example
 * const project = guardianProject(env); // "core-template-cfw-assets-astro-shadcn"
 */
export function guardianProject(env: Env): string {
  // `wrangler types` generates this var as a STRING LITERAL type, so TypeScript
  // believes it can never be missing. At runtime it can: a deploy that skipped
  // the script, a hand-edited `vars` block, a `wrangler dev` pointed at another
  // config. The cast is what lets us check something the type insists is
  // impossible — the absence is real even when the type denies it.
  const project = (env as { GUARDIAN_PROJECT?: string }).GUARDIAN_PROJECT?.trim();
  if (!project) {
    throw new GuardianConfigError(
      "GUARDIAN_PROJECT is not set. It lives in wrangler.jsonc under `vars` and is " +
        "kept equal to the Worker's `name` by scripts/set-guardian-project.mjs, which " +
        "runs as part of `pnpm run deploy`. Run it, or set the var by hand.",
    );
  }
  return project;
}

/** The shape `GuardianRpc.run` accepts. */
export interface GuardianRunPayload {
  project: string;
  importance: string;
  use_case: string;
  task?: string;
  complexity?: string;
  stream?: true;
  input: { messages: GuardianRunOptions["messages"] };
}

/**
 * Build the payload for one run.
 *
 * @param env The Worker environment, which supplies the project identity.
 * @param options What this particular call wants: messages, task, routing hints.
 * @param stream True to ask the router for a live stream instead of a settled body.
 * @returns The payload to hand to `GuardianRpc.run`.
 * @throws {GuardianConfigError} when the project name is not configured.
 * @example
 * const payload = buildRunPayload(env, { messages, task: GUARDIAN_TASKS.chatReply });
 */
export function buildRunPayload(
  env: Env,
  options: GuardianRunOptions,
  stream = false,
): GuardianRunPayload {
  const { messages, task, useCase, importance, complexity } = options;

  // Hoisted rather than written inline. `a ?? b ? c : d` parses as
  // `(a ?? b) ? c : d`, which is what is wanted here but reads like the
  // opposite — and this is the one function every model call passes through.
  const resolvedComplexity = complexity ?? GUARDIAN_DEFAULTS.complexity;

  return {
    project: guardianProject(env),
    importance: importance ?? GUARDIAN_DEFAULTS.importance,
    use_case: useCase ?? GUARDIAN_DEFAULTS.useCase,
    ...(task ? { task } : {}),
    ...(resolvedComplexity ? { complexity: resolvedComplexity } : {}),
    ...(stream ? { stream: true as const } : {}),
    input: { messages },
  };
}
