/**
 * @fileoverview `/tasks` — the task tree grid island.
 *
 * Adapted from the ReUI Pro block `data-grid-grouping-4`, keeping all of its
 * tree machinery: recursive `subRows`, `DataGridTableRowExpand` depth
 * indentation, the depth-level control, rolled-up measures and a grand-total
 * footer. The bill-of-materials demo data is gone; every figure on screen is
 * derived from `GET /api/tasks`.
 *
 * Endpoints: `GET /api/tasks?limit=200` (the tree), `PATCH /api/tasks/{id}`
 * (status change from the row menu), `DELETE /api/tasks/{id}` (delete).
 * Projects come from the shared `useProjects` hook (`GET /api/projects`).
 *
 * Surface is `frame` — the block's own `Frame` / `FramePanel` shell is kept.
 */

"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { ListChecksIcon, SearchIcon, Settings2Icon, XIcon } from "lucide-react";
import {
  useTable,
  type ColumnVisibilityState,
  type ExpandedState,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/reui/badge";
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import {
  DataGridTable,
  DataGridTableFootRow,
  DataGridTableFootRowCell,
} from "@/components/reui/data-grid/data-grid-table";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { OptionSelect, FilterSelect } from "@/components/ui/option-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, ErrorState } from "@/components/common/shared";
import { useProjects } from "@/components/common/use-projects";
import type { ListEnvelope, TaskPriority, TaskStatus } from "@/components/common/types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  createTaskColumns,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type TaskRowAction,
} from "./task-tree-columns";
import {
  buildTaskRows,
  buildTaskTree,
  expandedSignature,
  filterTaskNodes,
  getFirstPathExpandedState,
  getLevelExpandedState,
  meanProgress,
  totalOverdue,
  totalTasks,
  type TaskRecord,
} from "./task-tree";

type TableDensity = "compact" | "comfortable";
type TaskColumnKey = "status" | "priority" | "assignee" | "subtasks" | "overdue" | "dueDate";

const DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
];

const DISPLAY_COLUMN_OPTIONS: { key: TaskColumnKey; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "subtasks", label: "Nested" },
  { key: "overdue", label: "Overdue" },
  { key: "dueDate", label: "Due" },
];

// "All" is a sentinel, not this tree's depth: the walk in getLevelExpandedState
// is bounded by the data, so a deeper task tree expands fully here with no
// change. Hard-coding the current depth would make a deeper match unreachable.
const EXPAND_ALL_LEVEL = Number.MAX_SAFE_INTEGER;

const DEPTH_OPTIONS: { level: number; label: string; description: string }[] = [
  { level: 0, label: "Collapse", description: "Collapse to top-level tasks" },
  { level: 1, label: "1", description: "Expand to level 1" },
  { level: 2, label: "2", description: "Expand to level 2" },
  { level: EXPAND_ALL_LEVEL, label: "All", description: "Expand all levels" },
];

/** One headline figure in the Frame header. */
function TreeMetric({
  label,
  value,
  variant = "outline",
}: {
  label: string;
  value: string;
  variant?: ComponentProps<typeof Badge>["variant"];
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:border-l sm:pl-3 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-muted-foreground truncate text-xs font-medium">{label}</span>
      <Badge variant={variant} className="tabular-nums">
        {value}
      </Badge>
    </div>
  );
}

/**
 * The task tree grid. Loads the flat task list once, nests it on `parentId`,
 * and resolves the rolled-up measures client-side.
 */
