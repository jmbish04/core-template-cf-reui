/**
 * @fileoverview FrameGrid — a ReUI `Frame` whose panels are laid out as a grid
 * instead of a column. Shared by the dashboard, analytics, projects and
 * overview grids.
 *
 * WHY THIS EXISTS. `Frame`'s non-stacked variant carries
 * `*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1` — a `& > *` rule
 * that adds a top margin to every panel after the first. That is right in a
 * column and wrong in a grid, where it offsets every card except the first one
 * in DOM order, so the top row visibly fails to line up.
 *
 * The fix is structural rather than a specificity fight: the panels live in an
 * inner grid element, so they are no longer direct children of the `Frame` and
 * the rule never matches. The frame's spacing and panel-radius custom
 * properties are inherited, so the panels still render identically.
 */

import type { ReactNode } from "react";

import { Frame } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

/**
 * Lay a frame's panels out as a grid.
 *
 * @param cols Responsive grid-template utilities, e.g. `"sm:grid-cols-2"`.
 *   Column count only — spacing comes from the frame's own `--frame-gap`.
 * @param className Extra classes for the outer `Frame`.
 * @param children `FramePanel` elements.
 */
export function FrameGrid({
  cols,
  className,
  children,
}: {
  cols: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Frame className={className}>
      <div className={cn("grid gap-(--frame-gap)", cols)}>{children}</div>
    </Frame>
  );
}
