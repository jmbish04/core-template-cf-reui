/**
 * @fileoverview The documentation the assistant is docked to.
 *
 * The block ships a skeleton here — a page-shaped placeholder with no words in
 * it. That is exactly the piece that must not be fake on this surface: the
 * whole promise is that the panel answers from the page beside it. So this
 * renders the SAME articles the assistant retrieves from (`knowledge-base.ts`),
 * which is the live schema documentation plus the drive's text files.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelRightOpenIcon } from "lucide-react";

import type { Article } from "./knowledge-base";

export interface DocsPageProps {
  articles: Article[];
  loading: boolean;
  /** True while the assistant panel is visible; the header button mirrors it. */
  panelOpen: boolean;
  onTogglePanel: () => void;
  className?: string;
}

/**
 * Render the documentation column.
 *
 * @param props The knowledge base and the panel toggle.
 * @returns The scrolling docs page with its sticky header.
 */
export function DocsPage({ articles, loading, panelOpen, onTogglePanel, className }: DocsPageProps) {
  return (
    <div className={cn("scrollbar min-h-0 flex-1 overflow-y-auto", className)}>
      <header className="bg-background/70 supports-backdrop-filter:bg-background/60 after:from-background sticky top-0 z-10 flex h-14 items-center gap-2 px-4 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:to-transparent sm:px-6">
        <span className="min-w-0 truncate text-sm font-medium">Workspace</span>
        <span aria-hidden="true" className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
        <span className="text-muted-foreground min-w-0 truncate text-sm">Documentation</span>

        <Button
          variant={panelOpen ? "secondary" : "default"}
          size="sm"
          aria-pressed={panelOpen}
          onClick={onTogglePanel}
          className="ms-auto shrink-0 gap-1.5"
        >
          <PanelRightOpenIcon aria-hidden="true" />
          Ask the docs
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex flex-col gap-6" aria-hidden="true">
            <Skeleton className="h-7 w-72 max-w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-10/12" />
            <Skeleton className="h-28" />
          </div>
        ) : articles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No documentation is available. The schema endpoint returned nothing and the
            drive holds no text files, so the assistant has nothing to answer from.
          </p>
        ) : (
          articles.map((article) => (
            <article key={article.id} id={article.title} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold tracking-tight">{article.title}</h2>
                <span className="text-muted-foreground text-xs">{article.section}</span>
              </div>
              {article.body ? (
                <p className="text-muted-foreground text-sm leading-6 whitespace-pre-wrap">
                  {article.body}
                </p>
              ) : (
                // A drive article's body is fetched only when it is read, so
                // saying so beats rendering an empty section.
                <p className="text-muted-foreground text-sm">
                  On the drive.{" "}
                  <a href={article.href} className="underline underline-offset-4">
                    Open the file
                  </a>
                  .
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
