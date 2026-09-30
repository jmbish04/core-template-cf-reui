/**
 * @fileoverview ⌘K command palette for the sidebar.
 *
 * Adapted from ReUI block `app-shell-2`: the demo's decorative search dialog
 * now searches the real route table (`allNavEntries()`), so typing a page name
 * and pressing Enter navigates there. Matching is a case-insensitive substring
 * over the label and the section it sits in.
 */
import { SearchIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { allNavEntries } from "@/lib/config";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";

export function SearchForm() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const searchInputId = useId();
  const entries = useMemo(() => allNavEntries(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 8);
    return entries
      .filter((e) => `${e.label} ${e.section ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [entries, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset the highlight whenever the result set changes, so Enter never fires
  // a stale row after the list has shrunk under the cursor.
  useEffect(() => setCursor(0), [query]);

  function go(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = results[cursor];
      if (hit) go(hit.href);
    }
  }

  return (
    <>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Button
            id="search"
            type="button"
            variant="outline"
            className="hover:bg-background h-8 w-full justify-start pl-7 font-normal transition-[width] duration-200 ease-linear in-data-[state=collapsed]:w-8! in-data-[state=collapsed]:pl-4! in-data-[state=collapsed]:text-transparent"
            onClick={() => setOpen(true)}
          >
            Search...
          </Button>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 opacity-50 select-none"
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 in-data-[state=collapsed]:hidden">⌘K</Kbd>
        </SidebarGroupContent>
      </SidebarGroup>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Jump to a page in this workspace.</DialogDescription>
        </DialogHeader>
        <DialogContent className="max-w-md p-0 **:data-[slot=dialog-close]:top-3 **:data-[slot=dialog-close]:right-3 **:data-[slot=dialog-close]:opacity-60">
          <div className="flex items-center gap-3 border-b px-4 py-2">
            <SearchIcon aria-hidden="true" className="pointer-events-none size-4 opacity-60 select-none" />
            <Input
              id={searchInputId}
              className="h-10 border-none p-0 shadow-none outline-none focus-visible:ring-0"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Jump to a page..."
              aria-label="Search pages"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Pages">
            {results.length === 0 ? (
              <li className="text-muted-foreground px-2 py-6 text-center text-sm">No page matches “{query}”.</li>
            ) : (
              results.map((entry, index) => (
                <li key={entry.href}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(entry.href)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm",
                      index === cursor ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                  >
                    <span>{entry.label}</span>
                    {entry.section && (
                      <span className="text-muted-foreground text-xs">{entry.section}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
