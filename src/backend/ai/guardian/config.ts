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
import type { GuardianEffort, GuardianRoutingOptions, GuardianRunOptions } from "./types";

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
  /**
   * The embedding model `embed` uses. 384 dimensions: the smallest bge, and
   * Vectorize bills by dimension, so start here and widen only on evidence.
   */
  embeddingModel: "@cf/baai/bge-small-en-v1.5",
  /** bge's documented ceiling is 100 texts per call; `embed` batches to it. */
  embeddingBatch: 100,
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
  /** Text embedded through `embed`. Sent as the Workers AI task description. */
  embed: "embed",
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

/** The routing fields `GuardianRpc.run` and `GuardianRpc.route` both accept. */
interface GuardianRoutingPayload {
  project: string;
  importance: string;
  use_case: string;
  task?: string;
  complexity?: string;
  reasoning?: string;
  capabilities?: string[];
  budgetRange?: { minUsd?: number; maxUsd?: number };
  model?: string;
  provider?: string;
}

/** The shape `GuardianRpc.run` accepts. */
export interface GuardianRunPayload extends GuardianRoutingPayload {
  stream?: true;
  input: { messages: GuardianRunOptions["messages"]; tools?: GuardianRunOptions["tools"] };
}

/** The shape `GuardianRpc.route` accepts. */
export interface GuardianRoutePayload extends GuardianRoutingPayload {
  input?: { messages: GuardianRunOptions["messages"] };
}

/**
 * The routing half of every payload. Private: `buildRunPayload` and
 * `buildRoutePayload` are the two doors, and they must agree, which is easiest
 * when they share this.
 */
function routingFields(env: Env, options: GuardianRoutingOptions, tools: boolean): GuardianRoutingPayload {
  const { task, useCase, importance, complexity, reasoning, budgetRange, model, provider } = options;

  // Hoisted rather than written inline. `a ?? b ? c : d` parses as
  // `(a ?? b) ? c : d`, which is what is wanted here but reads like the
  // opposite — and this is the one function every model call passes through.
  const resolvedComplexity = complexity ?? GUARDIAN_DEFAULTS.complexity;

  // Sending tools without declaring the capability lets an `auto` route land
  // on a model that cannot call one: the run ends after one turn with prose
  // and no error to explain it. So the capability follows the tools here,
  // where no caller can forget it.
  const capabilities = new Set(options.capabilities ?? []);
  if (tools) capabilities.add("tools");

  return {
    project: guardianProject(env),
    importance: importance ?? GUARDIAN_DEFAULTS.importance,
    use_case: useCase ?? GUARDIAN_DEFAULTS.useCase,
    ...(task ? { task } : {}),
    ...(resolvedComplexity ? { complexity: resolvedComplexity } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(capabilities.size ? { capabilities: [...capabilities] } : {}),
    ...(budgetRange ? { budgetRange } : {}),
    ...(model ? { model } : {}),
    ...(provider ? { provider } : {}),
  };
}

/**
 * Build the payload for one run.
 *
 * @param env The Worker environment, which supplies the project identity.
 * @param options What this particular call wants: messages, task, routing hints, tools.
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
  const { messages, tools } = options;
  const hasTools = !!tools?.length;
  return {
    ...routingFields(env, options, hasTools),
    ...(stream ? { stream: true as const } : {}),
    input: { messages, ...(hasTools ? { tools } : {}) },
  };
}

/**
 * Build the payload for a dry-run routing decision: the same routing fields
 * `buildRunPayload` would send, so the preview and the real run cannot drift.
 *
 * @param env The Worker environment.
 * @param options The run you are about to make. `messages` is optional here;
 *   when given, guardian's complexity classifier reads it.
 * @returns The payload to hand to `GuardianRpc.route`.
 * @throws {GuardianConfigError} when the project name is not configured.
 */
export function buildRoutePayload(
  env: Env,
  options: GuardianRoutingOptions & Partial<Pick<GuardianRunOptions, "messages" | "tools">>,
): GuardianRoutePayload {
  return {
    ...routingFields(env, options, !!options.tools?.length),
    ...(options.messages ? { input: { messages: options.messages } } : {}),
  };
}

/**
 * Build the arguments for one `GuardianRpc.workersAi` call.
 *
 * `origin` is what guardian attributes the neurons to, so it is the project
 * name - the same ledger `run` bills - and never a literal.
 *
 * @param env The Worker environment.
 * @param model A Workers AI model id, e.g. `GUARDIAN_DEFAULTS.embeddingModel`.
 * @param input The model input, forwarded verbatim.
 * @param task A label for guardian's usage log; prefer `GUARDIAN_TASKS`.
 * @returns The positional arguments `workersAi` takes.
 * @throws {GuardianConfigError} when the project name is not configured.
 */
export function buildWorkersAiCall(
  env: Env,
  model: string,
  input: unknown,
  task?: string,
): [model: string, origin: string, input: unknown, opts: { taskDescription?: string }] {
  return [model, guardianProject(env), input, task ? { taskDescription: task } : {}];
}
