/**
 * @fileoverview One generic loader hook plus the three dashboard endpoints
 * bound to it.
 *
 * Every dashboard surface needs the same three-state shape (data / loading /
 * error) over a `?range=` window, so there is a single `useApiResource` here
 * rather than three near-identical hooks. Errors are surfaced as a message and
 * never thrown — the caller renders `ErrorState` inline.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError, apiGet } from "@/lib/api";

import type {
  DashboardCharts,
  DashboardInsight,
  DashboardRange,
  DashboardStats,
} from "@/components/dashboard/types";

/** The three-state result every dashboard panel renders from. */
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch one `/api/<path>` resource, re-fetching whenever `params` change.
 *
 * @param path API path below `/api/`, e.g. `dashboard/stats`.
 * @param params Query params; re-fetches when their serialization changes.
 * @returns The resource's data, loading flag, error message and a reload fn.
 */
export function useApiResource<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Params are an object literal at every call site, so key the effect on its
  // serialization rather than its identity.
  const paramKey = JSON.stringify(params ?? {});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<T>(path, JSON.parse(paramKey))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Request failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, paramKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * Load the metric row.
 *
 * @param range Optional time window; omitted on surfaces with no picker.
 * @returns Stat totals for the metric row.
 */
export function useDashboardStats(range?: DashboardRange): Resource<DashboardStats> {
  return useApiResource<DashboardStats>("dashboard/stats", { range });
}

/**
 * Load every chart dataset for a window.
 *
 * @param range Time window for the time-series datasets.
 * @returns All five chart datasets in one payload.
 */
export function useDashboardCharts(range: DashboardRange): Resource<DashboardCharts> {
  return useApiResource<DashboardCharts>("dashboard/charts", { range });
}

/**
 * Load the core-guardian insight paragraph.
 *
 * @param range Time window the insight is written against.
 * @returns Markdown bullets plus the generation timestamp.
 */
export function useDashboardInsight(range: DashboardRange): Resource<DashboardInsight> {
  return useApiResource<DashboardInsight>("dashboard/insights", { range });
}
