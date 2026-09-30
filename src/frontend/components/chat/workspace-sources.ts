/**
 * @fileoverview The six data sources this workspace actually has, and how a
 * chat turn reads them.
 *
 * ReUI `ai-chat-5` ships a source strip of Google Drive, Slack, Dropbox and
 * Zoom logos. None of those integrations exist here, and a toggle that grants
 * nothing is the dishonest kind of decoration. These six are the workspace's
 * own REST collections, each of which this module can genuinely fetch:
 *
 *   drive → /api/files · tasks → /api/tasks · projects → /api/projects
 *   notes → /api/team-notes · inbox → /api/inbox · activity → /api/activity
 *
 * Toggling one on fetches a BOUNDED summary (a handful of rows, one line
 * each) and that text goes into the turn's `systemPrompt`. Toggling it off
 * means the model genuinely does not receive it. `describeRead` is the only
 * place the receipt wording lives, so the strip, the prompt and the receipt
 * can never disagree about what was read.
 *
 * Also used by `/chat/agentic` (ai-chat-6), which confirms the same scope
 * before it runs a plan.
 */
import {
  FolderKanbanIcon,
  HardDriveIcon,
  HistoryIcon,
  InboxIcon,
  ListChecksIcon,
  NotebookPenIcon,
  type LucideIcon,
} from "lucide-react";

import { apiGet } from "@/lib/api";

/** Rows per source. Enough to be useful, small enough to stay in one prompt. */
const ROW_LIMIT = 10;
/** Hard ceiling per line, so one enormous row cannot swallow the context. */
const LINE_MAX = 200;

export type SourceId = "drive" | "tasks" | "projects" | "notes" | "inbox" | "activity";

/** What one source contributed to a turn. */
export interface SourceSummary {
  /** One line per row, already truncated. */
  lines: string[];
  /** Rows the collection reports in total, when the endpoint says so. */
  total: number | null;
}

export interface WorkspaceSource {
  id: SourceId;
  label: string;
  icon: LucideIcon;
  /** What switching it on actually grants, spoken before the click. */
  scope: string;
  /** Fetch the bounded summary. Throws through to the caller on failure. */
  read: () => Promise<SourceSummary>;
}

const clip = (text: string) => (text.length > LINE_MAX ? `${text.slice(0, LINE_MAX - 1)}…` : text);

/** Team-note bodies are a `{v,format:"plate",value}` envelope; flatten to text. */
function noteText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { value?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.value)) return body;
    return parsed.value
      .flatMap((node) => ((node.children as Array<{ text?: string }>) ?? []).map((c) => c.text ?? ""))
      .join(" ")
      .trim();
  } catch {
    // A legacy note is stored as plain text, which is already what we want.
    return body;
  }
}

/** Wire rows, narrowed to the fields the summary lines use. */
interface FileRow { name: string; kind: "file" | "folder"; size: number | null }
interface TaskRow { title: string; status: string; priority: string; assignee: string | null }
interface ProjectRow { name: string; status: string; taskCount: number }
interface NoteRow { title: string; body: string; pinned: boolean }
interface MailRow { fromName: string | null; fromAddress: string; subject: string; read: boolean }
interface ActivityRow { actor: string; summary: string }

interface ListEnvelope<T> { data: T[]; total?: number }

