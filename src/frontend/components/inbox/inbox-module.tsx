/**
 * @fileoverview `/inbox` — the two-pane mail module, built from ReUI block
 * `app-shell-4` and backed by the `email_messages` D1 table.
 *
 * THE NESTED-SHELL PROBLEM: `app-shell-4` ships as a whole application shell —
 * a `SidebarProvider`, a collapsible `Sidebar` containing the folder rail and
 * the list, a `SidebarInset` and a page header. This page already renders
 * inside the global app-shell-2 shell, so mounting that would nest two sidebar
 * providers: two sets of `--sidebar-width` variables, two mobile off-canvas
 * layers and two triggers. The outer chrome is therefore dropped and the block's
 * *contents* are composed here as an ordinary flex row inside `PageBody` —
 * folder rail, 440px list, reading pane — with no sidebar context at all.
 *
 * Endpoints: `GET /api/inbox` (list, filtered server-side),
 * `GET /api/inbox/{id}` (the open message), `PATCH /api/inbox/{id}`
 * (read / starred / folder) and `POST /api/inbox/seed` from the empty state.
 *
 * RESPONSIVE STRATEGY
 * desktop: rail | 440px list | reading pane, side by side.
 * mobile (390px): one pane at a time — the list fills the module, and opening a
 * message replaces it with the reading pane plus a back control.
 */
import { InboxIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FolderRail, MAIL_FOLDERS, type MailFolder } from "@/components/blocks/app-shell-4/components/folder-rail";
import { MailList, type MailFilter } from "@/components/blocks/app-shell-4/components/mail-list";
import { MessageHeader } from "@/components/blocks/app-shell-4/components/message-header";
import { EmptyState, ErrorState } from "@/components/common";
import { MessageView } from "@/components/inbox/message-view";
import type { EmailMessage, InboxListResponse } from "@/components/inbox/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGet, apiSend } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The inbox island.
 *
 * @returns The folder rail, message list and reading pane as one module.
 */
export function InboxModule() {
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [filter, setFilter] = useState<MailFilter>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  const [list, setList] = useState<InboxListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<EmailMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<InboxListResponse>("inbox", {
        // The starred view is deliberately cross-folder server-side, so the
        // folder is only sent when it actually scopes the query.
        folder: filter === "starred" ? undefined : folder,
        q: debounced || undefined,
        read: filter === "unread" ? "false" : undefined,
        starred: filter === "starred" ? "true" : undefined,
      });
      setList(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the inbox.");
    } finally {
      setLoading(false);
    }
  }, [folder, filter, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Open a message: fetch the server's copy, then mark it read if it wasn't. */
  const open = useCallback(async (message: EmailMessage) => {
    setActive(message);
    try {
      const full = await apiGet<EmailMessage>(`inbox/${message.id}`);
      setActive(full);
      if (!full.read) {
        const updated = await apiSend<EmailMessage>("PATCH", `inbox/${full.id}`, { read: true });
        setActive(updated);
        // The unread badge and the Unread tab both come from the envelope.
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that message.");
    }
  }, [load]);

  /** Apply a PATCH to the open message and resync the list behind it. */
  const patch = useCallback(
    async (body: { read?: boolean; starred?: boolean; folder?: MailFolder }) => {
      if (!active) return;
      setBusy(true);
      try {
        const updated = await apiSend<EmailMessage>("PATCH", `inbox/${active.id}`, body);
        // Moving a message out of the folder being listed closes the pane —
        // leaving it open would show a message the list no longer contains.
        setActive(body.folder && body.folder !== folder ? null : updated);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update that message.");
      } finally {
        setBusy(false);
      }
    },
    [active, folder, load],
  );

  async function seed() {
    setSeeding(true);
    try {
      await apiSend("POST", "inbox/seed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed the demo inbox.");
    } finally {
      setSeeding(false);
    }
  }

  const folderLabel = MAIL_FOLDERS.find((entry) => entry.id === folder)?.label ?? "Inbox";
  const title = filter === "starred" ? "Starred" : folderLabel;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="border-border bg-card flex h-[calc(100dvh-13rem)] min-h-[32rem] min-w-0 overflow-hidden rounded-lg border">
        <FolderRail
          active={folder}
          unread={list?.unread ?? 0}
          onSelect={(next) => {
            setFolder(next);
            setActive(null);
            if (filter === "starred") setFilter("all");
          }}
        />

        {/* One pane at a time below md: whichever is not in use is hidden. */}
        <div
          className={cn(
            "border-border min-h-0 min-w-0 flex-1 md:flex md:w-[440px] md:max-w-[440px] md:flex-none md:border-r",
            active ? "hidden md:flex" : "flex",
          )}
        >
          <MailList
            title={title}
            messages={list?.data ?? []}
            selectedId={active?.id ?? null}
            loading={loading}
            unread={list?.unread ?? 0}
            filter={filter}
            query={query}
            onFilterChange={(next) => {
              setFilter(next);
              setActive(null);
            }}
            onQueryChange={setQuery}
            onSelect={(message) => void open(message)}
            emptyState={
              <EmptyState
                icon={<InboxIcon aria-hidden="true" />}
                title={folder === "inbox" ? "No mail yet" : `Nothing in ${folderLabel.toLowerCase()}`}
                description={
                  folder === "inbox"
                    ? "Real mail arrives here through Cloudflare Email Routing. Seed the labelled demo messages to see the surface working before then."
                    : "Messages moved here will show up in this folder."
                }
                action={
                  folder === "inbox" ? (
                    <Button variant="outline" disabled={seeding} onClick={() => void seed()}>
                      {seeding ? "Seeding…" : "Seed demo mail"}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", active ? "flex" : "hidden md:flex")}>
          {active ? (
            <>
              <MessageHeader
                message={active}
                busy={busy}
                onBack={() => setActive(null)}
                onToggleStar={() => void patch({ starred: !active.starred })}
                onMarkUnread={() => void patch({ read: false })}
                onMove={(next) => void patch({ folder: next })}
              />
              <ScrollArea className="min-h-0 flex-1">
                <MessageView message={active} />
              </ScrollArea>
            </>
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
              Select a message to read it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
