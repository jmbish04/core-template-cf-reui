/**
 * @fileoverview Page chrome shared by every route inside the shell.
 *
 * `PageBody` is the scroll container and max-width; `PageToolbar` is the
 * title/description/actions row at the top of a page. Both are plain markup
 * with no client state, so pages render them without a hydration directive
 * and only their islands ship JavaScript.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-1 flex-col gap-5 pb-8", className)}>{children}</div>;
}

export function PageToolbar({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
