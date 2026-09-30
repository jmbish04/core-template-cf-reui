/**
 * @fileoverview `/projects` — the project grid island.
 *
 * Calls `GET /api/projects` with `?q=`, `?status=` and `?sort=`, and
 * `POST /api/projects/{id}/star` for the star toggle. Creation lives on
 * `/projects/new` (the wizard), so this screen only links to it.
 *
 * The status filter is a `FilterSelect`, which passes Base UI's `items` map —
 * so the trigger reads "All statuses" on load rather than a raw sentinel.
 */

import { useCallback, useEffect, useState } from "react";

import { FrameGrid } from "@/components/dashboard/frame-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect, OptionSelect } from "@/components/ui/option-select";
import { EmptyState, ErrorState } from "@/components/common";
import type { ListEnvelope, Project, ProjectStatus } from "@/components/common";
import { PROJECT_STATUS_LABELS } from "@/components/common";
import { ProjectCard } from "@/components/projects/project-card";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { FolderKanbanIcon, PlusIcon } from "lucide-react";

type SortKey = "updatedAt" | "createdAt" | "name" | "taskCount";

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}));

/**
 * Sort options. The direction is the server's, chosen per column in
 * `src/backend/api/routes/projects.ts` — ascending for `name`, descending for
 * the dates and the task count — so each label states the direction it gets.
 * `updatedAt` is the endpoint's own default and so is the default here.
 */
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updatedAt", label: "Recently updated" },
  { value: "createdAt", label: "Newest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "taskCount", label: "Most tasks" },
];

/** The `/projects` island: one screen, one surface (`frame`). */
export function ProjectList() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | undefined>(undefined);
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starPending, setStarPending] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Debounce the search box so a keystroke is not a request.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ListEnvelope<Project>>("projects", {
      q: debounced || undefined,
      status,
      sort,
      limit: 200,
    })
      .then((res) => {
        if (!cancelled) setProjects(res.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load projects.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, status, sort, nonce]);

  const toggleStar = useCallback(async (id: string) => {
    setStarPending(id);
    setError(null);
    try {
      const res = await apiSend<{ id: string; starred: boolean }>(
        "POST",
        `projects/${id}/star`,
      );
      setProjects((current) =>
        current.map((p) => (p.id === res.id ? { ...p, starred: res.starred } : p)),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the star.");
    } finally {
      setStarPending(null);
    }
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="w-full sm:w-64"
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
          ariaLabel="Filter by status"
        />
        <OptionSelect
          value={sort}
          options={SORT_OPTIONS}
          ariaLabel="Sort projects"
          className="w-[170px]"
          onChange={setSort}
        />
        <Button render={<a href="/projects/new" />} className="ms-auto">
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          New project
        </Button>
      </div>

      {error ? <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} /> : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading projects…</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanbanIcon />}
          title="No projects match"
          description={
            debounced || status
              ? "Clear the search or the status filter to see every project."
              : "Create the first project to start grouping tasks and notes."
          }
          action={
            <Button render={<a href="/projects/new" />}>
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              New project
            </Button>
          }
        />
      ) : (
        <FrameGrid cols="sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onToggleStar={toggleStar}
              starPending={starPending === project.id}
            />
          ))}
        </FrameGrid>
      )}
    </div>
  );
}
