/**
 * @fileoverview `/dashboard` — the summary cut: metric row, the task-status
 * breakdown as a horizontal ranked bar (never a pie), throughput over the
 * window, and the core-guardian insight.
 *
 * The insight endpoint routes through the `CORE_GUARDIAN` service binding and
 * can come back as a plain-language error (router 422 = no model in budget,
 * 429 = breaker). That message is rendered in place — the panel is never left
 * blank.
 */

import { useState } from "react";

import { Frame } from "@/components/reui/frame";
import { FrameGrid } from "@/components/dashboard/frame-grid";
import { Markdown } from "@/components/ui/markdown";
import { RankedBarChart, ThroughputChart } from "@/components/dashboard/charts";
import { MetricRow } from "@/components/dashboard/metric-row";
import { ChartPanel, RangeSelect } from "@/components/dashboard/panel";
import type { DashboardRange } from "@/components/dashboard/types";
import {
  useDashboardCharts,
  useDashboardInsight,
  useDashboardStats,
} from "@/components/dashboard/use-dashboard";
import { relativeTime } from "@/lib/format";

/** The `/dashboard` island: one screen, one surface (`frame`). */
export function DashboardView() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const stats = useDashboardStats(range);
  const charts = useDashboardCharts(range);
  const insight = useDashboardInsight(range);

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

      <FrameGrid cols="lg:grid-cols-2">
        <ChartPanel
          title="Tasks by status"
          description="Ranked by count across every project."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <RankedBarChart data={charts.data?.tasksByStatus ?? []} label="Tasks" />
        </ChartPanel>

        <ChartPanel
          title="Completed per day"
          description="Tasks finished inside the selected window."
          loading={charts.loading}
          error={charts.error}
          onRetry={charts.reload}
        >
          <ThroughputChart data={charts.data?.throughput ?? []} />
        </ChartPanel>
      </FrameGrid>

      <Frame>
        <ChartPanel
          title="Insight"
          description={
            insight.data
              ? `Generated ${relativeTime(insight.data.generatedAt)} by core-guardian.`
              : "Written by core-guardian over the current figures."
          }
          loading={insight.loading}
          error={insight.error}
          onRetry={insight.reload}
        >
          {insight.data ? (
            <Markdown className="text-sm">{insight.data.insight}</Markdown>
          ) : null}
        </ChartPanel>
      </Frame>
    </div>
  );
}
