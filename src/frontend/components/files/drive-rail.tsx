/**
 * @fileoverview The folder rail for `/files`: the block's `FolderTree` bound to
 * `GET /api/files/tree` and `GET /api/files/storage`.
 *
 * The same element is rendered twice — docked beside the browse panel on
 * desktop, and inside a sheet below `lg` — so it lives here rather than being
 * built inline in the explorer.
 */
import {
  DRIVE_ROOT_ID,
  findRow,
  type DriveRow,
} from "@/components/blocks/solution-files-1/components/data";
import {
  FolderTree,
  type FolderAction,
} from "@/components/blocks/solution-files-1/components/folder-tree";
import { STORAGE_BUDGET_BYTES, type StorageResponse } from "@/components/files/types";

export interface DriveRailProps {
  /** Every folder, nested. */
  folderRows: DriveRow[];
  /** Folder currently listed; null is the drive root. */
  folderId: string | null;
  storage: StorageResponse | null;
  expanded: string[];
  onExpandedChange: (next: string[]) => void;
  onNavigate: (folderId: string | null) => void;
  onRefreshStorage: () => void;
  /** Receives the context-menu action with the folder row it applies to.
   *  `folder` is null for the synthetic drive root, which only accepts "new". */
  onFolderAction: (action: FolderAction, folderId: string, folder: DriveRow | null) => void;
}

/**
 * Render the folder rail.
 *
 * @param props - The tree, the current folder and the storage numbers.
 * @returns The rail, sized to its container.
 */
export function DriveRail({
  folderRows,
  folderId,
  storage,
  expanded,
  onExpandedChange,
  onNavigate,
  onRefreshStorage,
  onFolderAction,
}: DriveRailProps) {
  return (
    <FolderTree
      rows={folderRows}
      selection={{ type: "folder", id: folderId ?? DRIVE_ROOT_ID }}
      usedBytes={storage?.usedBytes ?? 0}
      planBytes={STORAGE_BUDGET_BYTES}
      fileCount={storage?.fileCount ?? 0}
      folderCount={storage?.folderCount ?? 0}
      onSelect={(next) => onNavigate(next.id === DRIVE_ROOT_ID ? null : next.id)}
      onRefreshStorage={onRefreshStorage}
      onFolderAction={(action, id) =>
        onFolderAction(action, id, id === DRIVE_ROOT_ID ? null : (findRow(folderRows, id) ?? null))
      }
      expandedItems={expanded}
      onExpandedChange={onExpandedChange}
      className="h-full"
    />
  );
}
