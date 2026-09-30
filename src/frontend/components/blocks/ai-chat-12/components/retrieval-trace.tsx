/**
 * @fileoverview The retrieval, shown while it runs and folded away once it is
 * done.
 *
 * `RetrievalLive` is the run in flight: the stage it is on and each article
 * ticking from queued to reading to read. `RetrievalReceipt` is what it left
 * behind, and it is careful about two different absences:
 *
 * - the READ count only exists for the turn that is still in this session; it
 *   is stream state, not a row, so an older turn shows citations alone rather
 *   than a fabricated count;
 * - an article the answer did not cite is marked skipped, never quietly
 *   dropped, because "read but unused" is the honest shape of retrieval.
 */
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BookOpenIcon, CheckIcon, ChevronDownIcon, MinusIcon } from "lucide-react";

import type { Article } from "./knowledge-base";
import type { RetrievalPhase } from "./use-retrieval";

/** What one article did for the answer. `reading` is the live cursor. */
type ArticleState = "queued" | "reading" | "read" | "used" | "skipped";

const STATE_LABEL: Record<ArticleState, string> = {
  queued: "Queued",
  reading: "Reading",
  read: "Read",
  used: "Used",
  skipped: "Read but not used",
};

function ArticleRow({ article, state }: { article: Article; state: ArticleState }) {
  const quiet = state === "queued" || state === "skipped";

  return (
    <Item
      size="xs"
      render={<a href={article.href} />}
      aria-label={`${STATE_LABEL[state]}. ${article.title}, ${article.section}`}
      data-quiet={quiet || undefined}
      className="gap-2 px-1.5 py-1 data-quiet:opacity-55"
    >
      <span className="text-muted-foreground flex w-4 shrink-0 justify-center">
        {state === "reading" && <Spinner className="size-3.5" />}
        {(state === "read" || state === "used") && (
          <CheckIcon className="text-success size-3.5" aria-hidden="true" />
        )}
        {state === "skipped" && <MinusIcon className="size-3.5" aria-hidden="true" />}
        {state === "queued" && (
          <span aria-hidden="true" className="bg-muted-foreground/40 size-1.5 rounded-full" />
        )}
      </span>
      <ItemContent className="min-w-0 gap-0">
        <ItemTitle className="min-w-0 truncate text-xs font-normal">{article.title}</ItemTitle>
      </ItemContent>
      <span className="text-muted-foreground shrink-0 text-xs">{article.section}</span>
    </Item>
  );
}

/**
 * The retrieval in flight.
 *
 * @param props The phase, the matched articles and how many have been read.
 * @returns The live trace, or null when nothing is running.
 */
export function RetrievalLive({
  phase,
  matched,
  readCount,
}: {
  phase: RetrievalPhase;
  matched: Article[];
  readCount: number;
}) {
  if (phase === "idle") return null;
  const searching = phase === "searching";

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="text-muted-foreground flex items-center gap-2 px-1.5 text-sm">
        <Spinner className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {searching && "Searching the docs"}
          {phase === "reading" && `Reading ${matched.length} articles`}
          {phase === "writing" && "Writing the answer"}
        </span>
        {!searching && (
          <span className="ms-auto shrink-0 text-xs tabular-nums">
            {Math.min(readCount, matched.length)}/{matched.length}
          </span>
        )}
      </div>

      {!searching && (
        <div className="flex flex-col">
          {matched.map((article, index) => (
            <ArticleRow
              key={article.id}
              article={article}
              state={index < readCount ? "read" : index === readCount ? "reading" : "queued"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface RetrievalReceiptProps {
  /** Everything read for this turn, when the turn ran in this session. */
  read: Article[];
  /** The articles the answer cited. Derived from the reply, so it persists. */
  used: Article[];
  className?: string;
}

/**
 * What the retrieval left behind, folded away.
 *
 * @param props The read and cited articles for one answer.
 * @returns The receipt, or null when there is nothing to show.
 */
export function RetrievalReceipt({ read, used, className }: RetrievalReceiptProps) {
  // A reloaded turn has no read list, only citations. Show what is known.
  const listed = read.length > 0 ? read : used;
  if (listed.length === 0) return null;

  const usedIds = new Set(used.map((article) => article.id));

  return (
    <Collapsible className={cn("w-full min-w-0", className)}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={
              read.length > 0
                ? `Read ${read.length} articles, used ${used.length}`
                : `Cited ${used.length} articles`
            }
            className="group/receipt text-muted-foreground hover:text-foreground h-7 w-fit max-w-full justify-start gap-2 px-1.5 font-normal"
          />
        }
      >
        <BookOpenIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate text-xs">
          {read.length > 0 ? `Read ${read.length} articles` : `Cited ${used.length} articles`}
        </span>
        {read.length > 0 && (
          <>
            <span aria-hidden="true" className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
            <span className="shrink-0 text-xs tabular-nums">Used {used.length}</span>
          </>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-60 transition-transform group-data-[panel-open]/receipt:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col pt-1">
          {listed.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              state={usedIds.has(article.id) ? "used" : "skipped"}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
