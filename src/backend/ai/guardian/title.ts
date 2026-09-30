/**
 * @fileoverview `guardianTitle` — the short thread title the model writes.
 *
 * Kept apart from the chat client because it owns a prompt, and a prompt is a
 * thing people edit. The wording lives here, not scattered through the route.
 */

import { guardianChat } from "./chat";
import { GUARDIAN_TASKS } from "./config";
import { GuardianConfigError } from "./errors";

/** The instruction that shapes a title. Edit here, not at the call site. */
const TITLE_SYSTEM_PROMPT =
  "You write a short chat title (3-7 words) summarising the user's message. " +
  "Return ONLY the title — no quotes, no trailing punctuation, no preamble.";

/** How much of the first message the titler is shown. */
const TITLE_INPUT_CHARS = 800;

/** Longest title accepted back; anything beyond is truncated, not rejected. */
const TITLE_MAX_CHARS = 80;

/**
 * Ask core-guardian for a short chat title.
 *
 * Deliberately best-effort: a degraded router must never fail the chat turn
 * that triggered the titling, so this returns `null` instead of throwing and
 * the caller leaves the existing title alone.
 *
 * @param env The Worker environment.
 * @param firstUserMessage The message to title.
 * @returns The title, or null when the router was unavailable or answered blank.
 * @example
 * const title = await guardianTitle(env, "How do I add a D1 index?");
 * // "Adding an index to D1"
 */
export async function guardianTitle(env: Env, firstUserMessage: string): Promise<string | null> {
  try {
    const { text } = await guardianChat(env, {
      task: GUARDIAN_TASKS.threadTitle,
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        { role: "user", content: firstUserMessage.slice(0, TITLE_INPUT_CHARS) },
      ],
    });
    const title = text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, TITLE_MAX_CHARS);
    return title || null;
  } catch (error) {
    // As in `followups.ts`: a permanent misconfiguration is not the kind of
    // failure "best effort" is meant to absorb.
    if (error instanceof GuardianConfigError) throw error;
    console.error("guardianTitle error:", error);
    return null;
  }
}
