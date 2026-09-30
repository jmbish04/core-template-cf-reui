/**
 * @fileoverview CanvasDocument — the thread's one editable document, in a
 * PlateJS editor.
 *
 * This is the real `chat_documents` row for the open thread, not a mock page:
 * `getDocument` reads it, edits are debounced back through `saveDocument`, and
 * "Insert into draft" on a reply calls `appendToDocument` and re-reads.
 *
 * `PlateEditor` is string-in / string-out and the API is envelope-in /
 * envelope-out, so `documentToEditorBody` / `editorBodyToEnvelope` (from
 * `@/lib/chat`) are the only bridge — nothing here stringifies by hand.
 *
 * MOUNTING: PlateJS touches browser-only DOM APIs, so any island containing
 * this component must be mounted `client:only="react"`, never `client:load`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  documentToEditorBody,
  editorBodyToEnvelope,
  getDocument,
  saveDocument,
  type ChatDocument,
} from "@/lib/chat";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PlateEditor } from "@/components/notes";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** Long enough that a sentence is one save, short enough to feel immediate. */
const SAVE_DEBOUNCE_MS = 800;

export interface UseChatDocument {
  document: ChatDocument | null;
  loading: boolean;
  /** True while a debounced save is in flight. */
  saving: boolean;
  error: string | null;
  /** Push an editor body string; debounced, and skipped if it cannot parse. */
  edit: (body: string) => void;
  /** Rename the document (saved immediately). */
  rename: (title: string) => void;
  /** Re-read from D1 — call after an append. */
  reload: () => Promise<void>;
}

/**
 * Load and persist one thread's canvas document.
 *
 * @param threadId Thread whose document to open, or undefined before the
 *   server has created a thread (nothing is fetched).
 * @returns The document plus its edit/rename/reload handles.
 */
export function useChatDocument(threadId: string | undefined): UseChatDocument {
  const [document, setDocument] = useState<ChatDocument | null>(null);
  const [loading, setLoading] = useState(Boolean(threadId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!threadId) {
      setDocument(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDocument(await getDocument(threadId));
      setError(null);
    } catch {
      setError("Could not open the document for this conversation.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const edit = useCallback(
    (body: string) => {
      if (!threadId) return;
      const envelope = editorBodyToEnvelope(body);
      // A body the bridge could not parse is skipped rather than written: a
      // half-parsed value would overwrite a good document.
      if (!envelope) return;
      setDocument((prev) => (prev ? { ...prev, body: envelope } : prev));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setSaving(true);
        void saveDocument(threadId, { body: envelope })
          .then((saved) => {
            setDocument((prev) => (prev ? { ...prev, updatedAt: saved.updatedAt } : saved));
            setError(null);
          })
          .catch(() => setError("Could not save the document."))
          .finally(() => setSaving(false));
      }, SAVE_DEBOUNCE_MS);
    },
    [threadId],
  );

  const rename = useCallback(
    (title: string) => {
      if (!threadId || !title.trim()) return;
      setDocument((prev) => (prev ? { ...prev, title } : prev));
      void saveDocument(threadId, { title }).catch(() => setError("Could not rename the document."));
    },
    [threadId],
  );

  return { document, loading, saving, error, edit, rename, reload };
}

export interface CanvasDocumentProps {
  state: UseChatDocument;
  /** Shown when there is no thread yet, so the panel is never blank. */
  emptyHint?: string;
  className?: string;
}

/**
 * The document panel: title field, save indicator and the PlateJS editor.
 *
 * @param props The `useChatDocument` state to render.
 * @returns The panel body.
 */
export function CanvasDocument({ state, emptyHint, className }: CanvasDocumentProps) {
  const { document, loading, saving, error, edit, rename } = state;
  // The editor seeds itself from `value` once, so it is re-keyed per document;
  // a live save must not re-seed it mid-keystroke.
  const editorKey = document?.id ?? "none";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      {loading ? (
        <div className="flex flex-col gap-3 p-4" aria-hidden="true">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !document ? (
        <Empty className="m-auto">
          <EmptyHeader>
            <EmptyTitle>No draft yet</EmptyTitle>
            <EmptyDescription>
              {emptyHint ?? "Send the assistant a message. The draft is created with the conversation."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 px-1">
            <Input
              value={document.title}
              aria-label="Document title"
              onChange={(event) => rename(event.target.value)}
              className="h-8 border-0 bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
              {saving ? (
                <>
                  <Spinner className="size-3" />
                  Saving
                </>
              ) : (
                <>Saved {relativeTime(document.updatedAt)}</>
              )}
            </span>
          </div>

          {error && <p className="text-destructive px-1 text-xs">{error}</p>}

          <div className="scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            <PlateEditor
              key={editorKey}
              value={documentToEditorBody(document)}
              onChange={edit}
              placeholder="Write the draft, or insert a reply from the assistant…"
              contentClassName="max-h-none min-h-64"
            />
          </div>
        </>
      )}
    </div>
  );
}
