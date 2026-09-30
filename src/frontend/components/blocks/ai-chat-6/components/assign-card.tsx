/**
 * @fileoverview What happens to a finished run: a real ticket, and the run's
 * output in the thread's draft.
 *
 * ReUI `ai-chat-6` ends with a handoff card whose "Create task" flips a
 * boolean and whose artifacts download nothing. Both actions here are writes:
 * the ticket is `POST /api/tasks` (the row appears on `/tasks`), and the
 * append is `POST /api/threads/{id}/document/append`, which is the same
 * `chat_documents` row the canvas beside the panel is editing.
 */
import { useEffect, useState } from "react";

import { OptionSelect } from "@/components/ui/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api";
import { appendToDocument } from "@/lib/chat";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";

import type { RunStep } from "./run-engine";

type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

/** The ticket body: the plan and what each step produced. */
function describeRun(steps: RunStep[]): string {
  return steps
    .map((step, index) => `${index + 1}. ${step.title}\n${step.output || step.error || "Not run."}`)
    .join("\n\n");
}

export interface AssignCardProps {
  goal: string;
  steps: RunStep[];
  threadId: string | undefined;
  /** Re-read the canvas document after an append. */
  onDocumentChanged: () => void;
}

/**
 * The end of a run: file it, or put it in the draft.
 *
 * @param props The run's goal and settled steps, plus the thread to append to.
 * @returns The assign card.
 */
export function AssignCard({ goal, steps, threadId, onDocumentChanged }: AssignCardProps) {
  const [title, setTitle] = useState(goal);
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState<string>("none");
  const [projects, setProjects] = useState<Array<{ value: string; label: string }>>([]);
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [appended, setAppended] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTitle(goal), [goal]);

  useEffect(() => {
    void apiGet<{ data: Array<{ id: string; name: string }> }>("projects", { limit: 50 })
      .then((res) => setProjects(res.data.map((row) => ({ value: row.id, label: row.name }))))
      // A missing project list is not a reason to block filing the ticket;
      // the select simply offers "No project" alone.
      .catch(() => setProjects([]));
  }, []);

  async function createTask() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const task = await apiSend<{ id: string }>("POST", "tasks", {
        title: title.trim(),
        description: describeRun(steps),
        status: "todo",
        priority,
        projectId: projectId === "none" ? null : projectId,
        labels: ["agentic-run"],
      });
      setCreated(task);
    } catch {
      setError("Could not create the task. Nothing was filed.");
    } finally {
      setBusy(false);
    }
  }

  async function appendDraft() {
    if (!threadId) return;
    setBusy(true);
    setError(null);
    try {
      await appendToDocument(threadId, `${goal}\n\n${describeRun(steps)}`);
      setAppended(true);
      onDocumentChanged();
    } catch {
      setError("Could not write to the draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Assign the result" className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-medium">Assign the result</h2>

      <Input
        value={title}
        aria-label="Ticket title"
        placeholder="Ticket title"
        onChange={(event) => setTitle(event.target.value)}
        className="h-8"
      />

      <div className="flex flex-wrap items-center gap-2">
        <OptionSelect<Priority>
          value={priority}
          onChange={setPriority}
          ariaLabel="Ticket priority"
          options={PRIORITIES}
          className="w-[116px]"
        />
        <OptionSelect<string>
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Ticket project"
          options={[{ value: "none", label: "No project" }, ...projects]}
          className="w-[168px]"
        />

        {created ? (
          <a
            href={`/tasks/${created.id}`}
            className="text-primary ms-auto inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
          >
            <CheckIcon className="size-3.5" aria-hidden="true" />
            Ticket filed
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <Button type="button" size="sm" disabled={busy || !title.trim()} onClick={() => void createTask()} className="ms-auto">
            File as a ticket
          </Button>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !threadId || appended}
        onClick={() => void appendDraft()}
      >
        {appended ? "Added to the draft" : "Add the run to the draft"}
      </Button>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </section>
  );
}
