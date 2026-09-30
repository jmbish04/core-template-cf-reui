/**
 * @fileoverview Turn the model's plan reply into step titles.
 *
 * Split out of `run-engine.ts` with no imports at all, so the parser can be
 * exercised by `scripts/selfcheck-chat-shapes.mjs` without dragging React and
 * the `@/…` path aliases into a plain Node process.
 */

/** Plans longer than this stop being a plan and start being a to-do list. */
export const MAX_STEPS = 8;

/**
 * Parse a plan reply into an ordered list of step titles.
 *
 * Numbered lines first, because that is what the prompt asked for; bulleted
 * lines are accepted as a fallback rather than failing the run over a
 * formatting choice. Returns `[]` when neither is present, which the caller
 * reports as "the model did not return a plan" instead of running nothing.
 *
 * @param text The plan turn's reply.
 * @returns Step titles, capped at `MAX_STEPS`.
 */
export function parsePlan(text: string): string[] {
  const lines = text.split("\n").map((line) => line.trim());
  const numbered = lines
    .map((line) => /^\d+[.)]\s+(.+)$/.exec(line)?.[1])
    .filter((title): title is string => Boolean(title));
  if (numbered.length > 0) return numbered.slice(0, MAX_STEPS);
  return lines
    .map((line) => /^[-*•]\s+(.+)$/.exec(line)?.[1])
    .filter((title): title is string => Boolean(title))
    .slice(0, MAX_STEPS);
}
