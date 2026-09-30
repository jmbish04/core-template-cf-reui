import { Fragment, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table"
import { type ColumnDef } from "@tanstack/react-table"
import { cn } from "@/lib/utils"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  FILE_KIND_ICONS,
  formatBytes,
  getInitials,
  type DriveRow,
  type FileKind,
} from "./data"
import { Trash2Icon, LinkIcon, PencilIcon, StarIcon, FolderIcon, DownloadIcon, EllipsisVerticalIcon } from "lucide-react"

// Type sorts by glyph family first and only then by the exact format, so a sort
// on Type lands folders above files the way a drive reads.
const TYPE_RANK: Record<FileKind, number> = {
  folder: 0,
  document: 1,
  image: 2,
  video: 3,
  archive: 4,
  code: 5,
  file: 6,
}

const ROW_ACTIONS: {
  id: string
  label: string
  icon: ReactNode
  destructive?: boolean
  /** Files only — a folder has no bytes to fetch. */
  filesOnly?: boolean
}[] = [
  { id: "rename", label: "Rename", icon: <PencilIcon aria-hidden="true" /> },
  { id: "star", label: "Star", icon: <StarIcon aria-hidden="true" /> },
  { id: "move", label: "Move", icon: <FolderIcon aria-hidden="true" /> },
  { id: "link", label: "Copy Download Link", filesOnly: true, icon: <LinkIcon aria-hidden="true" /> },
  { id: "download", label: "Download", filesOnly: true, icon: <DownloadIcon aria-hidden="true" /> },
  { id: "remove", label: "Delete", destructive: true, icon: <Trash2Icon aria-hidden="true" /> },
]

