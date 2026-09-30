/**
 * @fileoverview The view model and formatters for ReUI block
 * `solution-files-1`, with the block's demo drive removed.
 *
 * What the block shipped here was a hand-written tree of studio files plus the
 * share/version cast that went with it. All of that is gone: the rows now come
 * from `/api/files` (D1 metadata, R2 bytes) through
 * `@/components/files/types`, and this file keeps only what is genuinely
 * presentation — the row shape the cells read, the glyph families, and the
 * formatters.
 *
 * A folder's total size and descendant count are NOT derivable here any more:
 * the API pages one folder at a time, so `sizeBytes` is 0 and `itemCount` is 0
 * on a folder because they are *unknown*, not because the folder is empty. The
 * cells that would print those numbers render an em dash instead.
 */
import { type ReactNode } from "react"
import { FolderIcon, FileTextIcon, ImageIcon, VideoIcon, ArchiveIcon, CodeIcon, FileIcon } from "lucide-react"

// ── Types ──

/**
 * Glyph family, not file format. The icon catalog has no zip/pdf/audio glyph,
 * so the exact format travels separately in `typeLabel`.
 */
export type FileKind =
  | "folder"
  | "document"
  | "image"
  | "video"
  | "archive"
  | "code"
  | "file"

export interface DriveOwner {
  name: string
  avatar?: string
}

export interface DriveNode {
  id: string
  name: string
  kind: FileKind
  /** Exact format shown in the Type column: PDF, PNG, ZIP. */
  typeLabel: string
  /** Bytes on disk. 0 on a folder, where the total is unknown client-side. */
  sizeBytes: number
  owner: DriveOwner
  /** ISO timestamp of the last write — the sortable field. */
  modifiedAt: string
  /** Relative label derived from `modifiedAt` when the row is adapted. */
  modifiedLabel: string
  starred: boolean
  /** Owning folder id, or null at the drive root. */
  parentId: string | null
}

/** One node as the grid renders it. */
export interface DriveRow {
  id: string
  node: DriveNode
  /** Own size on a file. 0 on a folder: the total is not knowable here. */
  sizeBytes: number
  /** Descendants on a folder. 0 means "not counted", not "empty". */
  itemCount: number
  children?: DriveRow[]
}

// ── Constants ──

export const DRIVE_NAME = "Drive"
/** Synthetic id for the drive root, where the API's `parent_id` is null. */
export const DRIVE_ROOT_ID = "my-drive"

// Static icon nodes per glyph family. Icon names must stay literal, so the
// whole element lives in data; prettier-ignore keeps the table one row deep.
// prettier-ignore
export const FILE_KIND_ICONS: Record<FileKind, ReactNode> = {
  folder: <FolderIcon aria-hidden="true" />,
  document: <FileTextIcon aria-hidden="true" />,
  image: <ImageIcon aria-hidden="true" />,
  video: <VideoIcon aria-hidden="true" />,
  archive: <ArchiveIcon aria-hidden="true" />,
  code: <CodeIcon aria-hidden="true" />,
  file: <FileIcon aria-hidden="true" />,
}

/** Filterable glyph families, in the order the Type filter lists them. */
export const FILE_KIND_OPTIONS: { value: FileKind; label: string }[] = [
  { value: "folder", label: "Folders" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "archive", label: "Archives" },
  { value: "code", label: "Code" },
  { value: "file", label: "Other" },
]

// ── Tree helpers ──

/**
 * Find a row anywhere in a nested row list.
 *
 * @param rows - Root rows to search.
 * @param id - Entry id to find.
 * @returns The row, or undefined.
 */
export function findRow(rows: DriveRow[], id: string): DriveRow | undefined {
  for (const row of rows) {
    if (row.id === id) return row
    const nested = row.children ? findRow(row.children, id) : undefined
    if (nested) return nested
  }
  return undefined
}

/**
 * Flatten every row below `rows`, folders included.
 *
 * @param rows - Root rows.
 * @returns One flat array in depth-first order.
 */
export function collectAllRows(rows: DriveRow[]): DriveRow[] {
  return rows.flatMap((row) =>
    row.children ? [row, ...collectAllRows(row.children)] : [row]
  )
}

/**
 * Folder ids from the drive root down to `folderId`, inclusive.
 *
 * @param rows - The folder tree.
 * @param folderId - Target folder, or the root id.
 * @returns The id chain starting at `DRIVE_ROOT_ID`.
 */
export function getFolderPath(rows: DriveRow[], folderId: string): string[] {
  if (folderId === DRIVE_ROOT_ID) return [DRIVE_ROOT_ID]

  function walk(current: DriveRow[], trail: string[]): string[] | undefined {
    for (const row of current) {
      const next = [...trail, row.id]
      if (row.id === folderId) return next
      if (row.children) {
        const found = walk(row.children, next)
        if (found) return found
      }
    }
    return undefined
  }

  return walk(rows, [DRIVE_ROOT_ID]) ?? [DRIVE_ROOT_ID]
}

// ── Formatting ──

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"]

/**
 * Human-readable byte size.
 *
 * @param bytes - Byte count.
 * @returns e.g. "1.25 MB". Zero renders as "0 B".
 */
export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B"

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  )
  const value = bytes / 1024 ** exponent
  const fractionDigits = exponent === 0 ? 0 : value >= 10 ? 1 : 2

  return `${value.toFixed(fractionDigits)} ${BYTE_UNITS[exponent]}`
}

/**
 * Group a count for display.
 *
 * @param value - The number.
 * @returns The same number with thousands separators.
 */
export function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

/**
 * Initials for an owner avatar fallback.
 *
 * @param name - Owner display name.
 * @returns At most two letters.
 */
export function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
}
