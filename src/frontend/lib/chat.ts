/**
 * @fileoverview The single chat client every `/chat/*` surface is built on.
 *
 * All twelve ReUI `ai-chat-*` blocks in this template share one backend:
 * `POST /api/chat/stream` (Server-Sent Events) for the reply, `/api/threads`
 * for the thread index, `/api/threads/{id}/document` for the canvas document.
 * Every inference runs through core-guardian — see
 * `backend/ai/guardian/`. Nothing here talks to a model provider directly
 * and nothing here keeps conversation state in the browser: D1 is the store,
 * so a reload resumes the same thread.
 *
 * `useChatThread` is the hook a block's transcript binds to. The block
 * supplies presentation (bubbles, receipts, plans, panes); this supplies the
 * turns, the streaming text and the errors.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet, apiSend } from "@/lib/api";
import type { Timestamp } from "@/lib/format";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  /** Wall-clock ms the reply took. Null on a row written before it was recorded. */
  latencyMs: number | null;
  /** Null means the provider did not report a count, never a measured zero. */
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Timestamp;
}

export interface ChatThread {
  id: string;
  title: string;
  model: string | null;
  /** Thread this one was forked from, or null for a root. See /chat/branching. */
  parentThreadId: string | null;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RichTextEnvelope {
  v: 1;
  format: "plate";
  value: Array<Record<string, unknown>>;
}

export interface ChatDocument {
  id: string;
  threadId: string;
  title: string;
  body: RichTextEnvelope;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * How hard the router should try for this turn.
 *
 * core-guardian picks the provider and model itself; a caller steers it with
 * importance/complexity rather than naming a model. That is what the "model
 * picker" on the chat surfaces actually sets — an honest control, because a
 * hardcoded model list would go stale the moment the router's catalogue moved.
 */
export type RoutingProfile = "fast" | "balanced" | "deep";

export const ROUTING_PROFILES: Array<{ value: RoutingProfile; label: string; description: string }> = [
  { value: "fast", label: "Fast", description: "Cheapest model that can answer. Best for short questions." },
  { value: "balanced", label: "Balanced", description: "Mid-tier model. The default for everyday work." },
  { value: "deep", label: "Deep", description: "Strongest model in budget. Slower, for hard problems." },
];

// The client sends the PROFILE NAME, not routing dials. The server owns the
// mapping (`resolveProfile` in backend/ai/guardian/config.ts), so the two
// cannot drift and an open endpoint accepts a closed set of three names
// instead of two free-form knobs.

// ---------------------------------------------------------------------------
// Thread index
// ---------------------------------------------------------------------------

export const listThreads = () => apiGet<{ data: ChatThread[] }>("threads").then((r) => r.data);
export const getThread = (id: string) => apiGet<ChatThread>(`threads/${id}`);
export const createThread = (title?: string) =>
  apiSend<ChatThread>("POST", "threads", title ? { title } : {});
export const renameThread = (id: string, title: string) =>
  apiSend<ChatThread>("PATCH", `threads/${id}`, { title });
export const archiveThread = (id: string) =>
  apiSend<ChatThread>("PATCH", `threads/${id}`, { archived: true });
export const deleteThread = (id: string) => apiSend<{ ok: boolean }>("DELETE", `threads/${id}`);
export const listMessages = (id: string) =>
  apiGet<{ data: ChatMessage[] }>(`threads/${id}/messages`).then((r) => r.data);
export const suggestFollowups = (messages: Array<{ role: ChatRole; content: string }>) =>
  apiSend<{ suggestions: string[] }>("POST", "threads/followups", { messages }).then((r) => r.suggestions);

// Canvas document
export const getDocument = (threadId: string) => apiGet<ChatDocument>(`threads/${threadId}/document`);
export const saveDocument = (threadId: string, patch: { title?: string; body?: RichTextEnvelope }) =>
  apiSend<ChatDocument>("PUT", `threads/${threadId}/document`, patch);
export const appendToDocument = (threadId: string, text: string) =>
  apiSend<ChatDocument>("POST", `threads/${threadId}/document/append`, { text });

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/** Token accounting core-guardian reports at the end of a stream. */
export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Which provider/model core-guardian actually routed the turn to. */
export interface RoutedTo {
  provider: string | null;
  model: string | null;
  requestUuid: string | null;
}

export interface StreamHandlers {
  onMeta?: (threadId: string) => void;
  /** The real provider/model, known before the first token arrives. */
  onRouted?: (routed: RoutedTo) => void;
  onDelta?: (text: string) => void;
  /**
   * A chunk of the model's THINKING, on a reasoning model. This is not part of
   * the answer — render it in a fold, or ignore it. Never append it to the
   * reply text.
   */
  onReasoning?: (text: string) => void;
  onUsage?: (usage: ChatUsage) => void;
  onTitle?: (title: string) => void;
  onDone?: (message: ChatMessage, meta: { latencyMs: number; usage: ChatUsage | null }) => void;
  onError?: (error: string) => void;
}

export interface SendOptions {
  threadId?: string;
  systemPrompt?: string;
  profile?: RoutingProfile;
  signal?: AbortSignal;
}

/**
 * Send one message and drive `handlers` from the SSE response.
 *
 * Resolves once the stream is finished (or aborted). Aborting is a normal
 * outcome, not an error — the reply the server already persisted stays in D1,
 * so the next load shows whatever was generated before the stop.
 */
export async function streamChat(
  message: string,
  { threadId, systemPrompt, profile = "balanced", signal }: SendOptions,
  handlers: StreamHandlers,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ threadId, message, systemPrompt, profile }),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError?.("Could not reach the chat service.");
    return;
  }

  if (!response.ok || !response.body) {
    handlers.onError?.(`Chat request failed (${response.status}).`);
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;

        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        if (event === "meta") handlers.onMeta?.(payload.threadId);
        else if (event === "routed") handlers.onRouted?.(payload as RoutedTo);
        else if (event === "delta") handlers.onDelta?.(payload.text ?? "");
        else if (event === "reasoning") handlers.onReasoning?.(payload.text ?? "");
        else if (event === "usage") handlers.onUsage?.(payload as ChatUsage);
        else if (event === "title") handlers.onTitle?.(payload.title);
        else if (event === "done") {
          handlers.onDone?.(payload.message, {
            latencyMs: payload.latencyMs ?? 0,
            usage: payload.usage ?? null,
          });
        } else if (event === "error") handlers.onError?.(payload.error ?? "The assistant failed to reply.");
      }
    }
  } catch (err) {
    // An abort tears the reader down mid-read; that is the user pressing Stop.
    if ((err as Error)?.name !== "AbortError") {
      handlers.onError?.("The reply stream was interrupted.");
    }
  }
}

