/**
 * @fileoverview The stage's chrome bar: which conversation is open, and the
 * one switch that hides the run details.
 *
 * The thread rail lives in a popover rather than a column, because the stage is
 * a single centred column over the dot field and a permanent rail would break
 * that. It is the same `ThreadList` every other surface uses, over the same
 * `/api/threads` rows.
 */
import { ThreadList, type UseThreads } from "@/components/chat";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { MessagesSquareIcon, SquarePenIcon } from "lucide-react";

export interface StageHeaderProps {
  threads: UseThreads;
  activeId: string | undefined;
  onOpen: (id: string) => void;
  onNew: () => void;
  showRunDetails: boolean;
  onRunDetailsChange: (show: boolean) => void;
}

/**
 * Render the stage's header.
 *
 * @param props The thread index, the open thread, and the run-details switch.
 * @returns A single row above the transcript.
 */
export function StageHeader({
  threads,
  activeId,
  onOpen,
  onNew,
  showRunDetails,
  onRunDetailsChange,
}: StageHeaderProps) {
  const title = threads.threads.find((thread) => thread.id === activeId)?.title ?? "New conversation";

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 sm:px-6">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" className="min-w-0 gap-2 font-normal [&_svg]:size-3.5" />
          }
        >
          <MessagesSquareIcon aria-hidden="true" />
          <span className="min-w-0 max-w-56 truncate">{title}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <ThreadList
            threads={threads.threads}
            activeId={activeId}
            loading={threads.loading}
            onSelect={onOpen}
            onRename={threads.rename}
            onDelete={threads.remove}
            heading="Conversations"
            className="max-h-80"
          />
        </PopoverContent>
      </Popover>

      {/* A span, not a label: Base UI's Switch is a button, so a wrapping label
          would associate with nothing. The switch carries its own aria-label. */}
      <span className="text-muted-foreground ms-auto flex shrink-0 items-center gap-2 text-xs">
        <Switch
          size="sm"
          checked={showRunDetails}
          onCheckedChange={onRunDetailsChange}
          aria-label="Show the run details on every reply"
        />
        <span className="max-sm:sr-only">Run details</span>
      </span>

      <Button variant="ghost" size="icon-sm" aria-label="New conversation" onClick={onNew}>
        <SquarePenIcon aria-hidden="true" />
      </Button>
    </header>
  );
}
