/**
 * @fileoverview `/tasks/[id]` — the task detail island.
 *
 * Endpoints: `GET|PATCH /api/tasks/{id}`, `GET /api/tasks/{id}/ancestors`
 * (breadcrumbs), plus the three sub-resource panels in `task-detail-panels`.
 *
 * Built from primitives already installed — `Frame`, `Badge`, `Item`, `Tabs`,
 * `Avatar`, `Field` — rather than hand-rolled styled boxes.
 *
 * `progress` is the one read-only field: it is derived server-side from the
 * checklist, so it is displayed and refreshed after a subtask change rather
 * than edited here.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ListChecksIcon } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AssigneeAvatar, EmptyState, ErrorState, LabelChips } from "@/components/common/shared";
import { PriorityBadge } from "@/components/common/priority-badge";
import { TaskStatusBadge } from "@/components/common/status-badge";
import { useProjects } from "@/components/common/use-projects";
import type { TaskPriority, TaskStatus } from "@/components/common/types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { shortDate } from "@/lib/format";

import { AttachmentsPanel, CommentsPanel, SubtasksPanel } from "./task-detail-panels";
import { isOverdue, type TaskRecord } from "./task-tree";
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "./task-tree-columns";

/** One breadcrumb hop from `GET /api/tasks/{id}/ancestors`. */
interface Ancestor {
  id: string;
  title: string;
}

/** Fields this view can PATCH. `dueDate` goes over the wire as ISO, or null to clear. */
type TaskPatch = Partial<
  Pick<TaskRecord, "title" | "description" | "status" | "priority" | "assignee">
> & { dueDate?: string | null };

/**
 * Render a stored due date as the local `yyyy-MM-dd` an `<input type="date">`
 * wants. Built from the local calendar fields rather than `toISOString()`,
 * which would shift the date by a day for anyone west of UTC.
 *
 * @param value The task's `dueDate` as the API serialized it.
 * @returns A `yyyy-MM-dd` string, or `""` when there is no usable date.
 */
function toDateInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Turn the date input's `yyyy-MM-dd` back into what the API accepts.
 *
 * The `T00:00:00` suffix (no `Z`) makes the parse LOCAL midnight, so the day
 * the user picked is the day that gets stored.
 *
 * @param value Raw `<input type="date">` value; `""` means "clear the date".
 * @returns An ISO string, `null` to clear, or `undefined` when unparseable.
 */
