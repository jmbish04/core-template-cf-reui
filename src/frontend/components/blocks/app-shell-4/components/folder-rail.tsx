/**
 * @fileoverview The folder icon rail from ReUI block `app-shell-4`, lifted out
 * of the block's own `SidebarProvider`.
 *
 * The block shipped this rail as an inner `<Sidebar collapsible="none">` inside
 * a whole app shell. This page already renders inside the global app-shell-2
 * shell, so a second `SidebarProvider` would nest two sidebars and fight over
 * the `--sidebar-*` variables. The rail is therefore a plain vertical toolbar
 * with the same visual grammar — same width, same icon buttons, same tooltips,
 * same unread pip — and no sidebar context at all.
 *
 * Only folders the API actually has are listed: `inbox`, `archive` and `spam`
 * are the enum in `email_messages.folder`. The block's Sent / Drafts / Trash
 * entries were demo affordances with nothing behind them, so they are gone
 * rather than rendered dead.
 */
import { ArchiveIcon, InboxIcon, ShieldAlertIcon, type LucideIcon } from "lucide-react";

import { Logo } from "@/components/blocks/app-shell-4/components/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The folder buckets `email_messages.folder` can hold. */
export type MailFolder = "inbox" | "archive" | "spam";

export const MAIL_FOLDERS: Array<{ id: MailFolder; label: string; icon: LucideIcon }> = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "archive", label: "Archive", icon: ArchiveIcon },
  { id: "spam", label: "Spam", icon: ShieldAlertIcon },
];

/**
 * Render the vertical folder rail.
 *
 * @param active - Folder currently being listed.
 * @param unread - Unread count in the inbox; drives the pip.
 * @param onSelect - Called with the folder the user picked.
 * @returns A `<nav>` one icon-button wide.
 */
export function FolderRail({
  active,
  unread,
  onSelect,
}: {
  active: MailFolder;
  unread: number;
  onSelect: (folder: MailFolder) => void;
}) {
  return (
    <nav
      aria-label="Mail folders"
      className="border-border bg-sidebar flex w-12 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <div className="mb-2 flex items-center justify-center">
        <Logo />
      </div>

      <TooltipProvider>
        {MAIL_FOLDERS.map((folder) => {
          const Icon = folder.icon;
          const current = folder.id === active;
          return (
            <Tooltip key={folder.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant={current ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={folder.label}
                    aria-current={current ? "true" : undefined}
                    onClick={() => onSelect(folder.id)}
                    className={cn("relative", current && "text-foreground")}
                  />
                }
              >
                <Icon aria-hidden="true" />
                {folder.id === "inbox" && unread > 0 ? (
                  <span
                    className="bg-primary absolute top-0.5 right-0.5 size-1.5 rounded-full"
                    aria-hidden="true"
                  />
                ) : null}
              </TooltipTrigger>
              <TooltipContent side="right">
                {folder.id === "inbox" && unread > 0 ? `${folder.label} · ${unread} unread` : folder.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </nav>
  );
}
