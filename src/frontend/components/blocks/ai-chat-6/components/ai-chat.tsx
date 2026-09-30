/**
 * @fileoverview `/chat/agentic` — a docked panel that runs a task end to end.
 *
 * Adapted from ReUI `ai-chat-6`. The block's shape is kept: a brief that
 * settles what the agent may read, an editable ordered plan, a run-status
 * header, per-step states with Retry, a mid-run question, a rewind, and a
 * handoff at the end. Everything behind it is real — see `run-engine.ts`.
 *
 * Removed from the stock block: the entire scripted transcript (`data.ts`, 576
 * lines of canned turns), the timed plan runner with its always-failing step,
 * the invented artifacts and their pretend downloads, the scripted fork
 * question, the hardcoded owner/model menus, and the "task created" boolean —
 * filing is now `POST /api/tasks`, and the run's real step outputs are
 * appended to the thread's `chat_documents` row, which is the canvas beside
 * the panel.
 *
 * MOUNTING: the canvas is PlateJS, so this island must be `client:only="react"`.
 */
import { useState } from "react";

import { useScope } from "@/components/chat/use-scope";
import {
  CanvasDocument,
  ChatErrorBanner,
  RoutingPicker,
  describeAttachments,
  useBelow,
  useChatDocument,
  useThreadSession,
  type DriveFile,
  type ThreadSession,
} from "@/components/chat";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RoutingProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { ArrowUpIcon } from "lucide-react";

import { AssignCard } from "./assign-card";
import { PlanRail } from "./plan-rail";
import { ScopeCard } from "./scope-card";
import { useAgenticRun } from "./run-engine";

/** Opens on the collections a work plan is usually drawn from. */
const INITIAL_SCOPE = ["tasks", "projects"] as const;

function Panel({ session, onDocumentChanged }: { session: ThreadSession; onDocumentChanged: () => void }) {
  const [profile, setProfile] = useState<RoutingProfile>("balanced");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [goal, setGoal] = useState("");

  const scope = useScope([...INITIAL_SCOPE]);
  const attachments = describeAttachments(files);
  const context = [scope.context, attachments].filter(Boolean).join("\n\n");

  const run = useAgenticRun({
    threadId: session.threadId,
    context,
    profile,
    onThreadCreated: session.adoptThread,
  });

  const planning = run.phase === "planning";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <ScopeCard
        loaded={scope.loaded}
        onToggle={scope.toggle}
        files={files}
        onAttach={(file) => setFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]))}
        onDetach={(id) => setFiles((prev) => prev.filter((file) => file.id !== id))}
        locked={run.phase !== "brief"}
      />

      <ChatErrorBanner error={run.error} onDismiss={run.rewind} />

      {run.phase === "brief" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run.plan(goal);
          }}
        >
          <h2 className="text-muted-foreground text-xs font-medium">What should the agent do?</h2>
          <InputGroup className="flex-col items-stretch">
            <InputGroupTextarea
              value={goal}
              rows={2}
              aria-label="The goal for this run"
              placeholder="Summarise what is blocking the current sprint and draft the update…"
              onChange={(event) => setGoal(event.target.value)}
              className="max-h-40 min-h-16"
            />
            <InputGroupAddon align="block-end" className="gap-2">
              <RoutingPicker value={profile} onChange={setProfile} disabled={planning} />
              <Button
                type="submit"
                size="sm"
                disabled={!goal.trim() || planning || scope.reading}
                className="ms-auto gap-1.5"
              >
                {planning ? <Spinner className="size-3.5" /> : <ArrowUpIcon className="size-3.5" aria-hidden="true" />}
                {planning ? "Planning" : "Plan it"}
              </Button>
            </InputGroupAddon>
          </InputGroup>
          {scope.reading && <p className="text-muted-foreground text-xs">Reading the sources you chose…</p>}
        </form>
      ) : (
        <p className="text-sm text-pretty">{run.goal}</p>
      )}

      <PlanRail run={run} />

      {run.phase === "done" && (
        <AssignCard
          goal={run.goal}
          steps={run.steps}
          threadId={session.threadId}
          onDocumentChanged={onDocumentChanged}
        />
      )}
    </div>
  );
}

export interface ChatAgenticProps {
  /** `?t` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The `/chat/agentic` island.
 *
 * @param props The thread to resume, from the query string.
 * @returns The run's draft beside the docked agent panel.
 */
export function ChatAgentic({ initialThreadId }: ChatAgenticProps) {
  const session = useThreadSession(initialThreadId);
  const narrow = useBelow(1024);
  // The document is owned here rather than inside the panel, so appending from
  // the assign card can re-read the very editor the canvas is rendering.
  const document = useChatDocument(session.threadId);

  return (
    <TooltipProvider>
      <div className={cn("flex min-h-0 flex-1 gap-4", narrow ? "flex-col" : "flex-row")}>
        <div className={cn("bg-card flex min-h-96 flex-col rounded-lg border p-4", narrow ? "" : "flex-1")}>
          <CanvasDocument
            state={document}
            emptyHint="Plan a run. Its steps write into this draft when you add them."
          />
        </div>

        <aside
          aria-label="Agent"
          className={cn("bg-card flex min-h-0 flex-col rounded-lg border", narrow ? "" : "w-[26rem] shrink-0")}
        >
          <Panel key={session.sessionKey} session={session} onDocumentChanged={() => void document.reload()} />
        </aside>
      </div>
    </TooltipProvider>
  );
}
