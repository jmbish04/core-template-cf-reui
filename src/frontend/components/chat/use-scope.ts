/**
 * @fileoverview `useScope` — which workspace sources the next turn may read.
 *
 * Switching a source on fetches its bounded summary straight away rather than
 * at send time. Two reasons: the strip can show how much the source actually
 * contributes before the question is asked, and the system prompt stays a
 * plain derivation of state, so a send can never race a fetch and quietly
 * post a prompt with less context than the receipt claims.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  SOURCES,
  buildSourceContext,
  sourceById,
  type LoadedSource,
  type SourceId,
} from "@/components/chat/workspace-sources";

export interface Scope {
  /** Sources switched on, in strip order, with their fetch state. */
  loaded: LoadedSource[];
  /** The context block for the turn, or "" when nothing readable is on. */
  context: string;
  /** True while any source in scope is still being fetched. */
  reading: boolean;
  toggle: (id: SourceId, on: boolean) => void;
}

/**
 * Track the readable scope for a chat surface.
 *
 * @param initial Sources switched on at first paint.
 * @returns The scope, its derived context block, and the toggle.
 */
export function useScope(initial: SourceId[] = []): Scope {
  const [loaded, setLoaded] = useState<LoadedSource[]>(() =>
    initial.map((id) => ({ id, summary: null, error: null, loading: true })),
  );
  const initialRef = useRef(initial);

  const fetchOne = useCallback((id: SourceId) => {
    const source = sourceById(id);
    if (!source) return;
    void source
      .read()
      .then((summary) =>
        setLoaded((prev) =>
          prev.map((entry) => (entry.id === id ? { ...entry, summary, error: null, loading: false } : entry)),
        ),
      )
      .catch(() =>
        setLoaded((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? { ...entry, summary: null, error: `Could not read ${source.label.toLowerCase()}.`, loading: false }
              : entry,
          ),
        ),
      );
  }, []);

  // The initial set is fetched once, on mount. `initial` is deliberately not a
  // dependency: re-fetching because a caller passed a fresh array literal
  // would refetch on every render.
  useEffect(() => {
    for (const id of initialRef.current) fetchOne(id);
  }, [fetchOne]);

  const toggle = useCallback(
    (id: SourceId, on: boolean) => {
      setLoaded((prev) => {
        if (!on) return prev.filter((entry) => entry.id !== id);
        if (prev.some((entry) => entry.id === id)) return prev;
        // Rebuilt in strip order, so a source switched back on returns to its
        // place rather than to the end of the context block.
        const next = [...prev, { id, summary: null, error: null, loading: true }];
        return SOURCES.flatMap((source) => next.filter((entry) => entry.id === source.id));
      });
      if (on) fetchOne(id);
    },
    [fetchOne],
  );

  return {
    loaded,
    context: buildSourceContext(loaded),
    reading: loaded.some((entry) => entry.loading),
    toggle,
  };
}
