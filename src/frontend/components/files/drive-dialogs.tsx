/**
 * @fileoverview The three drive dialogs — rename / new folder, delete, move —
 * composed in one place so the explorer stays about the browse surface.
 *
 * Each one is the block's own dialog; the only change is that the delete
 * confirmation states how many entries go, because `DELETE /api/files/{id}`
 * cascades through D1 and R2 with no trash to recover from.
 */
import {
  DeleteDialog,
  NameDialog,
  type NamePrompt,
} from "@/components/blocks/solution-files-1/components/crud-dialogs";
import {
  DRIVE_ROOT_ID,
  formatCount,
  type DriveRow,
} from "@/components/blocks/solution-files-1/components/data";
import { MoveDialog } from "@/components/blocks/solution-files-1/components/move-dialog";

export interface DriveDialogsProps {
  namePrompt: NamePrompt | null;
  onSubmitName: (name: string) => void;
  onCloseName: () => void;

  /** Entries queued for deletion, with the label the confirmation names. */
  deleteTarget: { ids: string[]; label: string } | null;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;

  moveTarget: DriveRow | null;
  /** Every folder, nested — the destination picker walks this. */
  folderRows: DriveRow[];
  moveDest: string;
  /** The target itself plus its descendants: moving into them would orphan it. */
  blockedIds: ReadonlySet<string>;
  onMoveDest: (folderId: string) => void;
  onConfirmMove: () => void;
  onCloseMove: () => void;
  /** Resolved label chain for a folder id, for the picker's subtitles. */
  pathOf: (id: string) => string[];
}

/**
 * Render the drive's dialogs.
 *
 * @param props - Which dialog is open, and what each one commits to.
 * @returns The three dialogs; each renders nothing while closed.
 */
export function DriveDialogs({
  namePrompt,
  onSubmitName,
  onCloseName,
  deleteTarget,
  onConfirmDelete,
  onCloseDelete,
  moveTarget,
  folderRows,
  moveDest,
  blockedIds,
  onMoveDest,
  onConfirmMove,
  onCloseMove,
  pathOf,
}: DriveDialogsProps) {
  return (
    <>
      <NameDialog
        prompt={namePrompt}
        onSubmit={onSubmitName}
        onOpenChange={(open) => !open && onCloseName()}
      />

      <DeleteDialog
        open={deleteTarget !== null}
        targetLabel={deleteTarget?.label ?? ""}
        detail={
          deleteTarget && deleteTarget.ids.length > 1
            ? `${formatCount(deleteTarget.ids.length)} entries go, plus everything under them.`
            : "Everything inside it goes with it."
        }
        onConfirm={onConfirmDelete}
        onOpenChange={(open) => !open && onCloseDelete()}
      />

      <MoveDialog
        open={moveTarget !== null}
        targetName={moveTarget?.node.name ?? ""}
        currentParent={pathOf(moveTarget?.node.parentId ?? DRIVE_ROOT_ID).at(-1) ?? "My Drive"}
        rows={folderRows}
        destId={moveDest}
        destPath={pathOf(moveDest)}
        disabledIds={blockedIds}
        onDest={onMoveDest}
        onConfirm={onConfirmMove}
        onOpenChange={(open) => !open && onCloseMove()}
        destPathOf={pathOf}
      />
    </>
  );
}