function DriveNameCell({
  row,
  onOpen,
  onToggleStar,
  upload,
}: {
  row: DriveRow
  onOpen: (row: DriveRow) => void
  onToggleStar: (row: DriveRow) => void
  /** Present only while the transfer is running or has failed. */
  upload?: { progress: number; status: "uploading" | "error" | "done" }
}) {
  const { node } = row
  const isFolder = node.kind === "folder"

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Glyph stays bare: at row density a tile around every icon reads as a
          second checkbox column. While a file is uploading the slot shows the
          ring INSTEAD of the file icon, not around it: one slot carries one
          signal, and the icon returns the moment the transfer settles. */}
      <span
        aria-hidden={upload?.status === "uploading" ? undefined : "true"}
        role={upload?.status === "uploading" ? "progressbar" : undefined}
        aria-valuenow={
          upload?.status === "uploading"
            ? Math.round(upload.progress)
            : undefined
        }
        aria-valuemin={upload?.status === "uploading" ? 0 : undefined}
        aria-valuemax={upload?.status === "uploading" ? 100 : undefined}
        aria-label={
          upload?.status === "uploading" ? `Uploading ${node.name}` : undefined
        }
        className={cn(
          "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
          isFolder ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {upload?.status === "uploading" ? (
          <svg className="size-4 -rotate-90" viewBox="0 0 16 16">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground/25"
            />
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 6}
              strokeDashoffset={2 * Math.PI * 6 * (1 - upload.progress / 100)}
              className="text-primary transition-[stroke-dashoffset] duration-300"
            />
          </svg>
        ) : (
          FILE_KIND_ICONS[node.kind]
        )}
      </span>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="hover:text-primary text-foreground min-w-0 truncate text-start text-sm transition-colors"
      >
        <span
          className={cn("truncate", isFolder ? "font-semibold" : "font-medium")}
        >
          {node.name}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={node.starred}
        aria-label={node.starred ? `Unstar ${node.name}` : `Star ${node.name}`}
        className={cn(
          "-ms-1 shrink-0 transition-opacity",
          !node.starred &&
            "text-muted-foreground/60 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        )}
        onClick={() => onToggleStar(row)}
      >
        {/* prettier-ignore */}
        <StarIcon className={cn( "size-3.5", node.starred && "text-warning fill-current" )} aria-hidden="true" />
      </Button>
    </div>
  )
}

function DriveOwnerCell({ row }: { row: DriveRow }) {
  const { owner } = row.node

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-5 shrink-0">
        {owner.avatar ? <AvatarImage src={owner.avatar} alt="" /> : null}
        <AvatarFallback className="text-[9px]">
          {getInitials(owner.name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-foreground min-w-0 truncate text-sm">
        {owner.name}
      </span>
    </div>
  )
}

function DriveSizeCell({ row }: { row: DriveRow }) {
  const isFolder = row.node.kind === "folder"

  // A folder's total is NOT known here: the API pages one folder at a time,
  // so printing formatBytes(0) would read as "empty" when it means "not counted".
  if (isFolder) {
    return (
      <span className="text-muted-foreground text-sm" title="Folder totals are not computed">
        —
      </span>
    )
  }

  return (
    <span className="text-foreground text-sm tabular-nums">
      {formatBytes(row.sizeBytes)}
    </span>
  )
}

function DriveActionsCell({
  row,
  onAction,
}: {
  row: DriveRow
  onAction: (action: string, row: DriveRow) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${row.node.name}`}
          >
            {/* prettier-ignore */}
            <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {ROW_ACTIONS.filter(
          (action) => !action.filesOnly || row.node.kind !== "folder"
        ).map((action) => (
          <Fragment key={action.id}>
            {action.destructive ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : undefined}
              onClick={() => onAction(action.id, row)}
            >
              {action.icon}
              {action.id === "star" && row.node.starred
                ? "Unstar"
                : action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DriveModifiedCell({ row }: { row: DriveRow }) {
  const { owner, modifiedLabel } = row.node

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground text-sm">{modifiedLabel}</span>
      <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
        <Avatar className="size-3.5 shrink-0">
          {owner.avatar ? <AvatarImage src={owner.avatar} alt="" /> : null}
          <AvatarFallback className="text-[8px]">
            {getInitials(owner.name)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{owner.name}</span>
      </span>
    </div>
  )
}

/** Sorting/hiding/resizing are uniform, so only the varying bits are passed. */
type ColSpec = Partial<ColumnDef<DataGridFeatures, DriveRow>> & {
  id: string
  headerTitle: string
}

function col(spec: ColSpec): ColumnDef<DataGridFeatures, DriveRow> {
  const { headerTitle, meta, ...rest } = spec
  return {
    header: ({ column }) => (
      <DataGridColumnHeader column={column} visibility={true} />
    ),
    enableSorting: true,
    enableHiding: true,
    enableResizing: false,
    ...rest,
    meta: { headerTitle, ...meta },
  } as ColumnDef<DataGridFeatures, DriveRow>
}

export function createDriveColumns({
  onOpen,
  onAction,
  onToggleStar,
  uploads,
}: {
  onOpen: (row: DriveRow) => void
  onAction: (action: string, row: DriveRow) => void
  onToggleStar: (row: DriveRow) => void
  /** Transfer state per node id. Absent ids are settled files and render plain. */
  uploads?: Record<
    string,
    { progress: number; status: "uploading" | "error" | "done" }
  >
}): ColumnDef<DataGridFeatures, DriveRow>[] {
  return [
    {
      id: "select",
      header: () => <DataGridTableRowSelectAll />,
      cell: ({ row }) => <DataGridTableRowSelect row={row} />,
      size: 32,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
    col({
      id: "name",
      headerTitle: "Name",
      accessorFn: (row) => row.node.name,
      cell: ({ row }) => (
        <DriveNameCell
          row={row.original}
          onOpen={onOpen}
          onToggleStar={onToggleStar}
          upload={uploads?.[row.original.node.id]}
        />
      ),
      size: 300,
      minSize: 140,
      enableHiding: false,
      // Name absorbs the free width, so long names ellipsize instead of
      // squeezing every other column.
      meta: { autoSize: true },
    }),
    col({
      id: "owner",
      headerTitle: "Owner",
      accessorFn: (row) => row.node.owner.name,
      cell: ({ row }) => <DriveOwnerCell row={row.original} />,
      size: 160,
    }),
    col({
      id: "type",
      headerTitle: "Type",
      accessorFn: (row) => row.node.typeLabel,
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal">
          {row.original.node.typeLabel}
        </Badge>
      ),
      size: 84,
      sortFn: (rowA, rowB) => {
        const delta =
          TYPE_RANK[rowA.original.node.kind] -
          TYPE_RANK[rowB.original.node.kind]
        return delta !== 0
          ? delta
          : rowA.original.node.typeLabel.localeCompare(
              rowB.original.node.typeLabel
            )
      },
    }),
    col({
      id: "size",
      headerTitle: "Size",
      accessorFn: (row) => row.sizeBytes,
      cell: ({ row }) => <DriveSizeCell row={row.original} />,
      size: 92,
      sortFn: "basic",
    }),
    col({
      id: "modified",
      headerTitle: "Modified",
      accessorFn: (row) => row.node.modifiedAt,
      cell: ({ row }) => <DriveModifiedCell row={row.original} />,
      size: 128,
      sortFn: "text",
    }),
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DriveActionsCell row={row.original} onAction={onAction} />
      ),
      size: 56,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
  ]
}