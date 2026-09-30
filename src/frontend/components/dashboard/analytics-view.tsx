/**
 * @fileoverview `/analytics` — the deeper cut of the same data: created vs.
 * completed over time, throughput, priority and project-status breakdowns, and
 * a per-project task-count ranking.
 *
 * The per-project breakdown is not a `/api/dashboard/charts` dataset; it is
 * derived from the denormalised `taskCount` column already returned by
 * `GET /api/projects`, so it is real data rather than a second aggregation.
 */

import { useState } from "react";

import { Frame } from "@/components/reui/frame";
import { FrameGrid } from "@/components/dashboard/frame-grid";
import { RankedBarChart, TasksOverTimeChart, ThroughputChart } from "@/components/dashboard/charts";
import { MetricRow } from "@/components/dashboard/metric-row";
import { ChartPanel, RangeSelect } from "@/components/dashboard/panel";
import type { DashboardRange, NameValue } from "@/components/dashboard/types";
import { useDashboardCharts, useDashboardStats } from "@/components/dashboard/use-dashboard";
import { useProjects, type Project } from "@/components/common";

/** Top projects by task count, as a `{name,value}[]` the ranked bar can take. */
function byTaskCount(projects: Project[], limit = 8): NameValue[] {
  return projects
    .filter((p) => p.taskCount > 0)
    .sort((a, b) => b.taskCount - a.taskCount)
    .slice(0, limit)
    .map((p) => ({ name: p.name, value: p.taskCount }));
}

/** The `/analytics` island: one screen, one surface (`frame`). */
export function AnalyticsView() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const stats = useDashboardStats(range);
  const charts = useDashboardCharts(range);
  const projects = useProjects();

  const perProject = byTaskCount(projects.projects);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex justify-end">
        <RangeSelect value={range} onChange={setRange} />
      </div>

      <MetricRow
        stats={stats.data}
        loading={stats.loading}
        error={stats.error}
        onRetry={stats.reload}
      />

      <Frame>
        <ChartPanel
          title="Created vs. completed"
          description="Daily task flow across the selected window."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <TasksOverTimeChart data={charts.data?.tasksOverTime ?? []} />
        </ChartPanel>
      </Frame>

      <FrameGrid cols="lg:grid-cols-2">
        <ChartPanel
          title="Throughput"
          description="Tasks completed per day."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <ThroughputChart data={charts.data?.throughput ?? []} />
        </ChartPanel>

        <ChartPanel
          title="Tasks by priority"
          description="Ranked by count across every project."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <RankedBarChart data={charts.data?.tasksByPriority ?? []} label="Tasks" />
        </ChartPanel>

        <ChartPanel
          title="Projects by status"
          description="Lifecycle distribution of every project."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <RankedBarChart data={charts.data?.projectsByStatus ?? []} label="Projects" />
        </ChartPanel>

        <ChartPanel
          title="Busiest projects"
          description="Task count per project, from the projects list."
          loading={projects.loading}
          error={projects.error}
          onRetry={projects.reload}
        >
          <RankedBarChart
            data={perProject}
            label="Tasks"
            height={Math.max(180, perProject.length * 30)}
          />
        </ChartPanel>
      </FrameGrid>
    </div>
  );
}
