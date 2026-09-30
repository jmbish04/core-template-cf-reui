/**
 * @fileoverview The server state behind `/files`: listing, folder tree, storage
 * usage, the mutations, and uploads with real progress.
 *
 * Every value here comes from `/api/files`. Nothing is derived optimistically
 * except the in-flight upload rows, which are replaced by the server's row the
 * moment the POST returns.
 *
 * Uploads go through `XMLHttpRequest` rather than `fetch` on purpose: `fetch`
 * cannot report request-body progress, so a fetch-based upload panel would show
 * a bar that is decoration. The 25MB cap is the route's, and its 413 body is
 * surfaced verbatim rather than flattened into "upload failed".
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DriveRow } from "@/components/blocks/solution-files-1/components/data";
import type { UploadEntry } from "@/components/blocks/solution-files-1/components/upload-panel";
import {
  buildFolderRows,
  toDriveRow,
  type FileEntry,
  type FileListResponse,
  type StorageResponse,
} from "@/components/files/types";
import { apiGet, apiSend } from "@/lib/api";

export interface DriveState {
  /** Folder being listed; null is the drive root. */
  folderId: string | null;
  /** Root → current folder. Empty at the root and while searching. */
  path: Array<{ id: string; name: string }>;
  /** The current folder's children, or the search hits. */
  rows: DriveRow[];
  /** Every folder, nested — the tree rail and the move dialog walk this. */
  folderRows: DriveRow[];
  storage: StorageResponse | null;
  loading: boolean;
  error: string | null;
  uploads: UploadEntry[];
}

/**
 * Load and mutate the drive.
 *
 * @param query - Drive-wide name search; empty lists the current folder.
 * @param starredOnly - Restrict the listing to starred entries.
 * @returns The current drive state plus every action the explorer needs.
 */
export function useDrive(query: string, starredOnly: boolean) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [listing, setListing] = useState<FileListResponse | null>(null);
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [storage, setStorage] = useState<StorageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setListing(
        await apiGet<FileListResponse>("files", {
          parentId: folderId ?? undefined,
          q: query || undefined,
          scope: starredOnly ? "starred" : undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list that folder.");
    } finally {
      setLoading(false);
    }
  }, [folderId, query, starredOnly]);

  const loadTree = useCallback(async () => {
    try {
      const res = await apiGet<{ data: FileEntry[] }>("files/tree");
      setTree(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the folder tree.");
    }
  }, []);

  const loadStorage = useCallback(async () => {
    try {
      setStorage(await apiGet<StorageResponse>("files/storage"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read storage usage.");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadTree();
    void loadStorage();
  }, [loadTree, loadStorage]);

  /** Re-read everything the last write could have changed. */
  const refreshAll = useCallback(async () => {
    await Promise.all([loadList(), loadTree(), loadStorage()]);
  }, [loadList, loadTree, loadStorage]);

  /**
   * Run one mutation, surfacing the API's own message on failure.
   *
   * @param work - The request to run.
   * @param fallback - Message used when the failure carries none.
   * @returns True when the write succeeded.
   */
  const mutate = useCallback(
    async (work: () => Promise<unknown>, fallback: string) => {
      try {
        await work();
        await refreshAll();
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
        return false;
      }
    },
    [refreshAll],
  );

  const createFolder = useCallback(
    (name: string, parentId: string | null) =>
      mutate(
        () => apiSend("POST", "files/folders", { name, parentId }),
        "Could not create that folder.",
      ),
    [mutate],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      mutate(() => apiSend("PATCH", `files/${id}`, { name }), "Could not rename that entry."),
    [mutate],
  );

  const move = useCallback(
    (id: string, parentId: string | null) =>
      // A move into the item's own subtree is refused by the API with a real
      // message ("A folder cannot be moved inside itself."); it is shown as-is.
      mutate(() => apiSend("PATCH", `files/${id}`, { parentId }), "Could not move that entry."),
    [mutate],
  );

  const setStarred = useCallback(
    (id: string, starred: boolean) =>
      mutate(() => apiSend("PATCH", `files/${id}`, { starred }), "Could not star that entry."),
    [mutate],
  );

  const remove = useCallback(
    (ids: string[]) =>
      mutate(
        () => Promise.all(ids.map((id) => apiSend("DELETE", `files/${id}`))),
        "Could not delete that.",
      ),
    [mutate],
  );

  /**
   * Upload files into a folder, one request each, with live progress.
   *
   * @param files - Files chosen or dropped by the user.
   * @param parentId - Destination folder, or null for the root.
   */
  const upload = useCallback(
    async (files: File[], parentId: string | null) => {
      await Promise.all(
        files.map(
          (file) =>
            new Promise<void>((resolve) => {
              const id = `${file.name}-${Date.now()}-${Math.round(file.size)}`;
              setUploads((prev) => [
                ...prev,
                { id, name: file.name, sizeBytes: file.size, progress: 0, status: "uploading" },
              ]);

              const body = new FormData();
              body.set("file", file);
              if (parentId) body.set("parentId", parentId);

              const request = new XMLHttpRequest();
              request.open("POST", "/api/files/upload");
              request.upload.addEventListener("progress", (event) => {
                if (!event.lengthComputable) return;
                const progress = (event.loaded / event.total) * 100;
                setUploads((prev) =>
                  prev.map((entry) => (entry.id === id ? { ...entry, progress } : entry)),
                );
              });
              request.addEventListener("loadend", () => {
                const ok = request.status >= 200 && request.status < 300;
                if (!ok) {
                  // The route answers 413 over the 25MB cap with a message that
                  // names the limit; show that rather than a generic failure.
                  const message = readError(request.responseText);
                  setError(message ?? `Upload failed (${request.status}).`);
                }
                setUploads((prev) =>
                  prev.map((entry) =>
                    entry.id === id
                      ? { ...entry, progress: ok ? 100 : entry.progress, status: ok ? "done" : "error" }
                      : entry,
                  ),
                );
                resolve();
              });
              request.send(body);
            }),
        ),
      );
      await refreshAll();
    },
    [refreshAll],
  );

  const rows = useMemo(() => (listing?.data ?? []).map(toDriveRow), [listing]);
  const folderRows = useMemo(() => buildFolderRows(tree), [tree]);

  return {
    folderId,
    setFolderId,
    path: listing?.path ?? [],
    rows,
    folderRows,
    storage,
    loading,
    error,
    setError,
    uploads,
    setUploads,
    createFolder,
    rename,
    move,
    setStarred,
    remove,
    upload,
    reload: refreshAll,
    loadStorage,
  };
}

/**
 * Pull the `error` field out of a JSON error body.
 *
 * @param text - Raw response body.
 * @returns The message, or null when the body is not the API's error shape.
 */
function readError(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
