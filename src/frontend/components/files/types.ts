/**
 * @fileoverview Wire types for `/api/files` plus the adapters that turn them
 * into the `DriveRow` view model ReUI block `solution-files-1` renders.
 *
 * The block was written against an in-memory tree where every folder knew its
 * descendants, so it could derive folder sizes and item counts. The real drive
 * is paged per folder: `GET /api/files` returns ONE folder's children and
 * `GET /api/files/tree` returns folders only. A folder's total size and item
 * count are therefore genuinely unknown on the client, and the views say so
 * rather than rendering a derived 0 that would read as "empty".
 */
import { relativeTime } from "@/lib/format";
import type { DriveNode, DriveRow, FileKind } from "@/components/blocks/solution-files-1/components/data";

/** One row of the `files` D1 table as it arrives over JSON. */
export interface FileEntry {
  id: string;
  parentId: string | null;
  kind: "folder" | "file";
  name: string;
  mimeType: string | null;
  size: number | null;
  r2Key: string | null;
  owner: string;
  starred: boolean;
  createdAt: number | string;
  updatedAt: number | string;
}

/** `GET /api/files` — one folder's children, or search hits drive-wide. */
export interface FileListResponse {
  data: FileEntry[];
  /** Root → current folder. Empty at the root, and empty while searching. */
  path: Array<{ id: string; name: string }>;
}

/** `GET /api/files/storage`. */
export interface StorageResponse {
  usedBytes: number;
  fileCount: number;
  folderCount: number;
}

/**
 * Display scale for the storage meter.
 *
 * R2 imposes no per-bucket quota, so there is no real "plan ceiling" to draw a
 * bar against. This is the template's own display budget — change it, or drop
 * the bar, when a deployment has a real one.
 */
export const STORAGE_BUDGET_BYTES = 1024 ** 3;

/**
 * Pick the block's glyph family for an entry.
 *
 * @param entry - The file row.
 * @returns The `FileKind` that selects the row icon.
 */
export function kindOf(entry: FileEntry): FileKind {
  if (entry.kind === "folder") return "folder";
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (/zip|compressed|tar|rar|7z/.test(mime)) return "archive";
  if (/json|javascript|typescript|xml|x-sh|x-python|css|html/.test(mime)) return "code";
  if (/pdf|word|document|spreadsheet|presentation|^text\//.test(mime)) return "document";
  return "file";
}

/**
 * The short format label shown in the Type column.
 *
 * @param entry - The file row.
 * @returns An extension in caps, else the MIME subtype, else "File".
 */
export function typeLabelOf(entry: FileEntry): string {
  if (entry.kind === "folder") return "Folder";
  const extension = entry.name.includes(".") ? entry.name.split(".").pop() : undefined;
  if (extension && extension.length <= 5) return extension.toUpperCase();
  const subtype = entry.mimeType?.split("/")[1];
  return subtype ? subtype.toUpperCase() : "File";
}

/**
 * Adapt one API row into the block's node shape.
 *
 * @param entry - The file row.
 * @returns A `DriveNode` the block's cells can render.
 */
export function toDriveNode(entry: FileEntry): DriveNode {
  const modifiedAt =
    typeof entry.updatedAt === "number"
      ? new Date(entry.updatedAt).toISOString()
      : String(entry.updatedAt);
  return {
    id: entry.id,
    name: entry.name,
    kind: kindOf(entry),
    typeLabel: typeLabelOf(entry),
    sizeBytes: entry.size ?? 0,
    owner: { name: entry.owner },
    modifiedAt,
    modifiedLabel: relativeTime(entry.updatedAt),
    starred: entry.starred,
    parentId: entry.parentId,
  };
}

/**
 * Adapt one API row into a grid row.
 *
 * @param entry - The file row.
 * @returns A flat `DriveRow`; folders carry no derived totals.
 */
export function toDriveRow(entry: FileEntry): DriveRow {
  return { id: entry.id, node: toDriveNode(entry), sizeBytes: entry.size ?? 0, itemCount: 0 };
}

/**
 * Build the nested folder rows the tree rail and the move dialog walk.
 *
 * @param folders - Every folder row from `GET /api/files/tree`.
 * @returns Root folders, each with its `children` resolved.
 */
export function buildFolderRows(folders: FileEntry[]): DriveRow[] {
  const rows = new Map<string, DriveRow>();
  for (const folder of folders) rows.set(folder.id, { ...toDriveRow(folder), children: [] });

  const roots: DriveRow[] = [];
  for (const folder of folders) {
    const row = rows.get(folder.id)!;
    const parent = folder.parentId ? rows.get(folder.parentId) : undefined;
    if (parent) parent.children!.push(row);
    else roots.push(row);
  }
  return roots;
}
