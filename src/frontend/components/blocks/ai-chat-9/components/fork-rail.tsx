/**
 * @fileoverview The fork rail — which version of a forked conversation is open.
 *
 * A version is a sibling THREAD (see `branching.ts`), so this rail is a list of
 * rows in `chat_threads`, not of objects in component state. Switching version
 * opens that thread; the counter reads "2 of 3" the way the block's rail does,
 * and it reads the same after a reload because the versions are stored.
 *
 * The rail hides itself when a conversation has never been forked — one
 * version is not a choice.
 */
import type { ChatThread } from "@/lib/chat";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon, GitBranchIcon } from "lucide-react";

export interface ForkRailProps {
  /** Every thread in the fork group, oldest first. */
  versions: ChatThread[];
  activeId: string | undefined;
  onOpen: (threadId: string) => void;
  className?: string;
}

/**
 * Step between the sibling threads that make up one forked conversation.
 *
 * @param props The fork group, the open thread and the open handler.
 * @returns The rail, or null when there is nothing to step between.
 */
export function ForkRail({ versions, activeId, onOpen, className }: ForkRailProps) {
  if (versions.length < 2) return null;

  const index = versions.findIndex((thread) => thread.id === activeId);
  const at = index < 0 ? 0 : index;
  const previous = versions[at - 1];
  const next = versions[at + 1];

  return (
    <div
      className={cn(
        "border-border/60 bg-card/60 flex min-w-0 items-center gap-1 rounded-full border px-1 py-0.5",
        className,
      )}
    >
      <GitBranchIcon className="text-muted-foreground ms-1.5 size-3.5 shrink-0" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous version"
        disabled={!previous}
        onClick={() => previous && onOpen(previous.id)}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>

      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {at + 1} of {versions.length}
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next version"
        disabled={!next}
        onClick={() => next && onOpen(next.id)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>

      <span className="text-muted-foreground min-w-0 truncate px-1.5 text-xs">
        {versions[at]?.title}
      </span>
    </div>
  );
}
