/**
 * @fileoverview `useResource` — the load/refetch/error loop every settings
 * island runs, in one place.
 *
 * Each settings screen does the same three things: fetch once on mount, keep
 * the `ApiError` message for an inline `ErrorState`, and expose a `reload` for
 * the retry button and for after a mutation. Nothing here is settings-specific;
 * it just has no other consumer yet.
 */
import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  /** The loaded value, or undefined until the first successful fetch. */
  data: T | undefined;
  /** True while a fetch is in flight and nothing has loaded yet. */
  loading: boolean;
  /** Message from the last failed fetch, or null. */
  error: string | null;
  /** Re-run the fetch. Safe to call from an event handler. */
  reload: () => Promise<void>;
  /** Replace the value locally, e.g. with a mutation's response row. */
  setData: (next: T) => void;
}

/**
 * Fetch a value once on mount and keep it with its loading/error state.
 *
 * @param fetcher - Loads the value; re-run whenever its identity changes, so
 *   wrap it in `useCallback` if it closes over changing state.
 * @returns The value plus `loading`, `error`, `reload` and `setData`.
 */
export function useResource<T>(fetcher: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcher());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetcher()
      .then((value) => {
        if (!live) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : "Could not load that.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [fetcher]);

  return { data, loading, error, reload, setData };
}
