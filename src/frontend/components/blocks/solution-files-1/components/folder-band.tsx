/**
 * @fileoverview The "Suggested Folders" band from ReUI block
 * `solution-files-1`, listing the current folder's subfolders as shortcuts.
 */
import { IconTile } from "@/components/reui/icon-tile"

import { Button } from "@/components/ui/button"
import { type DriveRow } from "./data"
import { FolderIcon } from "lucide-react"

export function FolderBand({
  folders,
  onOpen,
}: {
  folders: DriveRow[]
  onOpen: (row: DriveRow) => void
}) {
  if (folders.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-4">
      <p className="text-muted-foreground text-xs font-medium">
        Suggested Folders
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => (
          <Button
            key={folder.id}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start! gap-2.5 px-2.5 py-2 text-start! font-normal"
            onClick={() => onOpen(folder)}
          >
            <IconTile variant="elevated" aria-hidden="true">
              {/* prettier-ignore */}
              <FolderIcon aria-hidden="true" />
            </IconTile>
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="text-foreground w-full truncate text-sm font-medium">
                {folder.node.name}
              </span>
              {/* The block printed a size and an item count here. Neither is
                  knowable client-side against a per-folder API, and a derived
                  "0 B · 0 items" would read as an empty folder. */}
              <span className="text-muted-foreground text-xs">Folder</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  )
}