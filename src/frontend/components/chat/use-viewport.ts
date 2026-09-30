/**
 * @fileoverview `useBelow` — render a panel in ONE place, not two.
 *
 * A chat surface that is a docked panel on a wide screen and a Sheet on a
 * narrow one cannot express that with `lg:hidden` alone: both copies would
 * mount, so two transcripts would scroll, two composers would hold focus, and
 * (where the panel owns the hook) two streams would run. This reports the
 * breakpoint so the surface picks one.
 *
 * It returns `false` until the effect runs, which is also correct during
 * Astro's SSR pass: the wide layout is the one that renders without JS.
 */
import { useEffect, useState } from "react";

/**
 * True while the viewport is narrower than `width`.
 *
 * @param width Breakpoint in CSS pixels (e.g. 1024 for Tailwind's `lg`).
 * @returns Whether the viewport is currently below it.
 */
export function useBelow(width: number): boolean {
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${width - 1}px)`);
    const sync = () => setBelow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [width]);

  return below;
}
