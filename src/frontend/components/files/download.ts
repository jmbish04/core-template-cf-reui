/**
 * @fileoverview Downloading a file's bytes from `GET /api/files/{id}/content`.
 *
 * The route answers 404 when no such row exists and 410 when the D1 row is
 * there but the R2 object is not. Those are different failures with different
 * fixes — a missing row means the entry was deleted, a missing object means the
 * drive and the bucket have drifted — so they get different messages instead of
 * one "download failed".
 */
import type { DriveRow } from "@/components/blocks/solution-files-1/components/data";

/**
 * Fetch a file and hand it to the browser as a download.
 *
 * @param row - The file to fetch; folders are ignored.
 * @param onError - Receives the message when the fetch fails.
 */
export async function downloadFile(row: DriveRow, onError: (message: string) => void) {
  if (row.node.kind === "folder") return;
  try {
    const res = await fetch(`/api/files/${row.id}/content`);
    if (res.status === 410) {
      onError(
        `“${row.node.name}” is listed in D1 but its object is gone from R2, so there is nothing to download.`,
      );
      return;
    }
    if (res.status === 404) {
      onError(`“${row.node.name}” no longer exists — refresh the folder.`);
      return;
    }
    if (!res.ok) {
      onError(`Could not download “${row.node.name}” (${res.status}).`);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = row.node.name;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    onError(err instanceof Error ? err.message : "The download failed.");
  }
}

/**
 * Copy a file's download URL to the clipboard.
 *
 * @param id - File id.
 * @param onError - Receives the message when the clipboard is unavailable.
 */
export async function copyDownloadLink(id: string, onError: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/api/files/${id}/content`);
  } catch {
    onError("The browser would not give access to the clipboard.");
  }
}
