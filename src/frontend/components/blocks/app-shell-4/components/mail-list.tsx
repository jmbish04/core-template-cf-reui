/**
 * @fileoverview The 440px message list from ReUI block `app-shell-4`, wired to
 * real `email_messages` rows instead of the block's `MAILS` constant.
 *
 * The block's list owned its own filtering over a hard-coded array. Here it is
 * fully controlled: the parent island holds the query, the tab and the rows
 * that `GET /api/inbox` returned, so filtering happens in D1 and the tab counts
 * are the API's counts. What is kept from the block is the grammar — the header
 * with its unread badge, the live search row, the pill filter tabs, and the
 * rich preview rows (unread pip, avatar, sender, subject, snippet, labels).
 *
 * Dropped from the block: the "Files" tab, the sort menu and Compose. There is
 * no attachment column, no sort parameter and no outbound send in this API, and
 * a control that does nothing is worse than no control.
 */
import { InboxIcon, SearchIcon, StarIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmailMessage } from "@/components/inbox/types";

/** The three list filters, each a real query on `/api/inbox`. */
export type MailFilter = "all" | "unread" | "starred";

const TABS: Array<{ id: MailFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
];

export interface MailListProps {
  title: string;
  messages: EmailMessage[];
  selectedId: string | null;
  loading: boolean;
  /** Unread count in the inbox, from the list envelope. */
  unread: number;
  filter: MailFilter;
  query: string;
  onFilterChange: (filter: MailFilter) => void;
  onQueryChange: (query: string) => void;
  onSelect: (message: EmailMessage) => void;
  /** Rendered in place of the rows when there are none and no query. */
  emptyState: React.ReactNode;
}

/**
 * Render the message list pane.
 *
 * @param props - Controlled list state plus the rows to show.
 * @returns The list column; 440px on desktop, full width on mobile.
 */
export function MailList({
  title,
  messages,
  selectedId,
  loading,
  unread,
  filter,
  query,
  onFilterChange,
  onQueryChange,
  onSelect,
  emptyState,
}: MailListProps) {
  return (
    <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm leading-relaxed font-semibold">{title}</span>
          {unread > 0 ? (
            <Badge className="rounded-full!" variant="outline" size="sm">
              {unread}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Search */}
      <div className="border-border/60 border-b px-3 py-2">
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground/50 pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            placeholder="Search mail…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-7 pl-7 text-xs"
            aria-label="Search mail"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="text-muted-foreground/50 hover:text-foreground absolute top-1/2 right-1 size-5 -translate-y-1/2"
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter tabs — the list itself is one scroller, not one panel per tab,
          because the rows come from a refetch rather than from client filtering. */}
      <Tabs
        value={filter}
        onValueChange={(next) => onFilterChange(next as MailFilter)}
        className="shrink-0 gap-0"
      >
        <div className="border-border/60 flex shrink-0 items-center overflow-x-auto border-b px-1.5 py-1.5 md:px-2">
          <TabsList className="h-auto gap-0.5 bg-transparent p-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "group/tab h-auto flex-none gap-1 px-2 py-0.75 text-xs font-normal md:gap-2 md:px-2.5",
                  "data-active:bg-primary! data-active:text-primary-foreground! data-active:font-medium! data-active:shadow-none!",
                  "dark:data-active:bg-primary! dark:data-active:text-primary-foreground!",
                  "rounded-full",
                )}
              >
                {tab.label}
                {tab.id === "unread" && unread > 0 ? (
                  <Badge
                    variant="secondary"
                    size="xs"
                    className="hidden rounded-full! leading-none md:inline-flex"
                  >
                    {unread}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Rows */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          query ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <InboxIcon className="text-muted-foreground/25 mb-2 size-8" aria-hidden="true" />
              <p className="text-muted-foreground mb-3 text-xs">No messages match “{query}”.</p>
              <Button variant="outline" size="xs" onClick={() => onQueryChange("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="p-3">{emptyState}</div>
          )
        ) : (
          <div role="list">
            {messages.map((message) => (
              <MailItem
                key={message.id}
                message={message}
                selected={selectedId === message.id}
                onClick={() => onSelect(message)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * One preview row.
 *
 * @param message - The row from `email_messages`.
 * @param selected - Whether this row is open in the reading pane.
 * @param onClick - Opens the message.
 * @returns The preview row.
 */
function MailItem({
  message,
  selected,
  onClick,
}: {
  message: EmailMessage;
  selected: boolean;
  onClick: () => void;
}) {
  const sender = message.fromName ?? message.fromAddress;
  return (
    <div
      role="listitem"
      aria-pressed={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative flex cursor-pointer items-start gap-1.5 md:gap-2.5",
        "border-border/40 border-b px-1.5 py-2 md:px-3 md:py-3",
        "focus-visible:ring-ring transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:outline-none",
        selected ? "bg-accent/60 dark:bg-accent/20" : "hover:bg-accent/60 dark:hover:bg-accent/20",
      )}
    >
      {/* Unread indicator */}
      <div className="flex w-2 shrink-0 justify-center pt-3 md:pt-3.5">
        {!message.read ? (
          <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-label="Unread" />
        ) : null}
      </div>

      <Avatar className="mt-0.5 size-6 shrink-0 md:size-8">
        <AvatarFallback className="text-[11px] font-semibold">{senderInitials(sender)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center justify-between gap-1">
          <span
            className={cn(
              "truncate text-sm leading-tight",
              message.read ? "text-foreground/75 font-medium" : "text-foreground font-semibold",
            )}
          >
            {sender}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {message.starred ? (
              <StarIcon className="text-warning size-3 fill-current" aria-label="Starred" />
            ) : null}
            <span
              className={cn(
                "text-[11px] whitespace-nowrap tabular-nums",
                message.read ? "text-muted-foreground/60" : "text-foreground/70 font-medium",
              )}
            >
              {relativeTime(message.receivedAt)}
            </span>
          </div>
        </div>

        <p
          className={cn(
            "mb-1 min-w-0 truncate text-xs leading-tight",
            message.read ? "text-foreground/70" : "text-foreground/90 font-medium",
          )}
        >
          {message.subject}
        </p>

        <p className="text-muted-foreground min-w-0 truncate text-xs leading-snug">{message.snippet}</p>

        {message.labels.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {message.labels.map((label) => (
              <Badge key={label} variant="secondary" size="xs" className="font-normal">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Two initials for an avatar fallback, from a display name or an address.
 *
 * @param sender - `fromName` when present, otherwise `fromAddress`.
 * @returns One or two uppercase letters.
 */
function senderInitials(sender: string): string {
  const parts = sender.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
