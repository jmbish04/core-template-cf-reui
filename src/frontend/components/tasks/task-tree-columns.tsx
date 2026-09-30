/**
 * @fileoverview Column definitions for the `/tasks` tree grid.
 *
 * Ported from the ReUI `data-grid-grouping-4` block's `columns.tsx`: the Title
 * column keeps `DataGridTableRowExpand` plus the leaf spacer that pads a leaf
 * out to the toggle width, so a task and a parent at the same depth share one
 * label spine. Everything else is real task data — the rolled-up columns read
 * the resolved `TaskRow`, never a recomputed subtotal.
 */

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  EyeIcon,
  FolderIcon,
  ListTreeIcon,
  MoreHorizontalIcon,
  SquareCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ColumnDef, Row, SortFn } from "@tanstack/react-table";

import { Badge } from "@/components/reui/badge";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridTableRowExpand } from "@/components/reui/data-grid/data-grid-table";
import { IconTile } from "@/components/reui/icon-tile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssigneeAvatar } from "@/components/common/shared";
import { PriorityBadge } from "@/components/common/priority-badge";
import { TaskStatusBadge } from "@/components/common/status-badge";
import {
  BOARD_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/components/common/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { isOverdue, type TaskRow } from "./task-tree";

/** Actions the row menu can raise to the grid. */
export type TaskRowAction =
  | { kind: "open"; row: TaskRow }
  | { kind: "status"; row: TaskRow; status: TaskStatus }
  | { kind: "delete"; row: TaskRow };

/** Ordered by workflow position, so sorting walks todo → done, not the alphabet. */
const STATUS_ORDER: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 1,
  in_review: 2,
  done: 3,
};

/** Ordered by urgency, so descending puts `urgent` first rather than `medium`. */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

const sortByStatus: SortFn<DataGridFeatures, TaskRow> = (a, b) =>
  STATUS_ORDER[a.original.task.status] - STATUS_ORDER[b.original.task.status];

const sortByPriority: SortFn<DataGridFeatures, TaskRow> = (a, b) =>
  PRIORITY_ORDER[a.original.task.priority] - PRIORITY_ORDER[b.original.task.priority];

