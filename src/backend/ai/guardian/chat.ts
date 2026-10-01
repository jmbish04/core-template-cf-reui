/**
 * @fileoverview `guardianChat` — one settled (non-streaming) completion.
 *
 * The chokepoint for every caller that wants a plain string back: thread
 * titles, follow-up suggestions, dashboard insights, and the non-streaming
 * chat path. Streaming lives in `./stream`.
 */

import { buildRunPayload } from "./config";
import { GuardianError } from "./errors";
import { runGuardian } from "./rpc";
import type { GuardianChatResult, GuardianRunOptions } from "./types";

/**
 * Extract the assistant text from core-guardian's OpenAI-shaped inner body.
 *
 * Tolerates the three shapes the router normalises upstream providers into,
 * because not all of them use chat-completions.
 */
function textFrom(body: any): string {
  return body?.choices?.[0]?.message?.content ?? body?.reply ?? body?.text ?? "";
}

/**
 * Run a chat completion through core-guardian's AI router.
 *
 * @param env The Worker environment.
 * @param options Messages plus optional task, routing hints and `tools`.
 * @returns The reply text, any tool calls the model asked for, and what the
 *   router charged for it.
 * @throws {GuardianError} on a non-200 result — 422 no model inside the
 *   budget, 429 circuit breaker, or any other rejection. Callers map this to
 *   an HTTP response and never leak `error.body` to the client.
 * @throws {GuardianConfigError} when `GUARDIAN_PROJECT` is unset.
 * @example
 * const { text, model } = await guardianChat(env, {
 *   task: GUARDIAN_TASKS.dashboardInsights,
 *   messages: [{ role: "user", content: "Summarise these numbers." }],
 * });
 */
export async function guardianChat(
  env: Env,
  options: GuardianRunOptions,
): Promise<GuardianChatResult> {
  const result = await runGuardian(env, buildRunPayload(env, options));

  if ("stream" in result) {
    // ponytail: no caller passes stream here; guard anyway so a future caller
    // gets a clear error instead of a silent type mismatch.
    throw new GuardianError(500, { error: "Unexpected stream result from guardianChat" });
  }

  if (result.status !== 200) {
    throw new GuardianError(result.status, result.body);
  }

  const outer = result.body as any;
  const inner = outer?.body ?? outer;
  const toolCalls = inner?.choices?.[0]?.message?.tool_calls;
  return {
    text: textFrom(inner).trim(),
    toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    provider: outer?.provider ?? null,
    model: outer?.model ?? null,
    costUsd: outer?.cost_usd ?? null,
    requestUuid: outer?.request_uuid ?? null,
  };
}
