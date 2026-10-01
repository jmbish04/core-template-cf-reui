/**
 * @fileoverview Wire types for the core-guardian RPC contract.
 *
 * These mirror what `GuardianRpc` accepts and answers. core-guardian does not
 * publish its types, so each shape here was copied by hand from its source on
 * 2026-09-30 and narrowed to what a caller reads:
 *   - `run` / `route` payloads: `runBody` / `routeBody` in
 *     `core-guardian/src/backend/api/routes/ai-router.ts`
 *   - `GuardianRoutingDecision`: `RoutingDecision` in
 *     `src/backend/guardian/ai-router/routing/types.ts`
 *   - `GuardianUseCaseCatalog`: `buildUseCases` in `api/routes/ai-router.ts`
 *   - `GuardianWorkersAiResult`: `WorkersAiProxyResult` in `guardian/ai-proxy.ts`
 *   - `GuardianToolkitManifest`: `manifest` in `guardian/toolkits/catalog.ts`
 *   - the class itself: `src/backend/guardian/ai-router/rpc.ts`
 * If guardian changes one of those, change it here too. They are kept in one
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

/** One tool call the model asked for (OpenAI chat-completions shape). */
export interface GuardianToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Any turn a run may carry: a plain turn, the assistant turn that asked for
 * tools, or the result of one tool call sent back on the next run.
 */
export type GuardianInputMessage =
  | GuardianMessage
  | { role: "assistant"; content: string | null; tool_calls: GuardianToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** A tool the model may call (OpenAI chat-completions shape). */
export interface GuardianToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

/**
 * The routing sentinels. Send one of these (or nothing) and core-guardian
 * picks the model. A concrete model id pins it - and then `provider` is
 * required - which takes back the decision the router exists to make.
 */
export type GuardianModelSentinel = "auto" | "best" | "budget" | "cheapest";

/** Routing hints shared by `run` and the dry-run `route`. */
export interface GuardianRoutingOptions {
  /**
   * Free-form label for the `ai_routing_decisions` log, e.g. "chat_reply".
   * Prefer a constant from `GUARDIAN_TASKS` so the log stays greppable.
   */
  task?: string;
  /** Guardian use_case. Defaults to `GUARDIAN_DEFAULTS.useCase`. */
  useCase?: string;
  importance?: GuardianEffort;
  complexity?: GuardianEffort;
  reasoning?: GuardianEffort;
  /** What the chosen model must support, e.g. `["tools"]`. */
  capabilities?: string[];
  /** Refuse (422) rather than run anything outside this spend window. */
  budgetRange?: { minUsd?: number; maxUsd?: number };
  /** A sentinel by default. A concrete id needs `provider` too. */
  model?: GuardianModelSentinel | (string & {});
  provider?: string;
}

/** Everything a caller may vary about one run. */
export interface GuardianRunOptions extends GuardianRoutingOptions {
  messages: GuardianInputMessage[];
  /**
   * Tools the model may call. Sending any also adds `"tools"` to
   * `capabilities`, so routing can never land on a model that cannot call one.
   */
  tools?: GuardianToolDefinition[];
}

/** Back-compat alias for the name this interface shipped under. */
export type GuardianChatOptions = GuardianRunOptions;

/** A settled, non-streaming reply plus what the router charged for it. */
export interface GuardianChatResult {
  text: string;
  /** Tool calls the model asked for. Empty unless the run sent `tools`. */
  toolCalls: GuardianToolCall[];
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

/** What `GuardianRpc.route` answers: the decision `run` would make, without spending. */
export interface GuardianRoutingDecision {
  status: "routed" | "no_model_in_budget" | "no_candidates";
  provider: string | null;
  model: string | null;
  tier: string | null;
  complexity: GuardianEffort | null;
  complexitySource: "caller" | "heuristic" | null;
  estCostUsd: number | null;
  reason: string[];
  quotaState: { provider: string; worst: number; nearReset: boolean }[];
  excluded: { model: string; reason: string }[];
  lowestAvailable?: { provider: string; model: string; estCostUsd: number };
}

/** What `GuardianRpc.useCases` answers: every use_case and the models that serve it. */
export interface GuardianUseCaseCatalog {
  useCases: {
    key: string;
    description: string;
    capabilityFloor: string;
    tags: string[];
    matchingModels: {
      provider: string;
      model: string;
      score: number;
      estInPerM: number | null;
      estOutPerM: number | null;
      quotaAlive: boolean;
    }[];
  }[];
}

/** What `GuardianRpc.workersAi` answers. */
export type GuardianWorkersAiResult =
  | {
      ok: true;
      status: 200;
      body: unknown;
      registrationId: string;
      costUsd: number;
      /** Which of guardian's two Cloudflare accounts served it. */
      accountTier: "free" | "paid" | null;
      neurons: number;
    }
  | { ok: false; status: 400 | 429 | 502; error: string };

/** One call into a guardian route surface (`jules`, `stitch`, `orchestration`). */
export interface GuardianRouteRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Relative to the surface, e.g. `/sessions` for `/api/jules/sessions`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/** What `GuardianRpc.toolkits` answers: every agent toolkit and its tools. */
export interface GuardianToolkitManifest {
  version: number;
  toolkits: {
    id: string;
    title: string;
    description: string;
    available: boolean;
    unavailableReason?: string;
    tools: {
      id: string;
      title: string;
      description: string;
      mode: string;
      mutates: boolean;
      /** JSON Schema for the tool's input. */
      inputSchema: Record<string, unknown>;
    }[];
  }[];
}
