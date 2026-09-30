/**
 * @fileoverview The agentic run: a real plan, executed one `/api/chat/stream`
 * turn at a time.
 *
 * ReUI `ai-chat-6` drives its plan from `setTimeout` — every step "runs" for a
 * scripted number of milliseconds and one of them always fails. Nothing here
 * is timed. The plan is a turn (the model is asked for a numbered list, which
 * is parsed into editable steps) and each step is another turn whose prompt
 * carries the previous steps' outputs. A step's state is the outcome of its
 * turn: `done` when text came back, `failed` with the router's own error when
 * it did not, `paused` when the model asked the reader a question.
 *
 * The question channel is explicit rather than inferred: the step's system
 * prompt tells the model to answer with a single `QUESTION:` line when it
 * needs a decision, so a pause is something the model said, not something
 * this file guessed from the prose.
 */
import { useCallback, useRef, useState } from "react";

import { streamChat, type RoutingProfile } from "@/lib/chat";

import { parsePlan } from "./parse-plan";

/** How much of an earlier step's output travels into the next step's prompt. */
const CARRY_CHARS = 1200;

export type StepState = "queued" | "running" | "done" | "failed" | "skipped";

export interface RunStep {
  id: string;
  title: string;
  state: StepState;
  /** What the step's turn actually produced. */
  output: string;
  /** The router's own failure sentence, when the turn failed. */
  error: string | null;
  model: string | null;
  latencyMs: number | null;
}

export type RunPhase = "brief" | "planning" | "ready" | "running" | "paused" | "failed" | "done";

const PLAN_SYSTEM =
  "You are planning a piece of work inside a project workspace. Reply with a numbered list of 3 to 6 steps and nothing else — no preamble, no closing line. Each step is one short imperative sentence that can be carried out by reading and reasoning over the workspace data you were given.";

const STEP_SYSTEM =
  "You are carrying out one step of an agreed plan inside a project workspace. Answer the step only, in at most 150 words. If you cannot carry the step out without a decision from the person, reply with a single line beginning 'QUESTION: ' and nothing else.";

interface TurnResult {
  text: string;
  error: string | null;
  threadId: string | undefined;
  model: string | null;
  latencyMs: number | null;
}

/** One `/api/chat/stream` turn, collected rather than rendered token by token. */
async function runTurn(
  message: string,
  opts: { threadId?: string; systemPrompt?: string; profile: RoutingProfile; signal: AbortSignal },
): Promise<TurnResult> {
  const result: TurnResult = { text: "", error: null, threadId: opts.threadId, model: null, latencyMs: null };
  await streamChat(message, { ...opts }, {
    onMeta: (id) => {
      result.threadId = id;
    },
    onRouted: (routed) => {
      result.model = routed.model;
    },
    onDelta: (chunk) => {
      result.text += chunk;
    },
    onDone: (_message, meta) => {
      result.latencyMs = meta.latencyMs;
    },
    onError: (error) => {
      result.error = error;
    },
  });
  return result;
}

export interface UseAgenticRunOptions {
  threadId: string | undefined;
  /** The workspace context block the whole run reads from. */
  context: string;
  profile: RoutingProfile;
  /** Called when the plan turn creates the thread. */
  onThreadCreated: (id: string) => void;
}

export interface AgenticRun {
  phase: RunPhase;
  steps: RunStep[];
  /** The question the model paused on, or null. */
  question: string | null;
  /** The plan turn's own failure, shown before there are any steps. */
  error: string | null;
  /** Ask the model for a plan for `goal`. */
  plan: (goal: string) => Promise<void>;
  /** Edit a step title before the run starts. */
  editStep: (id: string, title: string) => void;
  removeStep: (id: string) => void;
  /** Run from the first step that has not settled. */
  start: () => Promise<void>;
  /** Abort the in-flight turn. The step returns to `queued`. */
  stop: () => void;
  /** Re-run the failed step. */
  retry: () => Promise<void>;
  /** Give up on the failed step and carry on. */
  skip: () => Promise<void>;
  /** Answer the model's question and resume that step. */
  answer: (text: string) => Promise<void>;
  /** Throw the plan and the run away, back to the brief. */
  rewind: () => void;
  /** The goal the plan was made for, for the assign card's ticket title. */
  goal: string;
}

/**
 * Drive a plan-then-execute run over the chat endpoint.
 *
 * @param options The thread, the workspace context, and the routing profile.
 * @returns The run's state plus every transition the panel offers.
 */
