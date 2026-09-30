/**
 * @fileoverview The selected-message action header from ReUI block
 * `app-shell-4`, keeping the block's toolbar grammar but only the actions the
 * API can actually perform.
 *
 * `PATCH /api/inbox/{id}` accepts `read`, `starred` and `folder` — that is the
 * whole mutable surface, so star, mark-unread and move-to-folder are here and
 * the block's Reply / Snooze / Print / Block entries are not. There is no
 * delete route, so "move to Spam" is as far as removal goes.
 */
import {
  ArchiveIcon,
  ChevronLeftIcon,
  InboxIcon,
  MailIcon,
  MoreHorizontalIcon,
  ShieldAlertIcon,
  StarIcon,
} from "lucide-react";

import type { MailFolder } from "@/components/blocks/app-shell-4/components/folder-rail";
import type { EmailMessage } from "@/components/inbox/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface MessageHeaderProps {
  message: EmailMessage;
  /** True while a PATCH is in flight; disables the toolbar. */
  busy?: boolean;
  onToggleStar: () => void;
  onMarkUnread: () => void;
  onMove: (folder: MailFolder) => void;
  /** Below `md` the reading pane replaces the list, so it needs a way back. */
  onBack: () => void;
}

/**
 * Render the reading-pane toolbar for one message.
 *
 * @param props - The open message plus its mutation handlers.
 * @returns The header row.
 */
export function MessageHeader({
  message,
  busy,
  onToggleStar,
  onMarkUnread,
  onMove,
  onBack,
}: MessageHeaderProps) {
  const moves = ([
    { folder: "inbox", label: "Move to Inbox", icon: InboxIcon },
    { folder: "archive", label: "Archive", icon: ArchiveIcon },
    { folder: "spam", label: "Mark as spam", icon: ShieldAlertIcon },
  ] as const).filter((entry) => entry.folder !== message.folder);

  return (
    <header
      className={cn(
        "border-border flex h-12 min-w-0 shrink-0 items-center gap-1 border-b px-2 py-1.5",
        "sm:gap-1.5 sm:px-4",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Back to the message list"
        className="shrink-0 md:hidden"
        onClick={onBack}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>

      <h2 className="text-foreground w-0 flex-1 truncate text-sm leading-snug font-semibold">
        {message.subject}
      </h2>

      <div
        role="toolbar"
        aria-label="Message actions"
        className="ml-auto flex shrink-0 items-center gap-0.5"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={message.starred ? "Remove star" : "Star message"}
          aria-pressed={message.starred}
          onClick={onToggleStar}
        >
          <StarIcon
            aria-hidden="true"
            className={cn("shrink-0", message.starred ? "text-warning fill-current" : "text-muted-foreground")}
          />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy || !message.read}
          aria-label="Mark as unread"
          className="text-muted-foreground shrink-0"
          onClick={onMarkUnread}
        >
          <MailIcon aria-hidden="true" />
        </Button>

        <div className="mx-0.5 hidden items-center sm:flex">
          <Separator orientation="vertical" className="h-5" />
        </div>

        {/* The most likely move is promoted; the rest live in the menu. */}
        {message.folder !== "archive" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            className="hidden gap-1.5 sm:flex"
            onClick={() => onMove("archive")}
          >
            <ArchiveIcon aria-hidden="true" />
            Archive
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label="More message actions"
                className="text-muted-foreground shrink-0"
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              {moves.map((entry) => {
                const Icon = entry.icon;
                return (
                  <DropdownMenuItem
                    key={entry.folder}
                    variant={entry.folder === "spam" ? "destructive" : undefined}
                    onClick={() => onMove(entry.folder)}
                  >
                    <Icon aria-hidden="true" />
                    {entry.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!message.read} onClick={onMarkUnread}>
                <MailIcon aria-hidden="true" />
                Mark as unread
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