export function TaskTreeGrid() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | undefined>(undefined);
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);

  const [tableDensity, setTableDensity] = useState<TableDensity>("comfortable");
  const [showMeta, setShowMeta] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({
    status: true,
    priority: true,
    assignee: true,
    subtasks: true,
    overdue: true,
    dueDate: true,
  });
  // Unsorted by default: the API order IS the task structure, which is the fact
  // this surface exists to show. A sort reorders inside each parent.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});

  const { options: projectOptions, nameById } = useProjects();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ListEnvelope<TaskRecord>>("tasks", { limit: 200, sort: "position" })
      .then((res) => {
        if (!cancelled) setTasks(res.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load tasks.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isFiltered =
    normalizedQuery.length > 0 || Boolean(statusFilter || priorityFilter || projectFilter);
  const isDense = tableDensity === "compact";

  const allRows = useMemo(() => buildTaskRows(buildTaskTree(tasks)), [tasks]);

  const rows = useMemo(
    () =>
      buildTaskRows(
        filterTaskNodes(buildTaskTree(tasks), {
          query: normalizedQuery,
          status: statusFilter,
          priority: priorityFilter,
          projectId: projectFilter,
        }),
      ),
    [tasks, normalizedQuery, statusFilter, priorityFilter, projectFilter],
  );

  // Reset expansion whenever the filter changes, adjusting state during render
  // rather than in an effect. A filtered tree is pruned to matches plus their
  // ancestors, so every surviving branch opens and a deep match is never left
  // hidden behind a collapsed ancestor. `expandedRows` stays the table's only
  // source of truth, which is what keeps a hand toggle consistent.
  const filterKey = `${reloadToken}|${normalizedQuery}|${statusFilter ?? ""}|${priorityFilter ?? ""}|${projectFilter ?? ""}|${tasks.length}`;
  const [appliedFilterKey, setAppliedFilterKey] = useState("");

  if (appliedFilterKey !== filterKey) {
    setAppliedFilterKey(filterKey);
    setExpandedRows(
      isFiltered ? getLevelExpandedState(rows, EXPAND_ALL_LEVEL) : getFirstPathExpandedState(rows),
    );
  }

  const visibleTasks = totalTasks(rows);
  const visibleOverdue = totalOverdue(rows);
  const visibleProgress = meanProgress(rows);

  // Which depth preset the tree currently matches, or -1 after a hand toggle,
  // so the control never claims a state the tree is not in.
  const activeDepth = useMemo(() => {
    if (expandedRows === true) return EXPAND_ALL_LEVEL;
    const current = expandedSignature(expandedRows);
    const match = DEPTH_OPTIONS.find(
      (option) => expandedSignature(getLevelExpandedState(rows, option.level)) === current,
    );
    return match ? match.level : -1;
  }, [expandedRows, rows]);

  const handleDepthChange = useCallback(
    (values: unknown[]) => {
      const [next] = values;
      if (typeof next !== "string") return;
      setExpandedRows(getLevelExpandedState(rows, Number(next)));
    },
    [rows],
  );

  const handleAction = useCallback((action: TaskRowAction) => {
    if (action.kind === "open") {
      window.location.href = `/tasks/${action.row.task.id}`;
      return;
    }

    setActionError(null);

    if (action.kind === "status") {
      const { id } = action.row.task;
      const next = action.status;
      // Optimistic: the grid re-rolls its measures from the patched row, and a
      // rejected call puts the original status straight back.
      const previous = action.row.task.status;
      setTasks((current) =>
        current.map((t) => (t.id === id ? { ...t, status: next } : t)),
      );
      apiSend("PATCH", `tasks/${id}`, { status: next }).catch((e) => {
        setTasks((current) =>
          current.map((t) => (t.id === id ? { ...t, status: previous } : t)),
        );
        setActionError(
          e instanceof ApiError ? e.message : "Could not change the task's status.",
        );
      });
      return;
    }

    const { id } = action.row.task;
    const snapshot = action.row.task;
    setTasks((current) => current.filter((t) => t.id !== id));
    apiSend("DELETE", `tasks/${id}`).catch((e) => {
      setTasks((current) => [...current, snapshot]);
      setActionError(e instanceof ApiError ? e.message : "Could not delete the task.");
    });
  }, []);

  const columns = useMemo(
    () =>
      createTaskColumns({
        dense: isDense,
        showMeta,
        projectNameById: nameById,
        onAction: handleAction,
      }),
    [isDense, showMeta, nameById, handleAction],
  );

  const table = useTable({
    features: dataGridFeatures,
    // No pagination row model on v8, so every row renders. manualPagination is
    // v9's way to say the data is already the page.
    manualPagination: true,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.children,
    getRowCanExpand: (row) => Boolean(row.original.children?.length),
    state: { columnVisibility, expanded: expandedRows, sorting },
    onExpandedChange: setExpandedRows,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
  });

  function toggleColumn(key: TaskColumnKey, checked: boolean) {
    setColumnVisibility((current) => ({ ...current, [key]: checked }));
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter(undefined);
    setPriorityFilter(undefined);
    setProjectFilter(undefined);
  }

  // Grand-total footer: one cell per visible column so it tracks column toggles.
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const lastColumnIndex = visibleLeafColumns.length - 1;

  const footerContent =
    rows.length > 0 ? (
      <DataGridTableFootRow>
        {visibleLeafColumns.map((column, index) => {
          const edgeClassName = cn(
            index === 0 && "ps-3 lg:ps-4",
            index === lastColumnIndex && "pe-3 lg:pe-4",
          );

          if (column.id === "title") {
            return (
              <DataGridTableFootRowCell key={column.id} className={edgeClassName}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-foreground truncate text-sm font-semibold">
                    {isFiltered ? "Matching tasks" : "All tasks"}
                  </span>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {`${visibleTasks} tasks`}
                  </Badge>
                </div>
              </DataGridTableFootRowCell>
            );
          }

          if (column.id === "progress") {
            return (
              <DataGridTableFootRowCell
                key={column.id}
                className={cn("text-right!", edgeClassName)}
              >
                <span className="text-foreground text-sm font-semibold tabular-nums">
                  {`${visibleProgress}%`}
                </span>
              </DataGridTableFootRowCell>
            );
          }

          if (column.id === "overdue") {
            return (
              <DataGridTableFootRowCell
                key={column.id}
                className={cn("text-right!", edgeClassName)}
              >
                <span className="text-foreground text-sm font-semibold tabular-nums">
                  {visibleOverdue}
                </span>
              </DataGridTableFootRowCell>
            );
          }

          return <DataGridTableFootRowCell key={column.id} className={edgeClassName} />;
        })}
      </DataGridTableFootRow>
    ) : undefined;

  return (
    <DataGrid
      table={table}
      recordCount={visibleTasks}
      emptyMessage="No tasks match this view."
      tableLayout={{
        dense: isDense,
        rowBorder: true,
        footerBackground: true,
        columnsVisibility: true,
        columnsResizable: true,
        columnsMovable: true,
        width: "fixed",
      }}
      tableClassNames={{
        bodyRow: cn(
          isDense ? "[&>td]:h-9" : "[&>td]:h-11",
          showMeta && (isDense ? "[&>td]:h-12" : "[&>td]:h-14"),
        ),
        edgeCell: "first:ps-3 last:pe-3 lg:first:ps-4 lg:last:pe-4",
      }}
    >
      <Frame className="min-w-0">
        <FrameHeader className="flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col">
            <FrameTitle>Task tree</FrameTitle>
            <FrameDescription>
              Every task nested on its parent, with progress and overdue counts rolled up.
            </FrameDescription>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <TreeMetric label="Tasks" value={String(totalTasks(allRows))} />
            <TreeMetric label="Progress" value={`${meanProgress(allRows)}%`} />
            <TreeMetric
              label="Overdue"
              value={String(totalOverdue(allRows))}
              variant={totalOverdue(allRows) > 0 ? "warning-light" : "outline"}
            />
          </div>
        </FrameHeader>

        <FramePanel className="bg-card p-0! shadow-none!">
          <div className="flex flex-col gap-3 border-b px-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
            <InputGroup className="w-full min-w-0 lg:max-w-xs">
              <InputGroupAddon align="inline-start">
                <SearchIcon className="text-muted-foreground size-4" aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, assignee, label..."
                aria-label="Search tasks"
              />
              {searchQuery.length > 0 ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery("")}
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium">Depth</span>
                <ToggleGroup
                  multiple={false}
                  value={activeDepth < 0 ? [] : [String(activeDepth)]}
                  onValueChange={handleDepthChange}
                  variant="outline"
                  spacing={0}
                  aria-label="Tree depth"
                  className="shrink-0"
                >
                  {DEPTH_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.level}
                      value={String(option.level)}
                      aria-label={option.description}
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                allLabel="All statuses"
                ariaLabel="Filter by status"
              />
              <FilterSelect
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={PRIORITY_OPTIONS}
                allLabel="All priorities"
                ariaLabel="Filter by priority"
              />
              <FilterSelect
                value={projectFilter}
                onChange={setProjectFilter}
                options={projectOptions}
                allLabel="All projects"
                ariaLabel="Filter by project"
                className="w-[160px]"
              />

              <Popover>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline">
                      <Settings2Icon data-icon="inline-start" aria-hidden="true" />
                      Display
                    </Button>
                  }
                />
                <PopoverContent align="end" className="w-[300px] p-0">
                  <FieldGroup className="gap-3 px-3.5 py-3">
                    <div className="text-muted-foreground text-xs font-medium">Table</div>
                    <Field
                      orientation="horizontal"
                      className="min-h-9 items-center justify-between gap-3"
                    >
                      <FieldLabel className="text-sm font-normal">Density</FieldLabel>
                      <OptionSelect
                        value={tableDensity}
                        onChange={setTableDensity}
                        options={DENSITY_OPTIONS}
                        ariaLabel="Table density"
                      />
                    </Field>
                    <Field
                      orientation="horizontal"
                      className="min-h-9 items-center justify-between gap-3"
                    >
                      <FieldLabel htmlFor="task-meta" className="text-sm font-normal">
                        Project and labels
                      </FieldLabel>
                      <Switch id="task-meta" checked={showMeta} onCheckedChange={setShowMeta} />
                    </Field>

                    <div className="text-muted-foreground pt-1 text-xs font-medium">
                      Display properties
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DISPLAY_COLUMN_OPTIONS.map((option) => {
                        const active = columnVisibility[option.key] !== false;
                        return (
                          <Button
                            key={option.key}
                            type="button"
                            size="sm"
                            variant={active ? "secondary" : "outline"}
                            className={cn("rounded-full", active && "border-foreground/10")}
                            aria-pressed={active}
                            onClick={() => toggleColumn(option.key, !active)}
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                  </FieldGroup>
                </PopoverContent>
              </Popover>

              {isFiltered ? (
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={() => setReloadToken((n) => n + 1)} />
            </div>
          ) : null}
          {actionError ? (
            <div className="px-4 pt-4">
              <ErrorState message={actionError} />
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !error && tasks.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ListChecksIcon />}
                title="No tasks yet"
                description="Create a task, or seed the template's demo data with POST /api/seed."
              />
            </div>
          ) : (
            <DataGridContainer>
              <DataGridScrollArea>
                <DataGridTable footerContent={footerContent} />
              </DataGridScrollArea>
            </DataGridContainer>
          )}
        </FramePanel>
      </Frame>
    </DataGrid>
  );
}
