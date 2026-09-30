/**
 * @fileoverview Streaming: ask the router for a live reply and read it.
 *
 * Three things come down this pipe, and conflating them is the usual bug:
 * the answer (`delta.content`), the model's THINKING (`delta.reasoning`, on a
 * reasoning model), and a trailing `usage` object. The reasoning channel is
 * NOT part of the answer and must never be concatenated into it.
 *
 * Which provider and model served the stream is reported in response HEADERS,
 * before the first token — a stream body has no room for it earlier. That is
 * what lets a chat surface name the real model while the answer is still
 * arriving; see `guardianStreamMeta`.
 *
 * Reading the body lives in `./stream-read`, which deliberately has no value
 * imports so the plain-Node self-check can load the parser. Both are
 * re-exported here, so nothing downstream has to know about the split.
 */

import { buildRunPayload } from "./config";
import { GuardianError } from "./errors";
import { runGuardian } from "./rpc";
import type { GuardianRunOptions } from "./types";

/**
 * Run a completion and get the raw SSE `Response` back instead of a string.
 *
 * Callers re-emit their own event shape rather than proxying this straight to
 * the browser, so the server still sees every token and can persist the turn.
 *
 * @param env The Worker environment.
 * @param options Messages plus optional task and routing hints.
 * @returns The router's SSE response.
 * @throws {GuardianError} when the router answers with a status instead of a
 *   stream (422 no model in budget, 429 breaker, anything else).
 * @throws {GuardianConfigError} when `GUARDIAN_PROJECT` is unset.
 */
export async function guardianStream(env: Env, options: GuardianRunOptions): Promise<Response> {
  const result = await runGuardian(env, buildRunPayload(env, options, true));
  if ("stream" in result) return result.stream;
  throw new GuardianError(result.status, result.body);
}

export { guardianStreamMeta, readGuardianStream } from "./stream-read";