/** Depth indent per tree level, in px — the primitive's own default. */
const TREE_INDENT = 20;

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function TitleCell({
  row,
  dense,
  projectName,
  showMeta,
}: {
  row: Row<DataGridFeatures, TaskRow>;
  dense: boolean;
  projectName?: string;
  showMeta: boolean;
}) {
  const { task, subtaskCount } = row.original;
  const isBranch = row.getCanExpand();

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex shrink-0 items-center">
        <DataGridTableRowExpand row={row} indent={TREE_INDENT} />
        {/* Pads a leaf out to the toggle width so a task and a parent at the
            same depth share one label spine. The toggle is size-7, or size-6
            once the grid is dense, so these widths track the density switch. */}
        {isBranch ? null : (
          <span aria-hidden="true" className={cn("shrink-0", dense ? "w-4" : "w-5")} />
        )}
      </span>

      <IconTile
        variant={isBranch ? "elevated" : "outline"}
        size="xs"
        aria-hidden="true"
        className="text-muted-foreground shrink-0"
      >
        {isBranch ? <ListTreeIcon /> : <SquareCheckIcon />}
      </IconTile>

      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <a
            href={`/tasks/${task.id}`}
            className={cn(
              "group/task-title hover:text-primary text-foreground flex min-w-0 items-center gap-1 truncate text-sm transition-colors",
              isBranch ? "font-semibold" : "font-medium",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          >
            <span className="truncate">{task.title}</span>
            <ArrowRightIcon
              className="size-3 shrink-0 -translate-x-1 opacity-0 transition-all group-hover/task-title:translate-x-0 group-hover/task-title:opacity-100"
              aria-hidden="true"
            />
          </a>
          {isBranch && subtaskCount > 0 ? (
            <Badge variant="outline" className="shrink-0 tabular-nums">
              {`${subtaskCount} nested`}
            </Badge>
          ) : null}
        </span>
        {showMeta ? (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            {projectName ? (
              <>
                <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{projectName}</span>
              </>
            ) : (
              <span className="truncate">No project</span>
            )}
            {task.labels?.length ? (
              <>
                <span
                  aria-hidden="true"
                  className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
                />
                <span className="truncate">{task.labels.join(", ")}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Right-aligned numeric slot shared by branch and leaf rows. */
function NumericSlot({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex w-full items-center justify-end", className)}>{children}</div>
  );
}

// Ring geometry is the block's cell-scale donut: r=9 inside a 24 viewBox paints
// a ~2px band that stays legible in an h-11 row and a dense h-9 one alike.
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Progress donut. On a branch the value is the subtree mean, so a collapsed
 * parent reports the state of everything under it rather than its own number.
 */
function ProgressCell({ value, emphasis }: { value: number; emphasis: boolean }) {
  const share = Math.max(0, Math.min(100, value));

  return (
    <NumericSlot className="gap-2">
      <svg
        viewBox="0 0 24 24"
        className="text-primary size-5 shrink-0"
        role="img"
        aria-label={`${share}% complete`}
      >
        <circle cx="12" cy="12" r={RING_RADIUS} fill="none" className="stroke-muted" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          className="stroke-current"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE - (share / 100) * RING_CIRCUMFERENCE}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span
        className={cn(
          "text-foreground text-sm tabular-nums",
          emphasis ? "font-semibold" : "font-medium",
        )}
      >
        {`${share}%`}
      </span>
    </NumericSlot>
  );
}

function DueCell({ row }: { row: TaskRow }) {
  const { task } = row;
  if (!task.dueDate) {
    return (
      <NumericSlot>
        <span className="text-muted-foreground text-sm">--</span>
      </NumericSlot>
    );
  }
  const late = isOverdue(task);
  return (
    <NumericSlot>
      <Badge
        variant={late ? "destructive-light" : "outline"}
        className={cn("gap-1.5", !late && "bg-background")}
      >
        <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
        <span className="tabular-nums">{shortDate(task.dueDate)}</span>
      </Badge>
    </NumericSlot>
  );
}

function TaskActionsCell({
  row,
  onAction,
}: {
  row: TaskRow;
  onAction: (action: TaskRowAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Actions for ${row.task.title}`}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onAction({ kind: "open", row })}>
            <EyeIcon aria-hidden="true" />
            Open task
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {BOARD_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={status === row.task.status}
              onClick={() => onAction({ kind: "status", row, status })}
            >
              <ClipboardListIcon aria-hidden="true" />
              {STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-variant="destructive"
          onClick={() => onAction({ kind: "delete", row })}
        >
          <Trash2Icon aria-hidden="true" />
          Delete task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

/**
 * Build the tree grid's columns.
 *
 * @param opts.dense Whether the grid is in compact density (sizes the leaf spacer).
 * @param opts.showMeta Whether the title cell shows the project + label sub-line.
 * @param opts.projectNameById Lookup turning a `projectId` into a display name.
 * @param opts.onAction Raised by the row menu; the view performs the real call.
 * @returns Column definitions for `useTable`.
 */
export function createTaskColumns({
  dense,
  showMeta,
  projectNameById,
  onAction,
}: {
  dense: boolean;
  showMeta: boolean;
  projectNameById: Map<string, string>;
  onAction: (action: TaskRowAction) => void;
}): ColumnDef<DataGridFeatures, TaskRow>[] {
  return [
    {
      accessorFn: (row) => row.task.title,
      id: "title",
      header: ({ column }) => <DataGridColumnHeader title="Task" column={column} visibility />,
      cell: ({ row }) => (
        <TitleCell
          row={row}
          dense={dense}
          showMeta={showMeta}
          projectName={
            row.original.task.projectId
              ? projectNameById.get(row.original.task.projectId)
              : undefined
          }
        />
      ),
      enableHiding: false,
      sortFn: "text",
      enableSorting: true,
      minSize: 300,
      meta: { headerTitle: "Task", autoSize: true },
    },
    {
      accessorFn: (row) => row.task.status,
      id: "status",
      header: ({ column }) => <DataGridColumnHeader title="Status" column={column} visibility />,
      cell: ({ row }) => <TaskStatusBadge status={row.original.task.status} />,
      size: 130,
      sortFn: sortByStatus,
      enableSorting: true,
      meta: { headerTitle: "Status" },
    },
    {
      accessorFn: (row) => row.task.priority,
      id: "priority",
      header: ({ column }) => <DataGridColumnHeader title="Priority" column={column} visibility />,
      cell: ({ row }) => <PriorityBadge priority={row.original.task.priority} />,
      size: 112,
      sortFn: sortByPriority,
      enableSorting: true,
      meta: { headerTitle: "Priority" },
    },
    {
      accessorFn: (row) => row.task.assignee ?? "",
      id: "assignee",
      header: ({ column }) => <DataGridColumnHeader title="Assignee" column={column} visibility />,
      cell: ({ row }) => (
        <AssigneeAvatar name={row.original.task.assignee} showName className="min-w-0" />
      ),
      size: 170,
      sortFn: "text",
      enableSorting: true,
      meta: { headerTitle: "Assignee" },
    },
    {
      accessorFn: (row) => row.rollupProgress,
      id: "progress",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Progress"
          column={column}
          visibility
          className="w-full justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <ProgressCell value={row.original.rollupProgress} emphasis={row.getCanExpand()} />
      ),
      size: 128,
      sortFn: "basic",
      enableSorting: true,
      meta: {
        headerTitle: "Progress",
        headerClassName: "text-right!",
        cellClassName: "text-right!",
      },
    },
    {
      accessorFn: (row) => row.subtaskCount,
      id: "subtasks",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Nested"
          column={column}
          visibility
          className="w-full justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <NumericSlot>
          <span
            className={cn(
              "text-sm tabular-nums",
              row.original.subtaskCount > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {row.original.subtaskCount || "--"}
          </span>
        </NumericSlot>
      ),
      size: 96,
      sortFn: "basic",
      enableSorting: true,
      meta: {
        headerTitle: "Nested",
        headerClassName: "text-right!",
        cellClassName: "text-right!",
      },
    },
    {
      accessorFn: (row) => row.overdueCount,
      id: "overdue",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Overdue"
          column={column}
          visibility
          className="w-full justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <NumericSlot>
          {row.original.overdueCount > 0 ? (
            <Badge variant="warning-light" className="gap-1.5 tabular-nums">
              <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
              {row.original.overdueCount}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">--</span>
          )}
        </NumericSlot>
      ),
      size: 108,
      sortFn: "basic",
      enableSorting: true,
      meta: {
        headerTitle: "Overdue",
        headerClassName: "text-right!",
        cellClassName: "text-right!",
      },
    },
    {
      accessorFn: (row) => row.task.dueDate ?? 0,
      id: "dueDate",
      header: ({ column }) => (
        <DataGridColumnHeader
          title="Due"
          column={column}
          visibility
          className="w-full justify-end text-right"
        />
      ),
      cell: ({ row }) => <DueCell row={row.original} />,
      size: 124,
      sortFn: "basic",
      enableSorting: true,
      meta: { headerTitle: "Due", headerClassName: "text-right!" },
    },
    {
      // Control column: the row menu is the whole cell, so it is never sorted
      // or hidden and carries no header menu of its own.
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <TaskActionsCell row={row.original} onAction={onAction} />
        </div>
      ),
      size: 56,
      enableHiding: false,
      enableSorting: false,
    },
  ];
}

/** Filter options for the toolbar's status / priority selects. */
export const STATUS_OPTIONS = BOARD_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

/** Filter options for the toolbar's priority select, ordered low → urgent. */
export const PRIORITY_OPTIONS = (["low", "medium", "high", "urgent"] as const).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