/** The strip's order is this order. */
export const SOURCES: WorkspaceSource[] = [
  {
    id: "drive",
    label: "Drive",
    icon: HardDriveIcon,
    scope: "File names and sizes from /files",
    read: async () => {
      const res = await apiGet<ListEnvelope<FileRow>>("files");
      const files = res.data.filter((row) => row.kind === "file").slice(0, ROW_LIMIT);
      return { lines: files.map((f) => clip(`${f.name} (${f.size ?? "unknown"} bytes)`)), total: res.data.length };
    },
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: ListChecksIcon,
    scope: "Open tasks with status, priority and assignee",
    read: async () => {
      const res = await apiGet<ListEnvelope<TaskRow>>("tasks", { limit: ROW_LIMIT });
      return {
        lines: res.data.map((t) =>
          clip(`${t.title} — ${t.status}, ${t.priority} priority, ${t.assignee ?? "unassigned"}`),
        ),
        total: res.total ?? null,
      };
    },
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanbanIcon,
    scope: "Project names, status and task counts",
    read: async () => {
      const res = await apiGet<ListEnvelope<ProjectRow>>("projects", { limit: ROW_LIMIT });
      return {
        lines: res.data.map((p) => clip(`${p.name} — ${p.status}, ${p.taskCount} tasks`)),
        total: res.total ?? null,
      };
    },
  },
  {
    id: "notes",
    label: "Notes",
    icon: NotebookPenIcon,
    scope: "Team note titles and their opening lines",
    read: async () => {
      const res = await apiGet<ListEnvelope<NoteRow>>("team-notes", { limit: ROW_LIMIT });
      return {
        lines: res.data.map((n) => clip(`${n.pinned ? "[pinned] " : ""}${n.title}: ${noteText(n.body)}`)),
        total: res.total ?? null,
      };
    },
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: InboxIcon,
    scope: "Sender and subject of recent inbound mail",
    read: async () => {
      const res = await apiGet<ListEnvelope<MailRow>>("inbox", { limit: ROW_LIMIT });
      return {
        lines: res.data.map((m) =>
          clip(`${m.read ? "" : "[unread] "}${m.fromName ?? m.fromAddress}: ${m.subject}`),
        ),
        total: res.total ?? null,
      };
    },
  },
  {
    id: "activity",
    label: "Activity",
    icon: HistoryIcon,
    scope: "The most recent entries in the activity log",
    read: async () => {
      const res = await apiGet<ListEnvelope<ActivityRow>>("activity", { limit: ROW_LIMIT });
      return { lines: res.data.map((a) => clip(`${a.actor}: ${a.summary}`)), total: res.total ?? null };
    },
  },
];

/** Look one up by id. */
export function sourceById(id: SourceId): WorkspaceSource | undefined {
  return SOURCES.find((source) => source.id === id);
}

/** A source that has been fetched, or failed to fetch. */
export interface LoadedSource {
  id: SourceId;
  /** Present once the fetch resolved. */
  summary: SourceSummary | null;
  /** Plain-language failure, when the fetch threw. */
  error: string | null;
  loading: boolean;
}

/**
 * Build the system-prompt block for the sources that loaded.
 *
 * A source that is switched off, still loading, or that failed contributes
 * nothing — so what the model sees and what the receipt claims are the same
 * set.
 *
 * @param loaded Every source the reader switched on, in strip order.
 * @returns The context block, or "" when nothing readable is switched on.
 */
export function buildSourceContext(loaded: LoadedSource[]): string {
  const blocks = loaded
    .filter((entry) => entry.summary && entry.summary.lines.length > 0)
    .map((entry) => {
      const source = sourceById(entry.id);
      return `## ${source?.label ?? entry.id}\n${entry.summary!.lines.map((line) => `- ${line}`).join("\n")}`;
    });
  if (blocks.length === 0) return "";
  return [
    "Answer ONLY from the workspace data below. If it does not contain the answer, say so plainly.",
    ...blocks,
  ].join("\n\n");
}

/** One receipt row: what a source contributed to the turn that was sent. */
export interface SourceReceipt {
  id: SourceId;
  label: string;
  state: "read" | "empty" | "failed" | "off";
  detail: string;
}

/**
 * Turn the scope into per-source receipt rows.
 *
 * @param loaded The sources switched on when the message was sent.
 * @returns One row per source in the workspace, including the ones left off.
 */
export function describeRead(loaded: LoadedSource[]): SourceReceipt[] {
  return SOURCES.map((source) => {
    const entry = loaded.find((item) => item.id === source.id);
    if (!entry) return { id: source.id, label: source.label, state: "off" as const, detail: "Not in scope" };
    if (entry.error) {
      return { id: source.id, label: source.label, state: "failed" as const, detail: entry.error };
    }
    const lines = entry.summary?.lines ?? [];
    if (lines.length === 0) {
      return { id: source.id, label: source.label, state: "empty" as const, detail: "Nothing to read" };
    }
    const chars = lines.reduce((total, line) => total + line.length, 0);
    const of = entry.summary?.total != null && entry.summary.total > lines.length ? ` of ${entry.summary.total}` : "";
    return {
      id: source.id,
      label: source.label,
      state: "read" as const,
      detail: `${lines.length}${of} rows, about ${chars.toLocaleString()} characters`,
    };
  });
}
