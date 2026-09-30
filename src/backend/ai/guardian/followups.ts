/**
 * @fileoverview `guardianFollowups` — the three prompts a user might tap next.
 *
 * Here for the same reason as `title.ts`: it owns a prompt and a parser, and
 * both are things people tune. Keeping them beside the client means the route
 * stays a route.
 */

import { guardianChat } from "./chat";
import { GUARDIAN_TASKS } from "./config";
import { GuardianConfigError } from "./errors";
import type { GuardianMessage } from "./types";

/** The instruction that shapes the suggestions. Edit here, not at the call site. */
const FOLLOWUPS_SYSTEM_PROMPT =
  "You generate short follow-up prompts the USER might tap next in a chat. " +
  "Return EXACTLY 3 suggestions, each on its own line, no numbering, no quotes, " +
  "no preamble. Each must be under 8 words and phrased as the user speaking.";

/** How many recent turns the model is shown. Six is plenty of context. */
const FOLLOWUPS_CONTEXT_TURNS = 6;

/** Longest suggestion accepted; anything longer is dropped, not truncated. */
const FOLLOWUPS_MAX_CHARS = 80;

/** How many suggestions a caller gets back at most. */
const FOLLOWUPS_COUNT = 3;

/**
 * Suggest up to three follow-up prompts from a conversation.
 *
 * Best-effort by design: follow-ups are a convenience, so a degraded router
 * yields an empty list rather than failing the request that asked for them.
 *
 * @param env The Worker environment.
 * @param messages Recent turns, most-recent last.
 * @returns Up to three suggestions; empty when the model was unavailable or
 *   answered with nothing usable.
 * @example
 * const next = await guardianFollowups(env, recentTurns); // ["Show me the failing tests", …]
 */
export async function guardianFollowups(
  env: Env,
  messages: GuardianMessage[],
): Promise<string[]> {
  const transcript = messages
    .slice(-FOLLOWUPS_CONTEXT_TURNS)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const { text } = await guardianChat(env, {
      task: GUARDIAN_TASKS.threadFollowups,
      messages: [
        { role: "system", content: FOLLOWUPS_SYSTEM_PROMPT },
        { role: "user", content: `Conversation so far:\n${transcript}\n\nThree follow-up prompts:` },
      ],
    });

    return text
      .split("\n")
      // Models number their lists however they feel like; strip the decoration
      // rather than rejecting a suggestion for wearing a bullet.
      .map((line) => line.replace(/^[\s\-*\d.)"]+/, "").replace(/["]+$/, "").trim())
      .filter((line) => line.length > 0 && line.length <= FOLLOWUPS_MAX_CHARS)
      .slice(0, FOLLOWUPS_COUNT);
  } catch (error) {
    // "Best effort" means tolerant of the ROUTER, not of our own config. A
    // GuardianConfigError is permanent, and swallowing it here would render a
    // misconfigured Worker as "no suggestions today" forever.
    if (error instanceof GuardianConfigError) throw error;
    console.error("guardianFollowups error:", error);
    return [];
  }
}
