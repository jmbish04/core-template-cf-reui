/**
 * @fileoverview The health readout on `/settings/advanced`.
 *
 * `GET /api/health` returns the LAST PERSISTED run, not a fresh one — so an
 * empty response means "no run recorded yet", never "healthy". That difference
 * is stated on screen rather than papered over with a green tick, and the
 * "Run checks now" button POSTs `/api/health/run` to produce a real one.
 */
import { useCallback, useState } from "react";

import { EmptyState, ErrorState } from "@/components/common";
import type { HealthResponse, HealthResult } from "@/components/settings/types";
import { useResource } from "@/components/settings/use-resource";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api";
import { relativeTime } from "@/lib/format";

/** Badge variant per check status. A skipped check is not a passing check. */
const STATUS_VARIANT: Record<HealthResult["status"], "success-light" | "warning-light" | "destructive-light" | "secondary"> =
  {
    ok: "success-light",
    warn: "warning-light",
    fail: "destructive-light",
    timeout: "destructive-light",
    skipped: "secondary",
  };

const loadHealth = () => apiGet<HealthResponse>("health");

/**
 * Render the last health run and a button to trigger a new one.
 *
 * @returns A Frame listing each check, or the "never run" empty state.
 */
export function HealthReadout() {
  const { data, loading, error, reload, setData } = useResource<HealthResponse>(loadHealth);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      // POST with no body; the route runs every check and persists the result.
      setData(await apiSend<HealthResponse>("POST", "health/run"));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not run the health checks.");
    } finally {
      setRunning(false);
    }
  }, [setData]);

  return (
    <Frame className="w-full">
      <FrameHeader className="flex flex-wrap items-center justify-between gap-2 px-2! py-2.5!">
        <div className="min-w-0">
          <FrameTitle>Health</FrameTitle>
          <FrameDescription>
            {data?.run
              ? `Last run ${relativeTime(data.run.createdAt)} · ${data.run.durationMs}ms`
              : "The last persisted run from GET /api/health."}
          </FrameDescription>
        </div>
        <div className="flex items-center gap-2">
          {data?.run ? (
            <Badge variant={data.run.status === "healthy" ? "success-light" : "warning-light"} size="sm">
              {data.run.status}
            </Badge>
          ) : null}
          <Button size="sm" variant="outline" disabled={running} onClick={() => void runChecks()}>
            {running ? "Running…" : "Run checks now"}
          </Button>
        </div>
      </FrameHeader>

      <FramePanel className="p-0">
        {error ? <ErrorState className="m-4" message={error} onRetry={() => void reload()} /> : null}
        {runError ? <ErrorState className="m-4" message={runError} /> : null}

        {loading ? (
          <Skeleton className="m-4 h-40 rounded-md" />
        ) : !data?.run ? (
          <EmptyState
            className="m-4"
            title="No health run recorded"
            description="Nothing has been checked yet — this is an absence of data, not a clean bill of health. Run the checks to get one."
            action={
              <Button variant="outline" disabled={running} onClick={() => void runChecks()}>
                Run checks now
              </Button>
            }
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {data.results.map((result) => (
              <li key={result.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Badge variant={STATUS_VARIANT[result.status]} size="sm">
                  {result.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{result.name}</span>
                <span className="text-muted-foreground w-full text-xs sm:w-auto">
                  {result.message ?? result.category} · {result.durationMs}ms
                </span>
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}
