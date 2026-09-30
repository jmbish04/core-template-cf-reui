/**
 * @fileoverview The per-source receipt for the turn that was sent.
 *
 * Kept from ReUI `ai-chat-5`'s run panel, but every row is a fact about the
 * prompt that actually went out: which collections were fetched, how many rows
 * each contributed, which were left out of scope, and which failed to read.
 * A source that failed is reported as failed rather than quietly counted.
 */
import { CheckIcon, CircleSlashIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";

import { Frame, FramePanel } from "@/components/reui/frame";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";

import { sourceById, type SourceReceipt } from "@/components/chat/workspace-sources";

function RowIcon({ state }: { state: SourceReceipt["state"] }) {
  if (state === "read") return <CheckIcon className="text-success size-4" aria-hidden="true" />;
  if (state === "failed") return <TriangleAlertIcon className="text-destructive size-4" aria-hidden="true" />;
  if (state === "empty") return <CircleSlashIcon className="text-muted-foreground size-4" aria-hidden="true" />;
  return <MinusIcon className="text-muted-foreground size-4" aria-hidden="true" />;
}

export interface SourceReceiptPanelProps {
  /** The prompt as the reader typed it, before the mode rewrote it. */
  prompt: string;
  rows: SourceReceipt[];
}

/**
 * Render what the last turn read.
 *
 * @param props The prompt and its per-source rows.
 * @returns A frame listing every workspace source and its contribution.
 */
export function SourceReceiptPanel({ prompt, rows }: SourceReceiptPanelProps) {
  const read = rows.filter((row) => row.state === "read").length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-pretty">{prompt}</p>
      <Frame spacing="sm">
        <FramePanel fit className="flex flex-col py-1.5">
          <p className="text-muted-foreground px-2 pt-0.5 pb-1 text-xs">
            {read === 0
              ? "Answered without workspace data"
              : `Answered from ${read} of ${rows.length} workspace sources`}
          </p>

          {rows.map((row) => {
            const source = sourceById(row.id);
            const Icon = source?.icon;
            return (
              <Item key={row.id} size="xs" className="gap-2.5 px-2 py-1">
                <ItemMedia variant="icon" className="bg-transparent">
                  <RowIcon state={row.state} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle
                    data-muted={row.state !== "read"}
                    className="data-[muted=true]:text-muted-foreground truncate font-normal"
                  >
                    {row.label} — {row.detail}
                  </ItemTitle>
                </ItemContent>
                {Icon && (
                  <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </Item>
            );
          })}
        </FramePanel>
      </Frame>
    </div>
  );
}