// ---------------------------------------------------------------------------
// useChatThread
// ---------------------------------------------------------------------------

export interface UseChatThreadOptions {
  /** Resume an existing thread. Omit to start one on the first send. */
  threadId?: string;
  /** Extra system instruction for this surface. */
  systemPrompt?: string;
  /** Initial routing profile. */
  profile?: RoutingProfile;
  /** Called when the server creates a thread for the first message. */
  onThreadCreated?: (threadId: string) => void;
  /** Called when the model titles a new thread. */
  onTitle?: (threadId: string, title: string) => void;
}

export interface UseChatThread {
  threadId: string | undefined;
  messages: ChatMessage[];
  /** Text streaming in for the in-flight assistant turn, or "" when idle. */
  pending: string;
  /**
   * The model's THINKING for the in-flight turn, on a reasoning model, or ""
   * when idle or when the model does not think out loud. Show it in a fold;
   * it is not part of the answer.
   */
  reasoning: string;
  /** Provider/model core-guardian routed the current or last turn to. */
  routed: RoutedTo | null;
  /** Wall-clock time of the last completed turn, in ms. */
  latencyMs: number | null;
  /** Token counts for the last completed turn, when the provider reported them. */
  usage: ChatUsage | null;
  streaming: boolean;
  /** Loading the thread's history (not the reply). */
  loading: boolean;
  error: string | null;
  profile: RoutingProfile;
  setProfile: (profile: RoutingProfile) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  /** Drop the local error banner without touching the thread. */
  clearError: () => void;
  /** Re-read the thread from D1. */
  reload: () => Promise<void>;
}

/**
 * Bind a chat surface to one D1-backed thread.
 *
 * The optimistic user turn is appended locally so the transcript never lags
 * the keystroke; the persisted rows replace it when `done` arrives, which is
 * also what gives the message its real id.
 */
