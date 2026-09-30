/**
 * @fileoverview The plan rail: the run's status header, its ordered steps, and
 * the controls that move it.
 *
 * Kept from ReUI `ai-chat-6` — the progress segments, the per-step states, the
 * run-status line and the Stop / Retry / Skip / Rewind controls. What changed
 * is where the states come from: every one is the outcome of a real
 * `/api/chat/stream` turn, so a failed step shows the router's own sentence
 * and its Retry re-runs that turn rather than advancing a script.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import type { AgenticRun, RunStep } from "./run-engine";

function segmentTone(step: RunStep): string {
  if (step.state === "failed") return "bg-destructive";
  if (step.state === "done") return "bg-primary";
  if (step.state === "running") return "bg-primary/40";
  if (step.state === "skipped") return "bg-muted-foreground/25";
  return "bg-muted";
}

function StepMarker({ state }: { state: RunStep["state"] }) {
  if (state === "running") return <Spinner className="size-4 shrink-0" />;
  if (state === "failed") return <AlertCircleIcon className="text-destructive size-4 shrink-0" aria-hidden="true" />;
  if (state === "done") return <CircleCheckIcon className="text-success size-4 shrink-0" aria-hidden="true" />;
  if (state === "skipped") return <CircleXIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />;
  return <CircleDotIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />;
}

/** The one line that says where the run is. */
function statusLine(run: AgenticRun): string {
  const settled = run.steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  if (run.phase === "planning") return "Asking the model for a plan";
  if (run.phase === "running") return `Step ${Math.min(settled + 1, run.steps.length)} of ${run.steps.length}`;
  if (run.phase === "failed") return "A step could not finish";
  if (run.phase === "paused") return "Waiting on your answer";
  if (run.phase === "done") return `Finished ${settled} of ${run.steps.length} steps`;
  return run.steps.length ? `${run.steps.length} steps queued` : "No plan yet";
}

/** One step row: editable before the run, a result afterwards. */
function StepRow({ step, index, editable, run }: { step: RunStep; index: number; editable: boolean; run: AgenticRun }) {
  const [open, setOpen] = useState(false);
  const detail =
    step.state === "failed"
      ? step.error
      : step.state === "done"
        ? [step.model, step.latencyMs != null ? `${(step.latencyMs / 1000).toFixed(1)}s` : null].filter(Boolean).join(" · ")
        : step.state === "skipped"
          ? "Skipped"
          : step.state === "running"
            ? "Running"
            : "Queued";

  return (
    <Item variant={step.state === "running" || step.state === "failed" ? "muted" : "outline"} size="sm" className="items-start">
      <span className="mt-0.5 flex">
        {editable ? (
          <span className="text-muted-foreground w-4 text-center text-xs tabular-nums">{index + 1}</span>
        ) : (
          <StepMarker state={step.state} />
        )}
      </span>

      <ItemContent className="min-w-0 gap-1">
        {editable ? (
          <Input
            value={step.title}
            aria-label={`Step ${index + 1}`}
            onChange={(event) => run.editStep(step.id, event.target.value)}
            className="h-8"
          />
        ) : (
          <>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{index + 1}</span>
              <span className={cn("min-w-0 text-sm", step.state === "skipped" && "text-muted-foreground line-through")}>
                {step.title}
              </span>
            </span>
            <span className={cn("truncate text-xs", step.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
              {detail}
            </span>

            {step.output && (
              <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger
                  render={<Button variant="ghost" size="sm" className="text-muted-foreground h-6 gap-1 px-1 font-normal [&_svg]:size-3.5" />}
                >
                  <ChevronRightIcon aria-hidden="true" className={cn("transition-transform", open && "rotate-90")} />
                  {open ? "Hide output" : "Show output"}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="border-border/60 text-muted-foreground mt-1 max-h-48 overflow-y-auto border-s ps-2 text-xs leading-5 whitespace-pre-wrap">
                    {step.output}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </ItemContent>

      {editable && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove step ${index + 1}`}
          onClick={() => run.removeStep(step.id)}
          className="shrink-0"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      )}
    </Item>
  );
}

export interface PlanRailProps {
  run: AgenticRun;
}

/**
 * Render the plan, its status and its controls.
 *
 * @param props The run returned by `useAgenticRun`.
 * @returns The rail, or null before a plan exists.
 */
export function PlanRail({ run }: PlanRailProps) {
  const [answer, setAnswer] = useState("");
  const editable = run.phase === "ready";
  if (run.steps.length === 0 && run.phase !== "planning") return null;

  return (
    <section aria-label="Plan" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-muted-foreground text-xs font-medium">Plan</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={run.rewind}
            disabled={run.phase === "running" || run.phase === "planning"}
            className="text-muted-foreground ms-auto h-6 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
          >
            <RotateCcwIcon aria-hidden="true" />
            Rewind
          </Button>
        </div>

        {/* One segment per step, in plan order: completion and sequence are
            legible before a single row is read. */}
        <div className="flex gap-1" aria-hidden="true">
          {run.steps.map((step) => (
            <span key={step.id} className={cn("h-1 flex-1 rounded-full", segmentTone(step))} />
          ))}
        </div>
        <p role="status" className="text-muted-foreground text-xs tabular-nums">
          {statusLine(run)}
        </p>
      </div>

      <ItemGroup aria-label="Plan steps" className="gap-2">
        {run.steps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index} editable={editable} run={run} />
        ))}
      </ItemGroup>

      {run.phase === "paused" && run.question && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!answer.trim()) return;
            const text = answer;
            setAnswer("");
            void run.answer(text);
          }}
        >
          <p className="text-sm text-pretty">{run.question}</p>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={answer}
              aria-label="Answer the agent's question"
              placeholder="Your answer…"
              onChange={(event) => setAnswer(event.target.value)}
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={!answer.trim()}>
              Answer
            </Button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-end gap-2">
        {run.phase === "failed" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => void run.skip()}>
              Skip
            </Button>
            <Button type="button" size="sm" onClick={() => void run.retry()}>
              Retry
            </Button>
          </>
        )}
        {run.phase === "running" && (
          <Button type="button" size="sm" variant="outline" onClick={run.stop}>
            Stop
          </Button>
        )}
        {(run.phase === "ready" || run.phase === "done") && run.steps.length > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={run.phase === "done"}
            onClick={() => void run.start()}
          >
            {run.steps.some((step) => step.state === "done") ? "Resume" : "Run plan"}
          </Button>
        )}
      </div>
    </section>
  );
}
