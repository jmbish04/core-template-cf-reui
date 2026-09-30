/**
 * @fileoverview Sub-resource panels for `/tasks/[id]`: comments, subtasks and
 * attachments. Each panel owns one REST collection and nothing else.
 *
 * Endpoints:
 *  - `GET|POST /api/tasks/{id}/comments`
 *  - `GET|POST /api/tasks/{id}/subtasks`, `PATCH|DELETE .../subtasks/{subId}`
 *  - `GET|POST /api/tasks/{id}/attachments` (POST is multipart),
 *    `GET|DELETE .../attachments/{attId}`
 *
 * Built from ReUI / shadcn primitives already installed (`Item`, `Field`,
 * `Avatar`, `Badge`, `Button`) rather than hand-rolled styled boxes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DownloadIcon,
  MessageSquareIcon,
  PaperclipIcon,
  SendIcon,
  SquareCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState } from "@/components/common/shared";
import {
  initials,
  type TaskAttachment,
  type TaskComment,
  type TaskSubtask,
} from "@/components/common/types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { humanSize, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** `{ data: T[] }` — the envelope every task sub-resource list returns. */
interface DataEnvelope<T> {
  data: T[];
}

/**
 * Load a task sub-resource collection, with loading / error state.
 *
 * @param path API path under `/api/`, e.g. `tasks/abc/comments`.
 * @returns The rows plus a `reload` and the setter, for optimistic updates.
 */
function useCollection<T>(path: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<DataEnvelope<T>>(path)
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, token]);

  const reload = useCallback(() => setToken((n) => n + 1), []);
  return { rows, setRows, loading, error, setError, reload };
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * The task's discussion thread, oldest first, with a composer.
 *
 * @param taskId Task whose comments to show.
 */
