/**
 * @fileoverview `?t=<id>` — the one place a chat surface keeps which thread is
 * open.
 *
 * The thread id lives in the URL so a reload resumes the same conversation and
 * a link to it is shareable. The Astro page reads `?t` server-side and hands it
 * in as `initialThreadId`, so there is no client-side flash of the wrong
 * thread; everything after that is `history.pushState`, because switching
 * threads must not reload the page.
 *
 * `useThreadSession` also hands out a `sessionKey`. `useChatThread` seeds its
 * state from `threadId` once (it owns the id after that, since the server
 * assigns one on the first send), so a deliberate switch has to remount it.
 * The key changes only on a user-driven switch — never when the server creates
 * a thread mid-stream, which would tear down the stream that created it.
 */
import { useCallback, useState } from "react";

/** Query-string key. One constant so no surface spells it differently. */
export const THREAD_PARAM = "t";

/**
 * Push a thread id into the address bar under `key`, without navigating.
 *
 * Generic because `/chat/compare` holds TWO threads at once and so needs two
 * keys; every other surface uses `THREAD_PARAM` through `writeThreadParam`.
 *
 * @param key Query-string key to write.
 * @param id Thread to record, or `undefined` to drop the parameter.
 * @param replace Replace the current entry instead of pushing a new one.
 */
export function writeParam(key: string, id: string | undefined, replace = false): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(key, id);
  else url.searchParams.delete(key);
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

/**
 * Push `?t=<id>` into the address bar without navigating.
 *
 * @param id Thread to record, or `undefined` to drop the parameter.
 * @param replace Replace the current entry instead of pushing a new one.
 */
export function writeThreadParam(id: string | undefined, replace = false): void {
  writeParam(THREAD_PARAM, id, replace);
}

/**
 * Query-string keys for the two panes on `/chat/compare`.
 *
 * A comparison is two threads, so one `?t` cannot describe it. Both are
 * recorded, which is what makes a reload — or a shared link — resume the same
 * pair rather than starting over against fresh threads.
 */
export const COMPARE_PARAMS = { left: "a", right: "b" } as const;

export interface ThreadSession {
  /** Thread the surface should open, or `undefined` for a fresh one. */
  threadId: string | undefined;
  /** React `key` for the component that owns `useChatThread`. */
  sessionKey: string;
  /** Open an existing thread (pushes `?t=<id>` and remounts the session). */
  openThread: (id: string) => void;
  /** Start a fresh thread (drops `?t` and remounts the session). */
  newThread: () => void;
  /** The server created a thread for the first message: record it, don't remount. */
  adoptThread: (id: string) => void;
}

/**
 * Track which thread a surface has open, in the URL.
 *
 * @param initialThreadId `?t` as the Astro page read it during SSR.
 * @returns The current thread, a remount key, and the three transitions.
 */
export function useThreadSession(initialThreadId?: string): ThreadSession {
  const [state, setState] = useState({ id: initialThreadId, generation: 0 });

  const openThread = useCallback((id: string) => {
    writeThreadParam(id);
    setState((prev) => ({ id, generation: prev.generation + 1 }));
  }, []);

  const newThread = useCallback(() => {
    writeThreadParam(undefined);
    setState((prev) => ({ id: undefined, generation: prev.generation + 1 }));
  }, []);

  const adoptThread = useCallback((id: string) => {
    // replaceState: the fresh thread and the blank composer are one step in
    // the reader's history, so Back leaves the surface rather than un-creating
    // a thread that exists in D1 either way.
    writeThreadParam(id, true);
    setState((prev) => (prev.id === id ? prev : { id, generation: prev.generation }));
  }, []);

  return {
    threadId: state.id,
    // Generation only: `adoptThread` changes the id without bumping it, so the
    // live stream that just created the thread is never torn down.
    sessionKey: String(state.generation),
    openThread,
    newThread,
    adoptThread,
  };
}
