/**
 * @fileoverview Window events islands use to talk to each other.
 *
 * Two islands on the same page are separate React roots, so they cannot share
 * a context or a store. A plain `CustomEvent` on `window` is the smallest
 * thing that works, and it keeps the dependency one-way: the emitter never has
 * to know who is listening.
 */

/** Something wrote a notification; feeds should refetch now, not on their next poll. */
export const NOTIFICATIONS_CHANGED = "notifications:changed";

/** Fire an island-to-island event. */
export function emit(name: string, detail?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
