/**
 * @fileoverview `/activity` — the activity-log island.
 *
 * Calls `GET /api/activity` with the filters that endpoint actually supports:
 * `?q=`, `?entityType=`, `?limit=` and `?offset=`. There is deliberately NO
 * date-range control — the route exposes no date parameter, so a range picker
 * here could not filter anything.
 *
 * The entity-type options are derived from the rows the unfiltered first page
 * returned rather than from a hardcoded list, because `entity_type` is free
 * text on the server.
 */

import { useEffect, useState } from "react";
import { HistoryIcon } from "lucide-react";

import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/option-select";
import { EmptyState, ErrorState } from "@/components/common";
import type { ListEnvelope } from "@/components/common";
import { ActivityTimeline } from "@/components/blocks/timeline-5/components/activity-timeline";
import type { ActivityEntry } from "@/components/activity/types";
import { ApiError, apiGet } from "@/lib/api";

const PAGE_SIZE = 50;
/** The route clamps `?limit=` at 200, so asking for more returns the same page. */
const MAX_LIMIT = 200;

/** Title-case a free-text entity type for the filter's option label. */
function typeLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]/g, " ");
}

/** The `/activity` island: one screen, one surface (`frame`). */
export function ActivityFeed() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [entityType, setEntityType] = useState<string | undefined>(undefined);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  // A new filter starts a new page run.
  useEffect(() => setLimit(PAGE_SIZE), [debounced, entityType]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ListEnvelope<ActivityEntry>>("activity", {
      q: debounced || undefined,
      entityType,
      limit,
    })
      .then((res) => {
        if (cancelled) return;
        setEntries(res.data);
        setTotal(res.total);
        // Only an unfiltered response can enumerate the full type set.
        if (!entityType && !debounced) {
          setTypes([...new Set(res.data.map((e) => e.entityType))].sort());
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load the activity log.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, entityType, limit, nonce]);

  const typeOptions = types.map((value) => ({ value, label: typeLabel(value) }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search activity"
          aria-label="Search activity"
          className="w-full sm:w-64"
        />
        <FilterSelect
          value={entityType}
          onChange={setEntityType}
          options={typeOptions}
          allLabel="All entity types"
          ariaLabel="Filter by entity type"
          className="w-[170px]"
        />
        <span className="text-muted-foreground ms-auto text-sm">
          {entries.length} of {total}
        </span>
      </div>

      {error ? <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} /> : null}

      <Frame>
        <FramePanel>
          {loading && entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading activity…</p>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon />}
              title="No activity recorded"
              description={
                debounced || entityType
                  ? "Clear the search or the entity filter to see every entry."
                  : "Actions across projects, tasks and notes appear here as they happen."
              }
            />
          ) : (
            <ActivityTimeline entries={entries} />
          )}
        </FramePanel>
      </Frame>

      {entries.length < total && limit < MAX_LIMIT ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
