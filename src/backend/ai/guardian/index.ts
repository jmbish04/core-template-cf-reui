/**
 * @fileoverview core-guardian — the entry point for ALL inference in this Worker.
 *
 * There is no local model, no Workers AI binding and no provider SDK here: the
 * `CORE_GUARDIAN` service binding is the only door, and this folder is the only
 * code that opens it. See `~/AGENTS-ai.md`.
 *
 * The modules behind this barrel:
 *
 * | File         | Owns                                                      |
 * |--------------|-----------------------------------------------------------|
 * | `config.ts`  | **Every payload sent to the router**, and the project name |
 * | `types.ts`   | The wire contract, with no behaviour attached               |
 * | `errors.ts`  | `GuardianError` (router declined) vs `GuardianConfigError`  |
 * | `rpc.ts`     | The single typed cast of the `CORE_GUARDIAN` binding        |
 * | `chat.ts`    | `guardianChat` — one settled completion                     |
 * | `stream.ts`  | `guardianStream`; `stream-read.ts` parses its SSE body      |
 * | `title.ts`   | `guardianTitle` — the thread-title prompt                   |
 * | `followups.ts` | `guardianFollowups` — the suggested-next-prompt prompt    |
 * | `route.ts`   | `routeGuardian` (dry-run decision), `guardianUseCases`      |
 * | `workers-ai.ts` | `embed`, `cosineSimilarity`, `guardianWorkersAi`         |
 * | `toolkits.ts` | Jules / Stitch / orchestration, and the toolkit catalog   |
 * | `examples.ts` | Worked, type-checked samples of every capability. Read it |
 *
 * Import from here (`@/backend/ai/guardian`), not from the files inside; the
 * split is free to change as long as this surface does not.
 *
 * @example
 * import { guardianChat, GUARDIAN_TASKS } from "@/backend/ai/guardian";
 *
 * const { text, model } = await guardianChat(env, {
 *   task: GUARDIAN_TASKS.chatReply,
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 */

export {
  GUARDIAN_DEFAULTS,
  GUARDIAN_TASKS,
  ROUTING_PROFILES,
  ROUTING_PROFILE_NAMES,
  buildRoutePayload,
  buildRunPayload,
  buildWorkersAiCall,
  guardianProject,
  resolveProfile,
  type GuardianRoutePayload,
  type GuardianRunPayload,
  type GuardianTask,
  type RoutingProfile,
} from "./config";
export { GuardianConfigError, GuardianError } from "./errors";
export { guardianRpc, runGuardian, type GuardianRpc } from "./rpc";
export { guardianChat } from "./chat";
export { guardianStream, guardianStreamMeta, readGuardianStream } from "./stream";
export { guardianFollowups } from "./followups";
export { guardianTitle } from "./title";
export { guardianUseCases, routeGuardian } from "./route";
export { cosineSimilarity, embed, guardianWorkersAi, type GuardianWorkersAiOutput } from "./workers-ai";
export {
  guardianJules,
  guardianOrchestration,
  guardianStitch,
  guardianTool,
  guardianToolkits,
} from "./toolkits";
export type {
  GuardianChatOptions,
  GuardianChatResult,
  GuardianEffort,
  GuardianInputMessage,
  GuardianMessage,
  GuardianModelSentinel,
  GuardianRouteRequest,
  GuardianRouted,
  GuardianRoutingDecision,
  GuardianRoutingOptions,
  GuardianRunOptions,
  GuardianRunResult,
  GuardianStreamEvent,
  GuardianToolCall,
  GuardianToolDefinition,
  GuardianToolkitManifest,
  GuardianUsage,
  GuardianUseCaseCatalog,
  GuardianWorkersAiResult,
} from "./types";
