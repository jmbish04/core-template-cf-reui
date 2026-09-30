/**
 * @fileoverview The live source strip that sits in the composer's frame
 * footer.
 *
 * One toggle per real workspace collection. A switched-on source shows how
 * much it is contributing as soon as its fetch lands, so the scope line is a
 * measurement rather than a promise, and a source that failed to read says so
 * here instead of silently dropping out of the prompt.
 */
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { LoadedSource, SourceId } from "@/components/chat/workspace-sources";
import { SOURCES } from "@/components/chat/workspace-sources";

/** Sizes the scope without repeating the six names the toggles already carry. */
function scopeLine(loaded: LoadedSource[]): string {
  const readable = loaded.filter((entry) => entry.summary && entry.summary.lines.length > 0);
  if (loaded.length === 0) return "No sources in scope — the assistant answers from the question alone";
  if (readable.length === 0) return `Reading ${loaded.length} of ${SOURCES.length} sources`;
  const rows = readable.reduce((total, entry) => total + (entry.summary?.lines.length ?? 0), 0);
  return `Reading ${loaded.length} of ${SOURCES.length} sources · ${rows} rows in context`;
}

export interface SourceStripProps {
  loaded: LoadedSource[];
  onToggle: (id: SourceId, on: boolean) => void;
  className?: string;
}

/**
 * The frame-footer strip: what the next turn may read.
 *
 * @param props The scope's loaded sources and its toggle.
 * @returns The scope line plus one toggle per source.
 */
export function SourceStrip({ loaded, onToggle, className }: SourceStripProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{scopeLine(loaded)}</p>

      <ul aria-label="Workspace sources in scope" className="flex flex-wrap items-center gap-1">
        {SOURCES.map((source) => {
          const entry = loaded.find((item) => item.id === source.id);
          const on = Boolean(entry);
          const failed = Boolean(entry?.error);
          const Icon = source.icon;
          const detail = failed
            ? entry!.error!
            : entry?.loading
              ? "Reading…"
              : entry?.summary
                ? `${entry.summary.lines.length} rows in context`
                : source.scope;

          return (
            <li key={source.id}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "ghost"}
                      aria-pressed={on}
                      aria-label={`${on ? "Remove" : "Add"} ${source.label} ${on ? "from" : "to"} the scope`}
                      onClick={() => onToggle(source.id, !on)}
                      className={cn(
                        "h-7 gap-1.5 px-2 font-normal [&_svg]:size-3.5",
                        failed && "text-destructive",
                        !on && "text-muted-foreground",
                      )}
                    />
                  }
                >
                  {entry?.loading ? <Spinner className="size-3.5" /> : <Icon aria-hidden="true" />}
                  {source.label}
                </TooltipTrigger>
                <TooltipContent>{detail}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