export function useChatThread(options: UseChatThreadOptions = {}): UseChatThread {
  const { systemPrompt, onThreadCreated, onTitle } = options;

  const [threadId, setThreadId] = useState(options.threadId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [routed, setRouted] = useState<RoutedTo | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(Boolean(options.threadId));
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoutingProfile>(options.profile ?? "balanced");

  const abortRef = useRef<AbortController | null>(null);
  // The thread id as of RIGHT NOW, not as of the render that produced a
  // callback. On a thread's first message the server invents the id mid-send,
  // and a `stop` captured before that re-render would otherwise reconcile
  // against `undefined` and wipe the transcript the user is looking at.
  const threadIdRef = useRef(options.threadId);
  // Mirrors the state exactly rather than remembering the last non-empty id:
  // if a caller ever drives this hook onto a different thread without
  // remounting, a stale id here would reconcile the WRONG conversation into
  // view, where an empty one only makes `stop` a no-op.
  threadIdRef.current = threadId;

  const reload = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMessages(await listMessages(threadId));
      setError(null);
    } catch {
      setError("Could not load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Abort any in-flight stream when the surface unmounts, so a navigation
  // does not leave a reader attached to a dead component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || streaming) return;

      setError(null);
      setStreaming(true);
      setPending("");
      setReasoning("");
      // These describe ONE turn. Carrying them over meant the receipt on the
      // last settled reply showed the previous turn's latency and tokens
      // beside the new turn's model for as long as the new reply streamed.
      setRouted(null);
      setLatencyMs(null);
      setUsage(null);

      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        threadId: threadId ?? "",
        role: "user",
        content: body,
        provider: null,
        model: null,
        costUsd: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const controller = new AbortController();
      abortRef.current = controller;
      let createdId: string | undefined;

      await streamChat(
        body,
        { threadId, systemPrompt, profile, signal: controller.signal },
        {
          onMeta: (id) => {
            createdId = id;
            threadIdRef.current = id;
            if (id !== threadId) {
              setThreadId(id);
              onThreadCreated?.(id);
            }
          },
          onRouted: setRouted,
          onDelta: (chunk) => setPending((prev) => prev + chunk),
          onReasoning: (chunk) => setReasoning((prev) => prev + chunk),
          onUsage: setUsage,
          onTitle: (title) => onTitle?.(createdId ?? threadId ?? "", title),
          onDone: (message, meta) => {
            setLatencyMs(meta.latencyMs);
            if (meta.usage) setUsage(meta.usage);
            // Paint the reply immediately; the reconcile below makes D1
            // authoritative once the stream is closed.
            setMessages((prev) => [...prev, message]);
            setPending("");
          },
          onError: (message) => setError(message),
        },
      );

      abortRef.current = null;
      setStreaming(false);
      setPending("");

      // Reconcile against D1 rather than splicing the optimistic turn back in.
      // On a thread's FIRST message the server invents the id, and adopting it
      // re-runs the load effect mid-stream — which already brings back the
      // persisted user row. Splicing on top of that rendered the user's
      // message twice. The server is the only thing that knows what was
      // actually stored, so ask it.
      const settledId = createdId ?? threadId;
      if (settledId) {
        try {
          setMessages(await listMessages(settledId));
        } catch {
          // The turn itself succeeded; a failed re-read is not worth an error
          // banner, and the optimistic view is still correct.
        }
      }
    },
    [onThreadCreated, onTitle, profile, streaming, systemPrompt, threadId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setPending("");

    // What the server already persisted is authoritative; re-read rather than
    // keeping a half-streamed bubble. Read through the ref, because on a new
    // thread the id arrived during this very send.
    const id = threadIdRef.current;
    if (!id) return;
    void listMessages(id)
      .then(setMessages)
      .catch(() => setError("Could not reload this conversation."));
  }, []);

  return {
    threadId,
    messages,
    pending,
    reasoning,
    routed,
    latencyMs,
    usage,
    streaming,
    loading,
    error,
    profile,
    setProfile,
    send,
    stop,
    clearError: () => setError(null),
    reload,
  };
}

// ---------------------------------------------------------------------------
// Canvas document <-> PlateEditor bridge
// ---------------------------------------------------------------------------
//
// `PlateEditor` (components/notes) is string-in / string-out: it takes the
// stored `body` STRING and hands back a fresh one. The chat-document API is
// object-in / object-out (it parses the envelope at the route boundary). These
// two helpers are the seam, so no surface has to JSON.stringify by hand and
// none of them can disagree about the shape.

/** Envelope object → the `body` string `PlateEditor` expects as `value`. */
export function documentToEditorBody(doc: Pick<ChatDocument, "body">): string {
  return JSON.stringify(doc.body);
}

/**
 * `PlateEditor`'s `onChange` string → the envelope the API stores.
 *
 * Returns `null` when the editor handed back something that is not an
 * envelope, so a caller skips the save rather than overwriting a good
 * document with a half-parsed one.
 */
export function editorBodyToEnvelope(body: string): RichTextEnvelope | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed && Array.isArray(parsed.value)) {
      return { v: 1, format: "plate", value: parsed.value };
    }
  } catch {
    // Legacy plain text: wrap it rather than losing it.
    if (body.trim()) {
      return { v: 1, format: "plate", value: body.split("\n").map((line) => ({ type: "p", children: [{ text: line }] })) };
    }
  }
  return null;
}
