/**
 * @fileoverview Wire types for the core-guardian RPC contract.
 *
 * These mirror what `GuardianRpc.run` accepts and answers (its source lives in
 * `core-guardian/src/backend/guardian/ai-router/rpc.ts`). They are kept in one
 * file with no imports so every other module in this folder — and any caller —
 * can depend on the shape without dragging in behaviour.
 */

/** A single chat turn sent to the model. */
export interface GuardianMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** How hard the router should try. Passed straight through as routing hints. */
export type GuardianEffort = "low" | "medium" | "high";

/** Everything a caller may vary about one run. */
export interface GuardianRunOptions {
  messages: GuardianMessage[];
  /**
   * Free-form label for the `ai_routing_decisions` log, e.g. "chat_reply".
   * Prefer a constant from `GUARDIAN_TASKS` so the log stays greppable.
   */
  task?: string;
  /** Guardian use_case. Defaults to `GUARDIAN_DEFAULTS.useCase`. */
  useCase?: string;
  importance?: GuardianEffort;
  complexity?: GuardianEffort;
}

/** Back-compat alias for the name this interface shipped under. */
export type GuardianChatOptions = GuardianRunOptions;

/** A settled, non-streaming reply plus what the router charged for it. */
export interface GuardianChatResult {
  text: string;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  requestUuid: string | null;
}

/** Which provider and model core-guardian actually routed a run to. */
export interface GuardianRouted {
  provider: string | null;
  model: string | null;
  requestUuid: string | null;
}

/** Token accounting core-guardian reports on the final stream frame. */
export interface GuardianUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** One thing that happened on the wire while the model was answering. */
export type GuardianStreamEvent =
  /** A chunk of the visible answer. */
  | { type: "delta"; text: string }
  /** A chunk of the model's reasoning, when it is a thinking model. */
  | { type: "reasoning"; text: string }
  /** Final token counts. Arrives once, after the last delta. */
  | { type: "usage"; usage: GuardianUsage };

/**
 * What `GuardianRpc.run` answers: a status-and-body pair, or a live stream
 * when the payload asked for one.
 */
export type GuardianRunResult = { status: number; body: unknown } | { stream: Response };