function fromDateInputValue(value: string): string | null | undefined {
  if (value === "") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Task detail view.
 *
 * @param taskId Id from the `[id]` route param.
 */
export function TaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [ancestors, setAncestors] = useState<Ancestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");

  const { nameById } = useProjects();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<TaskRecord>(`tasks/${taskId}`),
      apiGet<{ data: Ancestor[] }>(`tasks/${taskId}/ancestors`).catch(() => ({ data: [] })),
    ])
      .then(([row, chain]) => {
        if (cancelled) return;
        setTask(row);
        setAncestors(chain.data);
        setTitleDraft(row.title);
        setDescriptionDraft(row.description ?? "");
        setAssigneeDraft(row.assignee ?? "");
        setDueDateDraft(toDateInputValue(row.dueDate));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load the task.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadToken]);

  /** PATCH a partial change and fold the server's row back into state. */
  const patch = useCallback(
    async (body: TaskPatch) => {
      setSaveError(null);
      try {
        const updated = await apiSend<TaskRecord>("PATCH", `tasks/${taskId}`, body);
        setTask(updated);
        if ("dueDate" in body) setDueDateDraft(toDateInputValue(updated.dueDate));
      } catch (e) {
        setSaveError(e instanceof ApiError ? e.message : "Could not save the change.");
      }
    },
    [taskId],
  );

  /** Re-read the task after the checklist moved its server-derived progress. */
  const refreshTask = useCallback(() => {
    apiGet<TaskRecord>(`tasks/${taskId}`)
      .then(setTask)
      .catch(() => {
        /* the panel already surfaced its own error; the header simply stays put */
      });
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  }

  if (!task) {
    return (
      <EmptyState
        icon={<ListChecksIcon />}
        title="Task not found"
        description="It may have been deleted."
      />
    );
  }

  const projectName = task.projectId ? nameById.get(task.projectId) : undefined;
  const late = isOverdue(task);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/tasks">Tasks</BreadcrumbLink>
          </BreadcrumbItem>
          {ancestors.map((ancestor) => (
            <BreadcrumbItem key={ancestor.id}>
              <BreadcrumbSeparator />
              <BreadcrumbLink href={`/tasks/${ancestor.id}`}>{ancestor.title}</BreadcrumbLink>
            </BreadcrumbItem>
          ))}
          <BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage className="truncate">{task.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {saveError ? <ErrorState message={saveError} /> : null}

      <Frame className="min-w-0">
        <FrameHeader className="flex-col items-start gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {projectName ? <Badge variant="outline">{projectName}</Badge> : null}
            {task.dueDate ? (
              <Badge variant={late ? "destructive-light" : "outline"} className="tabular-nums">
                {`Due ${shortDate(task.dueDate)}`}
              </Badge>
            ) : null}
            <LabelChips labels={task.labels ?? []} max={4} />
          </div>
          <div className="flex w-full min-w-0 flex-col gap-1">
            <FrameTitle className="sr-only">Task</FrameTitle>
            <Input
              value={titleDraft}
              aria-label="Task title"
              className="h-auto border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const next = titleDraft.trim();
                if (next && next !== task.title) void patch({ title: next });
              }}
            />
            <FrameDescription>
              {`Updated ${shortDate(task.updatedAt)}`}
            </FrameDescription>
          </div>
        </FrameHeader>

        <FramePanel className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel>Status</FieldLabel>
              <OptionSelect
                value={task.status}
                options={STATUS_OPTIONS}
                ariaLabel="Task status"
                className="w-full"
                onChange={(status: TaskStatus) => void patch({ status })}
              />
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <OptionSelect
                value={task.priority}
                options={PRIORITY_OPTIONS}
                ariaLabel="Task priority"
                className="w-full"
                onChange={(priority: TaskPriority) => void patch({ priority })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-assignee">Assignee</FieldLabel>
              <div className="flex items-center gap-2">
                <AssigneeAvatar name={task.assignee} />
                <Input
                  id="task-assignee"
                  value={assigneeDraft}
                  placeholder="Unassigned"
                  onChange={(event) => setAssigneeDraft(event.target.value)}
                  onBlur={() => {
                    const next = assigneeDraft.trim();
                    if (next !== (task.assignee ?? "")) void patch({ assignee: next || null });
                  }}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-due">Due date</FieldLabel>
              {/* Native date input: the platform's own picker, keyboard entry
                  and locale display, with no dependency behind it. Committed on
                  blur like the other text fields, because a half-typed date
                  reads as an empty value and would otherwise clear the column
                  mid-keystroke. */}
              <Input
                id="task-due"
                type="date"
                value={dueDateDraft}
                aria-label="Due date"
                aria-invalid={
                  dueDateDraft !== "" && fromDateInputValue(dueDateDraft) === undefined
                }
                onChange={(event) => setDueDateDraft(event.target.value)}
                onBlur={() => {
                  if (dueDateDraft === toDateInputValue(task.dueDate)) return;
                  const next = fromDateInputValue(dueDateDraft);
                  if (next === undefined) {
                    setSaveError("Enter a real date, or clear the field to remove the due date.");
                    return;
                  }
                  void patch({ dueDate: next });
                }}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="task-progress">
              {`Progress — ${task.progress}%`}
            </FieldLabel>
            <Progress id="task-progress" value={task.progress}>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </Field>

          <Field>
            <FieldLabel htmlFor="task-description">Description</FieldLabel>
            <Textarea
              id="task-description"
              rows={5}
              value={descriptionDraft}
              placeholder="Describe the work..."
              onChange={(event) => setDescriptionDraft(event.target.value)}
              onBlur={() => {
                if (descriptionDraft !== (task.description ?? "")) {
                  void patch({ description: descriptionDraft || null });
                }
              }}
            />
          </Field>
        </FramePanel>
      </Frame>

      <Frame className="min-w-0">
        <FramePanel>
          <Tabs defaultValue="subtasks">
            <TabsList>
              <TabsTrigger value="subtasks">Checklist</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
            </TabsList>
            <TabsContent value="subtasks" className="pt-4">
              <SubtasksPanel taskId={taskId} onProgressChange={refreshTask} />
            </TabsContent>
            <TabsContent value="comments" className="pt-4">
              <CommentsPanel taskId={taskId} />
            </TabsContent>
            <TabsContent value="attachments" className="pt-4">
              <AttachmentsPanel taskId={taskId} />
            </TabsContent>
          </Tabs>
        </FramePanel>
      </Frame>
    </div>
  );
}
