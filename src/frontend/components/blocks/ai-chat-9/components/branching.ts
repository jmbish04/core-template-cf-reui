/**
 * @fileoverview The fork model behind `/chat/branching`.
 *
 * ReUI `ai-chat-9` draws a conversation TREE: a regenerate or an edit adds a
 * version on a fork rail instead of overwriting the turn. D1 does not store a
 * tree — `chat_messages` is a flat list per thread, oldest first — so a version
 * kept in component state would vanish on the next reload and the rail would
 * be theatre.
 *
 * So a version here is a REAL SIBLING THREAD. Forking creates a row in
 * `chat_threads`, sends the forked ask into it, and the reply is persisted like
 * any other. The rail lists the threads in the fork group, which is why a
 * branch survives a refresh, a new tab and another device.
 *
 * TWO THINGS CARRY THE FORK:
 *
 * 1. `chat_threads.parent_thread_id` names the thread a branch came from, and
 *    is null on a root. It is deliberately not a foreign key: deleting a root
 *    must not cascade away the branches taken from it, which are independent
 *    conversations.
 * 2. The forking turn's own user message carries the pre-fork transcript
 *    between two sentinel lines. It has to live in the message text because
 *    there is no endpoint that inserts a message into a thread — only
 *    `POST /api/chat/stream`, which writes the user turn it is given. Putting
 *    it there means the branch really has its context in D1 rather than in a
 *    system prompt that evaporates on reload.
 */
import { apiSend, type ApiError } from "@/lib/api";
import type { ChatMessage, ChatThread } from "@/lib/chat";
import { toMs } from "@/lib/format";

/** Opens the carried transcript inside a forking turn's user message. */
const CONTEXT_OPEN = "[carried from the parent thread]";
/** Closes it. The prompt itself starts on the line after this one. */
const CONTEXT_CLOSE = "[end carried context]";

/**
 * How much pre-fork transcript a branch carries.
 *
 * `POST /api/chat/stream` caps a message at 8000 characters, and the ask has
 * to fit beside the context, so the transcript keeps its TAIL — the turns
 * nearest the fork are the ones the ask depends on.
 */
const CONTEXT_BUDGET = 3000;

/**
 * The thread a fork group is keyed on.
 *
 * @param thread Any thread from `/api/threads`.
 * @returns The root thread's id — the thread's own id when it is not a branch.
 */
export function forkRootId(thread: Pick<ChatThread, "id" | "parentThreadId">): string {
  return thread.parentThreadId ?? thread.id;
}

/**
 * Every thread in one fork group, oldest first.
 *
 * The root is the original conversation and sorts first; a branch of a branch
 * still points at the root, so a group is flat rather than nested. A group of
 * one means the thread has never been forked, and the rail stays hidden.
 *
 * @param threads The full thread index from `useThreads`.
 * @param activeId The thread currently open, or undefined for a fresh one.
 * @returns The group's threads, or an empty array when there is no group.
 */
export function forkGroup(threads: ChatThread[], activeId: string | undefined): ChatThread[] {
  if (!activeId) return [];
  const active = threads.find((thread) => thread.id === activeId);
  if (!active) return [];
  const root = forkRootId(active);
  return threads
    .filter((thread) => forkRootId(thread) === root)
    // Wire timestamps arrive as ISO strings, so they go through `toMs` before
    // any subtraction — `a.createdAt - b.createdAt` would be NaN and the sort
    // a silent no-op, leaving the rail in whatever order D1 returned.
    .sort((a, b) =>
      a.id === root ? -1 : b.id === root ? 1 : (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0),
    );
}

/**
 * Split a forking turn's user message into the carried context and the ask.
 *
 * Round-trips with {@link composeForkMessage}. A message without the sentinels
 * — every ordinary turn — comes back as `{ context: null, prompt: content }`,
 * so a wording change degrades to showing the raw text rather than hiding it.
 *
 * @param content The persisted user message body.
 * @returns The carried transcript (or null) and the ask on its own.
 */
export function splitForkMessage(content: string): { context: string | null; prompt: string } {
  if (!content.startsWith(`${CONTEXT_OPEN}\n`)) return { context: null, prompt: content };
  const end = content.indexOf(`\n${CONTEXT_CLOSE}`);
  if (end < 0) return { context: null, prompt: content };
  return {
    context: content.slice(CONTEXT_OPEN.length + 1, end).trim(),
    prompt: content.slice(end + CONTEXT_CLOSE.length + 1).trim(),
  };
}

/**
 * Build the forking turn's message: the pre-fork transcript, then the ask.
 *
 * @param history The turns before the fork point, oldest first.
 * @param prompt The ask being re-run (a regenerate) or rewritten (an edit).
 * @returns One message body, or the bare prompt when there is no history.
 */
export function composeForkMessage(history: ChatMessage[], prompt: string): string {
  const lines = history.map((message) => `${message.role}: ${message.content}`);

  // Keep the tail: the turns nearest the fork are the ones the ask leans on.
  let carried: string[] = [];
  let budget = CONTEXT_BUDGET;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (line.length > budget) break;
    budget -= line.length + 1;
    carried = [line, ...carried];
  }
  if (carried.length === 0) return prompt;

  return `${CONTEXT_OPEN}\n${carried.join("\n")}\n${CONTEXT_CLOSE}\n\n${prompt}`;
}

/**
 * The turns a fork carries: everything before the user turn being re-asked.
 *
 * @param messages The open thread's messages, oldest first.
 * @param askId The user turn the fork re-runs.
 * @returns The turns above it, oldest first.
 */
export function historyBefore(messages: ChatMessage[], askId: string): ChatMessage[] {
  const at = messages.findIndex((message) => message.id === askId);
  return at <= 0 ? [] : messages.slice(0, at);
}

/**
 * The user turn a given assistant reply answered.
 *
 * @param messages The open thread's messages, oldest first.
 * @param replyId The assistant turn being regenerated.
 * @returns The user turn above it, or null when the reply has no ask.
 */
export function askBehind(messages: ChatMessage[], replyId: string): ChatMessage | null {
  const at = messages.findIndex((message) => message.id === replyId);
  if (at < 0) return null;
  for (let index = at - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === "user") return messages[index]!;
  }
  return null;
}

/**
 * Create the sibling thread a new version lives in.
 *
 * @param rootId The fork group's root thread id.
 * @param title Title for the branch, shown in the rail and the thread list.
 * @returns The created thread.
 * @throws {ApiError} When `/api/threads` rejects the create.
 * @example
 * const branch = await createBranchThread(forkRootId(thread), "Version 2");
 */
export function createBranchThread(rootId: string, title: string): Promise<ChatThread> {
  return apiSend<ChatThread>("POST", "threads", { title, parentThreadId: rootId });
}

/** Re-exported so a caller can narrow a failed fork without a second import. */
export type { ApiError };
