/**
 * @fileoverview Lock two transcripts to one scroll position.
 *
 * Reading two answers side by side means reading them at the same depth, not
 * chasing each one separately. The two panes have different content heights,
 * so the lock mirrors the scroll RATIO rather than the pixel offset.
 *
 * `Transcript` owns its own scroller, so the viewport is found by the
 * `data-slot` attribute the scroller primitive sets. It only exists once a
 * pane has turns to show, which is why `signal` re-runs the binding.
 */
import { useEffect, type RefObject } from "react";

const VIEWPORT = "[data-slot=message-scroller-viewport]";

/**
 * Mirror scrolling between two transcript wrappers.
 *
 * @param enabled Whether the lock is engaged.
 * @param left Wrapper around the first `Transcript`.
 * @param right Wrapper around the second.
 * @param signal Re-bind when this changes (e.g. the turn count), because the
 *   viewport element does not exist while a pane is empty.
 */
export function useScrollLock(
  enabled: boolean,
  left: RefObject<HTMLDivElement | null>,
  right: RefObject<HTMLDivElement | null>,
  signal: number,
): void {
  useEffect(() => {
    if (!enabled) return;
    const a = left.current?.querySelector<HTMLElement>(VIEWPORT);
    const b = right.current?.querySelector<HTMLElement>(VIEWPORT);
    if (!a || !b) return;

    // One flag for both directions: mirroring scrolls the other element, which
    // fires its own scroll event and would echo straight back.
    let mirroring = false;

    const mirror = (from: HTMLElement, to: HTMLElement) => () => {
      if (mirroring) return;
      mirroring = true;
      const fromMax = from.scrollHeight - from.clientHeight;
      const toMax = to.scrollHeight - to.clientHeight;
      to.scrollTop = fromMax > 0 ? (from.scrollTop / fromMax) * toMax : 0;
      window.requestAnimationFrame(() => {
        mirroring = false;
      });
    };

    const fromA = mirror(a, b);
    const fromB = mirror(b, a);
    a.addEventListener("scroll", fromA, { passive: true });
    b.addEventListener("scroll", fromB, { passive: true });
    return () => {
      a.removeEventListener("scroll", fromA);
      b.removeEventListener("scroll", fromB);
    };
  }, [enabled, left, right, signal]);
}
