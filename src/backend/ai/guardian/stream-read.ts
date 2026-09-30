/**
 * @fileoverview Reading a core-guardian SSE body. No value imports, on purpose.
 *
 * Three things come down this pipe, and conflating them is the usual bug:
 * the answer (`delta.content`), the model's THINKING (`delta.reasoning`, on a
 * reasoning model), and a trailing `usage` object. The reasoning channel is
 * NOT part of the answer and must never be concatenated into it.
 *
 * This file is split out of `stream.ts` so that `scripts/selfcheck.mjs` can
 * import the parser directly: Node's strip-only TypeScript support erases
 * `import type` but cannot resolve an extensionless VALUE import, so a module
 * a plain `.mjs` check needs must not have any.
 */

import type { GuardianRouted, GuardianStreamEvent } from "./types";

/**
 * Which provider and model core-guardian actually routed this stream to.
 *
 * @param stream The response from `guardianStream`.
 * @returns The routing decision; each field is null when the header is absent,
 *   never an empty string a UI would render as a model name.
 */
export function guardianStreamMeta(stream: Response): GuardianRouted {
  return {
    provider: stream.headers.get("x-guardian-provider"),
    model: stream.headers.get("x-guardian-model"),
    requestUuid: stream.headers.get("x-request-uuid"),
  };
}

/**
 * Read an OpenAI-shaped SSE body and yield what it carries.
 *
 * Tolerates a bare `{ text }` / `{ response }` payload too, because the router
 * normalises several upstream providers and not all use chat-completions.
 *
 * @param stream The response from `guardianStream`.
 * @yields One event per meaningful frame; junk and keepalives are skipped.
 */
export async function* readGuardianStream(stream: Response): AsyncGenerator<GuardianStreamEvent> {
  const body = stream.body;
  if (!body) return;

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE frames are separated by a blank line; keep the trailing partial.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let json: any;
        try {
          json = JSON.parse(payload);
        } catch {
          // A non-JSON keepalive frame is normal; skip it.
          continue;
        }

        const choice = json?.choices?.[0];
        const reasoning = choice?.delta?.reasoning;
        if (typeof reasoning === "string" && reasoning.length > 0) {
          yield { type: "reasoning", text: reasoning };
        }

        const delta =
          choice?.delta?.content ?? choice?.message?.content ?? json?.response ?? json?.text ?? "";
        if (typeof delta === "string" && delta.length > 0) {
          yield { type: "delta", text: delta };
        }

        const usage = json?.usage;
        if (usage && typeof usage.total_tokens === "number") {
          yield {
            type: "usage",
            usage: {
              promptTokens: usage.prompt_tokens ?? 0,
              completionTokens: usage.completion_tokens ?? 0,
              totalTokens: usage.total_tokens,
            },
          };
        }
      }
    }
  }
}
