/**
 * @fileoverview The thread rail every chat surface shares.
 *
 * `useThreads` owns the D1-backed thread index (`/api/threads`): list, create,
 * rename, delete, plus `applyTitle` for the `title` SSE event the server emits
 * when the model names a new thread on its first reply. `ThreadList` is the
 * presentation — a flat, dense list of rows with an inline rename and delete.
 *
 * Surfaces 5–12 import both; keep the exported shapes stable.
 */
import { useCallback, useEffect, useState } from "react";

import {
  createThread,
  deleteThread as deleteThreadApi,
  listThreads,
  renameThread as renameThreadApi,
  type ChatThread,
} from "@/lib/chat";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVerticalIcon, MessageSquareIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

export interface UseThreads {
  threads: ChatThread[];
  loading: boolean;
  /** Plain-language failure from the last thread-index call, or null. */
  error: string | null;
  refresh: () => Promise<void>;
  /** Create an empty thread and return it, or null when the call failed. */
  create: (title?: string) => Promise<ChatThread | null>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Fold a `title` SSE event into the rail without another round trip. */
  applyTitle: (id: string, title: string) => void;
}

/**
 * Bind a surface to the D1 thread index.
 *
 * @returns The thread list plus the mutations every rail needs.
 */
export function useThreads(): UseThreads {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setThreads(await listThreads());
      setError(null);
    } catch {
      setError("Could not load your conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async (title?: string) => {
    try {
      const thread = await createThread(title);
      setThreads((prev) => [thread, ...prev]);
      return thread;
    } catch {
      setError("Could not start a new conversation.");
      return null;
    }
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
    try {
      await renameThreadApi(id, trimmed);
    } catch {
      setError("Could not rename that conversation.");
      void refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const previous = threads;
    setThreads((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteThreadApi(id);
    } catch {
      setError("Could not delete that conversation.");
      setThreads(previous);
    }
  }, [threads]);

  const applyTitle = useCallback((id: string, title: string) => {
    setThreads((prev) => {
      // A thread the rail has not seen yet (created by the very first send)
      // is unknown here; a refresh picks it up, so only update what exists.
      if (!prev.some((t) => t.id === id)) return prev;
      return prev.map((t) => (t.id === id ? { ...t, title } : t));
    });
  }, []);

  return { threads, loading, error, refresh, create, rename, remove, applyTitle };
}

export interface ThreadListProps {
  threads: ChatThread[];
  activeId?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNew?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  /** Heading above the rows. Pass null for a bare list. */
  heading?: string | null;
  className?: string;
}

/**
 * Render the thread rail.
 *
 * @param props Threads, the active id, and the row callbacks.
 * @returns The rail, including its empty and loading states.
 */
export function ThreadList({
  threads,
  activeId,
  loading = false,
  onSelect,
  onNew,
  onRename,
  onDelete,
  heading = "Recent",
  className,
}: ThreadListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function commitRename(id: string) {
    setEditingId(null);
    if (draft.trim()) onRename?.(id, draft);
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-1.5", className)}>
      {(heading || onNew) && (
        <div className="flex h-7 shrink-0 items-center gap-2 px-2">
          {heading && <h2 className="text-muted-foreground text-xs font-medium">{heading}</h2>}
          {onNew && (
            <Button variant="ghost" size="icon-xs" aria-label="New chat" onClick={onNew} className="ms-auto">
              <PlusIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      )}

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <div className="flex flex-col gap-1.5 p-2" aria-hidden="true">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-7 w-3/5" />
          </div>
        ) : threads.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            No conversations yet. Send a message to start one.
          </p>
        ) : (
          threads.map((thread) => {
            const active = thread.id === activeId;
            if (editingId === thread.id) {
              return (
                <Input
                  key={thread.id}
                  autoFocus
                  value={draft}
                  aria-label={`Rename ${thread.title}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commitRename(thread.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(thread.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  className="h-8"
                />
              );
            }
            return (
              <div key={thread.id} className="group/row flex min-w-0 items-center gap-0.5">
                <Button
                  variant={active ? "secondary" : "ghost"}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(thread.id)}
                  className="[&_svg]:text-muted-foreground h-8 min-w-0 flex-1 justify-start gap-2 px-2 font-normal [&_svg]:size-3.5"
                >
                  <MessageSquareIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-start">{thread.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {relativeTime(thread.updatedAt)}
                  </span>
                </Button>

                {(onRename || onDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${thread.title}`}
                          className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                        />
                      }
                    >
                      <EllipsisVerticalIcon aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {onRename && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDraft(thread.title);
                            setEditingId(thread.id);
                          }}
                        >
                          <PencilIcon aria-hidden="true" />
                          Rename
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete(thread.id)}>
                          <Trash2Icon aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