export function useAgenticRun(options: UseAgenticRunOptions): AgenticRun {
  const { context, profile, onThreadCreated } = options;

  const [phase, setPhase] = useState<RunPhase>("brief");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");

  const threadRef = useRef(options.threadId);
  const abortRef = useRef<AbortController | null>(null);
  /** Outputs so far, so a step's prompt carries what the run has established. */
  const outputsRef = useRef<string[]>([]);
  /** The reader's answer to a pending question, folded into the retry. */
  const answerRef = useRef<string | null>(null);

  const stepPrompt = useCallback(
    (title: string, index: number, all: RunStep[]) => {
      const done = all
        .slice(0, index)
        .map((step, i) => (step.output ? `Step ${i + 1} (${step.title}) produced:\n${step.output.slice(0, CARRY_CHARS)}` : null))
        .filter(Boolean)
        .join("\n\n");
      const answered = answerRef.current ? `\n\nThe person answered your question: ${answerRef.current}` : "";
      return [`Step ${index + 1} of ${all.length}: ${title}`, done && `What the run has established so far:\n${done}`, answered]
        .filter(Boolean)
        .join("\n\n");
    },
    [],
  );

  const patch = useCallback((id: string, next: Partial<RunStep>) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...next } : step)));
  }, []);

  /**
   * Execute steps from `from` until one pauses, fails, or the plan is done.
   *
   * Reads the step list from the argument rather than from state, so a render
   * in the middle of the loop cannot change which step runs next.
   */
  const execute = useCallback(
    async (list: RunStep[], from: number) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("running");

      for (let index = from; index < list.length; index += 1) {
        const step = list[index]!;
        if (step.state === "done" || step.state === "skipped") continue;

        patch(step.id, { state: "running", error: null });
        const result = await runTurn(stepPrompt(step.title, index, list), {
          threadId: threadRef.current,
          systemPrompt: context ? `${STEP_SYSTEM}\n\n${context}` : STEP_SYSTEM,
          profile,
          signal: controller.signal,
        });
        answerRef.current = null;

        if (result.threadId && result.threadId !== threadRef.current) {
          threadRef.current = result.threadId;
          onThreadCreated(result.threadId);
        }
        if (controller.signal.aborted) {
          patch(step.id, { state: "queued" });
          setPhase("ready");
          return;
        }
        if (result.error) {
          patch(step.id, { state: "failed", error: result.error, model: result.model });
          setPhase("failed");
          return;
        }

        const text = result.text.trim();
        const asked = /^QUESTION:\s*(.+)$/is.exec(text);
        if (asked) {
          patch(step.id, { state: "queued", model: result.model, latencyMs: result.latencyMs });
          setQuestion(asked[1]!.trim());
          setPhase("paused");
          return;
        }

        list[index] = { ...step, state: "done", output: text, model: result.model, latencyMs: result.latencyMs };
        outputsRef.current[index] = text;
        patch(step.id, { state: "done", output: text, model: result.model, latencyMs: result.latencyMs });
      }

      abortRef.current = null;
      setPhase("done");
    },
    [context, onThreadCreated, patch, profile, stepPrompt],
  );

  const plan = useCallback(
    async (nextGoal: string) => {
      const trimmed = nextGoal.trim();
      if (!trimmed) return;
      setGoal(trimmed);
      setError(null);
      setQuestion(null);
      setPhase("planning");
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await runTurn(`Plan this work: ${trimmed}`, {
        threadId: threadRef.current,
        systemPrompt: context ? `${PLAN_SYSTEM}\n\n${context}` : PLAN_SYSTEM,
        profile,
        signal: controller.signal,
      });
      abortRef.current = null;

      if (result.threadId && result.threadId !== threadRef.current) {
        threadRef.current = result.threadId;
        onThreadCreated(result.threadId);
      }
      if (result.error) {
        setError(result.error);
        setPhase("brief");
        return;
      }
      const titles = parsePlan(result.text);
      if (titles.length === 0) {
        setError("The model did not return a plan that could be read as steps. Try rephrasing the goal.");
        setPhase("brief");
        return;
      }
      outputsRef.current = [];
      setSteps(
        titles.map((title, index) => ({
          id: `step-${index}-${crypto.randomUUID().slice(0, 8)}`,
          title,
          state: "queued" as StepState,
          output: "",
          error: null,
          model: null,
          latencyMs: null,
        })),
      );
      setPhase("ready");
    },
    [context, onThreadCreated, profile],
  );

  const resume = useCallback(
    async (mark?: (list: RunStep[]) => void) => {
      const list = steps.map((step) => ({ ...step }));
      mark?.(list);
      setSteps(list);
      setQuestion(null);
      const from = list.findIndex((step) => step.state !== "done" && step.state !== "skipped");
      if (from === -1) {
        setPhase("done");
        return;
      }
      await execute(list, from);
    },
    [execute, steps],
  );

  return {
    phase,
    steps,
    question,
    error,
    goal,
    plan,
    editStep: (id, title) => patch(id, { title }),
    removeStep: (id) => setSteps((prev) => prev.filter((step) => step.id !== id)),
    start: () => resume(),
    stop: () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    retry: () => resume((list) => list.forEach((step) => (step.state === "failed" ? (step.state = "queued") : undefined))),
    skip: () => resume((list) => list.forEach((step) => (step.state === "failed" ? (step.state = "skipped") : undefined))),
    answer: async (text) => {
      answerRef.current = text.trim();
      await resume();
    },
    rewind: () => {
      abortRef.current?.abort();
      abortRef.current = null;
      outputsRef.current = [];
      answerRef.current = null;
      setSteps([]);
      setQuestion(null);
      setError(null);
      setPhase("brief");
    },
  };
}