export function CommentsPanel({ taskId }: { taskId: string }) {
  const path = `tasks/${taskId}/comments`;
  const { rows, setRows, loading, error, setError, reload } = useCollection<TaskComment>(path);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await apiSend<TaskComment>("POST", path, { body });
      setRows((current) => [...current, created]);
      setDraft("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post the comment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading ? (
        <PanelSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquareIcon />}
          title="No comments yet"
          description="Start the thread below."
        />
      ) : (
        <ItemGroup className="gap-2">
          {rows.map((comment) => (
            <Item key={comment.id} variant="outline" className="items-start">
              <ItemMedia>
                <Avatar size="sm">
                  <AvatarFallback>{initials(comment.author)}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="flex items-center gap-2">
                  {comment.author}
                  <span className="text-muted-foreground text-xs font-normal">
                    {relativeTime(comment.createdAt)}
                  </span>
                </ItemTitle>
                <ItemDescription className="whitespace-pre-wrap">{comment.body}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment..."
          aria-label="New comment"
          rows={3}
        />
        <div className="flex justify-end">
          <Button type="button" onClick={submit} disabled={sending || draft.trim().length === 0}>
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            {sending ? "Posting..." : "Post comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

/**
 * The task's checklist. Toggling an item re-syncs the parent task's `progress`
 * server-side, so the caller is told to refresh the header.
 *
 * @param taskId Task whose checklist to show.
 * @param onProgressChange Called after any mutation that moves `progress`.
 */
export function SubtasksPanel({
  taskId,
  onProgressChange,
}: {
  taskId: string;
  onProgressChange?: () => void;
}) {
  const path = `tasks/${taskId}/subtasks`;
  const { rows, setRows, loading, error, setError, reload } = useCollection<TaskSubtask>(path);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const doneCount = rows.filter((row) => row.done).length;

  async function add() {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    setError(null);
    try {
      const created = await apiSend<TaskSubtask>("POST", path, { title });
      setRows((current) => [...current, created]);
      setDraft("");
      onProgressChange?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the subtask.");
    } finally {
      setAdding(false);
    }
  }

  function toggle(subtask: TaskSubtask, done: boolean) {
    setError(null);
    setRows((current) => current.map((r) => (r.id === subtask.id ? { ...r, done } : r)));
    apiSend("PATCH", `${path}/${subtask.id}`, { done })
      .then(() => onProgressChange?.())
      .catch((e) => {
        setRows((current) =>
          current.map((r) => (r.id === subtask.id ? { ...r, done: subtask.done } : r)),
        );
        setError(e instanceof ApiError ? e.message : "Could not update the subtask.");
      });
  }

  function remove(subtask: TaskSubtask) {
    setError(null);
    setRows((current) => current.filter((r) => r.id !== subtask.id));
    apiSend("DELETE", `${path}/${subtask.id}`)
      .then(() => onProgressChange?.())
      .catch((e) => {
        setRows((current) => [...current, subtask]);
        setError(e instanceof ApiError ? e.message : "Could not delete the subtask.");
      });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading ? (
        <PanelSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<SquareCheckIcon />}
          title="No checklist items"
          description="Break the task down below."
        />
      ) : (
        <>
          <div className="text-muted-foreground text-sm">
            {`${doneCount} of ${rows.length} done`}
          </div>
          <ItemGroup className="gap-2">
            {rows.map((subtask) => (
              <Item key={subtask.id} variant="outline">
                <ItemMedia>
                  <Checkbox
                    checked={subtask.done}
                    onCheckedChange={(checked) => toggle(subtask, checked === true)}
                    aria-label={`Mark "${subtask.title}" ${subtask.done ? "not done" : "done"}`}
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle
                    className={cn(subtask.done && "text-muted-foreground line-through")}
                  >
                    {subtask.title}
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete "${subtask.title}"`}
                    onClick={() => remove(subtask)}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
          placeholder="Add a checklist item..."
          aria-label="New subtask"
        />
        <Button type="button" onClick={add} disabled={adding || draft.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Files attached to the task. Upload is `multipart/form-data`, so it bypasses
 * the JSON `apiSend` helper and posts a `FormData` body directly.
 *
 * @param taskId Task whose attachments to show.
 */
export function AttachmentsPanel({ taskId }: { taskId: string }) {
  const path = `tasks/${taskId}/attachments`;
  const { rows, setRows, loading, error, setError, reload } = useCollection<TaskAttachment>(path);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/${path}`, { method: "POST", body: form });
      const text = await res.text();
      const data = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        throw new ApiError(res.status, data?.error ?? `Upload failed (${res.status})`, data);
      }
      setRows((current) => [...current, data as TaskAttachment]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not upload the file.");
    } finally {
      setUploading(false);
    }
  }

  function remove(attachment: TaskAttachment) {
    setError(null);
    setRows((current) => current.filter((r) => r.id !== attachment.id));
    apiSend("DELETE", `${path}/${attachment.id}`).catch((e) => {
      setRows((current) => [...current, attachment]);
      setError(e instanceof ApiError ? e.message : "Could not delete the attachment.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading ? (
        <PanelSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PaperclipIcon />}
          title="No attachments"
          description="Upload a file to keep it with the task."
        />
      ) : (
        <ItemGroup className="gap-2">
          {rows.map((attachment) => (
            <Item key={attachment.id} variant="outline">
              <ItemMedia>
                <PaperclipIcon className="text-muted-foreground size-4" aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="truncate">{attachment.filename}</ItemTitle>
                <ItemDescription className="flex items-center gap-2">
                  {attachment.size ? (
                    <Badge variant="outline" className="tabular-nums">
                      {humanSize(attachment.size)}
                    </Badge>
                  ) : null}
                  <span>{relativeTime(attachment.createdAt)}</span>
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${attachment.filename}`}
                  render={<a href={`/api/${path}/${attachment.id}`} download />}
                >
                  <DownloadIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${attachment.filename}`}
                  onClick={() => remove(attachment)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <label className="flex w-fit items-center">
        <input
          type="file"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <span
          className={cn(
            "border-input bg-background hover:bg-accent inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <UploadIcon className="size-4" aria-hidden="true" />
          {uploading ? "Uploading..." : "Upload file"}
        </span>
      </label>
    </div>
  );
}
