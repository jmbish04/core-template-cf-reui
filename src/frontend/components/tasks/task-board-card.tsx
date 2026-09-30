/**
 * @fileoverview Board card and status column for `/tasks/board`.
 *
 * Adapted from the ReUI Pro block `kanban-board-1`: the completion ring,
 * priority marker, owner avatar and due badge are the block's, driven here by
 * the real `progress`, `priority`, `assignee` and `dueDate` columns.
 *
 * Two of the block's decorations are gone rather than faked: its per-card
 * "signal" chip (Blocked / At risk / On track) and its human task key have no
 * backing column in the `tasks` table.
 *
 * Surface is `card` — the block's own surface. No `Frame` is mixed in.
 */

import type { ComponentProps } from "react";
import { ArrowRightIcon, CalendarDaysIcon } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import {
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
} from "@/components/reui/kanban";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { PriorityBadge } from "@/components/common/priority-badge";
import { TASK_STATUS_DOT } from "@/components/common/status-badge";
import { initials, STATUS_LABELS, type TaskStatus } from "@/components/common/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { isOverdue, type TaskRecord } from "./task-tree";

/** Per-column surface tint. Tokens only — the same language as the status dots. */
export const COLUMN_SURFACE: Record<TaskStatus, { surface: string; border: string }> = {
  todo: { surface: "bg-muted/25 dark:bg-muted/10", border: "border-border" },
  in_progress: {
    surface: "bg-info/[0.045] dark:bg-info/10",
    border: "border-info/20 dark:border-info/25",
  },
  in_review: {
    surface: "bg-primary/[0.045] dark:bg-primary/10",
    border: "border-primary/20 dark:border-primary/25",
  },
  done: {
    surface: "bg-success/[0.045] dark:bg-success/10",
    border: "border-success/20 dark:border-success/25",
  },
};

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Completion ring driven by the task's real `progress` column. */
function CompletionRing({ rate }: { rate: number }) {
  const share = Math.max(0, Math.min(100, rate));
  return (
    <span className="flex items-center gap-1.5" aria-label={`${share}% complete`}>
      <svg viewBox="0 0 24 24" className="text-primary size-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r={RING_RADIUS} fill="none" className="stroke-border" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          className="stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE - (share / 100) * RING_CIRCUMFERENCE}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span className="text-foreground text-xs tabular-nums">{`${share}%`}</span>
    </span>
  );
}

function DueBadge({ task }: { task: TaskRecord }) {
  if (!task.dueDate) return null;
  const late = isOverdue(task);
  return (
    <Badge
      variant={late ? "destructive-light" : "outline"}
      className={cn("gap-1.5 font-normal", !late && "bg-background")}
    >
      <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{shortDate(task.dueDate)}</span>
    </Badge>
  );
}

interface TaskCardProps
  extends Omit<ComponentProps<typeof KanbanItem>, "value" | "children"> {
  task: TaskRecord;
  asHandle?: boolean;
  isOverlay?: boolean;
  isDone?: boolean;
}

/**
 * One draggable task card.
 *
 * @param task The task this card represents.
 * @param asHandle Wrap the card in a drag handle (off for the overlay clone).
 * @param isOverlay Whether this is the drag preview rendered by `KanbanOverlay`.
 * @param isDone Whether the card sits in the Done column.
 */
export function TaskCard({ task, asHandle, isOverlay, isDone, ...props }: TaskCardProps) {
  const card = (
    <Card
      size="sm"
      className={cn(
        "bg-card hover:border-foreground/20 p-0 shadow-xs transition-[border-color,box-shadow] hover:shadow-sm",
        isOverlay && "shadow-lg",
        isDone && "bg-muted/40",
      )}
    >
      <CardContent className="flex min-h-[8.75rem] flex-col p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-1.5 shrink-0 rounded-full", TASK_STATUS_DOT[task.status])}
            />
            <PriorityBadge priority={task.priority} />
          </div>
          {task.labels?.length ? (
            <Badge variant="secondary" className="shrink-0 font-normal">
              {task.labels[0]}
              {task.labels.length > 1 ? ` +${task.labels.length - 1}` : ""}
            </Badge>
          ) : null}
        </div>

        <h3 className="mt-3 min-h-10 text-sm leading-5 font-medium">
          <a
            href={`/tasks/${task.id}`}
            className="group/task-title inline-flex max-w-full min-w-0 items-start gap-1"
          >
            <span
              className={cn(
                "hover:text-primary line-clamp-2 transition-colors",
                isDone && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            <ArrowRightIcon
              className="mt-1 size-3 shrink-0 -translate-x-1 opacity-0 transition-all group-hover/task-title:translate-x-0 group-hover/task-title:opacity-100"
              aria-hidden="true"
            />
          </a>
        </h3>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials(task.assignee)}</AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground truncate text-xs font-medium">
              {task.assignee ?? "Unassigned"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <DueBadge task={task} />
            <CompletionRing rate={task.progress} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <KanbanItem value={task.id} {...props}>
      {asHandle && !isOverlay ? (
        <KanbanItemHandle className="block">{card}</KanbanItemHandle>
      ) : (
        card
      )}
    </KanbanItem>
  );
}

interface StatusColumnProps
  extends Omit<ComponentProps<typeof KanbanColumn>, "children" | "value"> {
  value: TaskStatus;
  tasks: TaskRecord[];
  isOverlay?: boolean;
}

/**
 * One board column. `KanbanColumnContent`'s `value` must match its parent
 * `KanbanColumn`'s, or drops silently land nowhere.
 *
 * @param value The `TaskStatus` this column represents (also the column id).
 * @param tasks Cards currently in the column.
 * @param isOverlay Whether this is the drag preview clone.
 */
export function StatusColumn({ value, tasks, isOverlay, ...props }: StatusColumnProps) {
  const tint = COLUMN_SURFACE[value];
  const isDone = value === "done";

  return (
    <KanbanColumn value={value} className="w-[17.5rem] min-w-[17.5rem]" {...props}>
      <section
        className={cn(
          "flex min-h-[16rem] flex-col gap-2 rounded-lg border p-2.5 transition-colors",
          tint.surface,
          tint.border,
          isOverlay && "shadow-lg",
        )}
        aria-label={`${STATUS_LABELS[value]} tasks`}
      >
        <div className="flex h-8 items-center gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("size-1.5 shrink-0 rounded-full", TASK_STATUS_DOT[value])}
            />
            <h3 className="truncate text-sm font-semibold">{STATUS_LABELS[value]}</h3>
            <Badge variant="outline" className="bg-background">
              {tasks.length}
            </Badge>
          </div>
        </div>

        <KanbanColumnContent value={value} className="min-h-28 gap-2">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                asHandle={!isOverlay}
                isOverlay={isOverlay}
                isDone={isDone}
              />
            ))
          ) : (
            <div className="border-border/70 text-muted-foreground bg-background/55 rounded-lg border border-dashed px-3 py-6 text-center text-xs">
              No cards
            </div>
          )}
        </KanbanColumnContent>
      </section>
    </KanbanColumn>
  );
}
