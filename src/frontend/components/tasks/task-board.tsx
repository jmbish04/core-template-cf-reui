/**
 * @fileoverview `/tasks/board` — the kanban board island.
 *
 * Adapted from the ReUI Pro block `kanban-board-1`, keeping the `Kanban`
 * primitive exactly as the block composes it: `value` is
 * `Record<columnId, Task[]>`, every `KanbanColumnContent value` matches its
 * parent `KanbanColumn value`, and `KanbanOverlay` stays (remove it and the
 * drag preview silently breaks).
 *
 * The block ships six invented columns; this uses the four real workflow
 * statuses from `BOARD_STATUSES`, and the board's own column drag handle is
 * dropped because the status set is fixed by the schema.
 *
 * Endpoints: `GET /api/tasks/board` (columns), `PATCH /api/tasks/{id}` with
 * `{ status, position }` on drop. The move is optimistic — the primitive has
 * already applied it by the time the commit fires — and a rejected PATCH puts
 * the previous board straight back with an inline error.
 */

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ListChecksIcon } from "lucide-react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import {
  Kanban,
  KanbanBoard as KanbanBoardPrimitive,
  KanbanOverlay,
} from "@/components/reui/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/shared";
import { BOARD_STATUSES, type TaskStatus } from "@/components/common/types";
import { ApiError, apiGet, apiSend } from "@/lib/api";

import { StatusColumn, TaskCard } from "./task-board-card";
import type { TaskRecord } from "./task-tree";

/** Board columns keyed by status id. Plain `string` keys, as the primitive requires. */
type BoardValue = Record<string, TaskRecord[]>;

/** Shape of `GET /api/tasks/board`. */
interface BoardResponseWire {
  columns: { status: TaskStatus; label: string; tasks: TaskRecord[] }[];
}

/** Empty board with every real status present, so a column never disappears. */
function emptyBoard(): BoardValue {
  const board: BoardValue = {};
  for (const status of BOARD_STATUSES) board[status] = [];
  return board;
}

function BoardScrollArea({ children }: { children: ReactNode }) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className="relative w-full min-w-0 pb-3">
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 w-full rounded-lg transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content" className="w-max min-w-full">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        data-slot="scroll-area-scrollbar"
        data-orientation="horizontal"
        orientation="horizontal"
        className="flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent"
      >
        <ScrollAreaPrimitive.Thumb
          data-slot="scroll-area-thumb"
          className="bg-foreground/15 relative flex-1 rounded-full"
        />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

/** The task board. One island; drag-and-drop writes straight through to D1. */
export function TaskBoard() {
  const [columns, setColumns] = useState<BoardValue>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<BoardResponseWire>("tasks/board")
      .then((res) => {
        if (cancelled) return;
        const next = emptyBoard();
        for (const column of res.columns) next[column.status] = column.tasks;
        setColumns(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load the board.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  /**
   * Persist a card's new column and index.
   *
   * The primitive has already moved the card in local state by the time this
   * runs, so the write is the optimistic half; `previousValue` is the rollback.
   */
  const handleCommit = useCallback<
    NonNullable<Parameters<typeof Kanban<TaskRecord>>[0]["onValueCommit"]>
  >((value, meta) => {
    if (meta.kind !== "item") return;

    const taskId = String(meta.event.active.id);
    const status = meta.overContainer as TaskStatus;
    if (!BOARD_STATUSES.includes(status)) return;

    setMoveError(null);
    // Keep the moved card's own status field in step with the column it now
    // sits in, so a later read of the card is not stale.
    setColumns(() => {
      const next: BoardValue = {};
      for (const [key, items] of Object.entries(value)) {
        next[key] = items.map((task) =>
          task.id === taskId ? { ...task, status, position: meta.overIndex } : task,
        );
      }
      return next;
    });

    apiSend("PATCH", `tasks/${taskId}`, { status, position: meta.overIndex }).catch((e) => {
      setColumns(meta.previousValue);
      setMoveError(
        e instanceof ApiError ? e.message : "Could not move the task. The board was restored.",
      );
    });
  }, []);

  const cardCount = Object.values(columns).reduce((sum, items) => sum + items.length, 0);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BOARD_STATUSES.map((status) => (
          <Skeleton key={status} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  }

  if (cardCount === 0) {
    return (
      <EmptyState
        icon={<ListChecksIcon />}
        title="Nothing on the board"
        description="Create a task, or seed the template's demo data with POST /api/seed."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {moveError ? <ErrorState message={moveError} /> : null}

      <Kanban
        value={columns}
        onValueChange={setColumns}
        onValueCommit={handleCommit}
        getItemValue={(item) => item.id}
        className="w-full"
      >
        <BoardScrollArea>
          <KanbanBoardPrimitive className="grid min-w-max auto-cols-[17.5rem] grid-flow-col grid-cols-none gap-3 px-1 pb-2">
            {BOARD_STATUSES.map((status) => (
              <StatusColumn key={status} value={status} tasks={columns[status] ?? []} />
            ))}
          </KanbanBoardPrimitive>
        </BoardScrollArea>

        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === "column") {
              const status = String(value) as TaskStatus;
              return <StatusColumn value={status} tasks={columns[status] ?? []} isOverlay />;
            }

            const entry = Object.entries(columns).find(([, items]) =>
              items.some((item) => item.id === value),
            );
            const task = entry?.[1].find((item) => item.id === value);
            if (!task) return null;

            return <TaskCard task={task} isOverlay isDone={entry?.[0] === "done"} />;
          }}
        </KanbanOverlay>
      </Kanban>
    </div>
  );
}
