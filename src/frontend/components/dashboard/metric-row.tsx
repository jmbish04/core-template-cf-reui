/**
 * @fileoverview MetricRow — the five-tile stat header shared by `/dashboard`,
 * `/analytics` and `/` (Overview).
 *
 * Built from the ReUI `Frame` + `IconTile` grammar, so it inherits the frame
 * surface the rest of each screen holds. Every number comes from
 * `GET /api/dashboard/stats`; there is no decorative delta or sparkline,
 * because the endpoint supplies no prior-period figure to compute one from.
 */

import {
  BellIcon,
  CircleCheckBigIcon,
  FolderKanbanIcon,
  ListChecksIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { FramePanel } from "@/components/reui/frame";
import { FrameGrid } from "@/components/dashboard/frame-grid";
import { IconTile } from "@/components/reui/icon-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common";
import type { DashboardStats } from "@/components/dashboard/types";
import { compactNumber } from "@/lib/format";

interface Metric {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  /** Token-based text colour driving the IconTile's `soft` tint. */
  tone?: string;
}

/**
 * Derive the five displayed metrics from the raw stats payload.
 *
 * @param stats Response of `GET /api/dashboard/stats`.
 * @returns Display-ready metric descriptors, in reading order.
 */
function toMetrics(stats: DashboardStats): Metric[] {
  return [
    {
      key: "projects",
      label: "Projects",
      value: compactNumber(stats.totalProjects),
      caption: `${stats.activeProjects} active`,
      icon: FolderKanbanIcon,
    },
    {
      key: "tasks",
      label: "Tasks",
      value: compactNumber(stats.totalTasks),
      caption: `${stats.completedTasks} completed`,
      icon: ListChecksIcon,
    },
    {
      key: "completion",
      label: "Completion",
      value: `${stats.completionRatePct}%`,
      caption: "of all tasks done",
      icon: CircleCheckBigIcon,
      tone: "text-success",
    },
    {
      key: "overdue",
      label: "Overdue",
      value: compactNumber(stats.overdueTasks),
      caption: "past due, not done",
      icon: TriangleAlertIcon,
      tone: stats.overdueTasks > 0 ? "text-destructive" : undefined,
    },
    {
      key: "unread",
      label: "Unread",
      value: compactNumber(stats.unreadNotifications),
      caption: "notifications waiting",
      icon: BellIcon,
    },
  ];
}

/**
 * Render the metric row, or its loading / error stand-in.
 *
 * @param stats Stats payload, or null while loading or after a failure.
 * @param loading Whether the request is still in flight.
 * @param error Message from a failed request, if any.
 * @param onRetry Re-issues the request.
 */
export function MetricRow({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  const metrics = stats ? toMetrics(stats) : [];

  return (
    <FrameGrid cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {loading || !stats
        ? Array.from({ length: 5 }, (_, i) => (
            <FramePanel key={i} className="flex flex-col gap-3">
              <Skeleton className="size-10 rounded-md" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </FramePanel>
          ))
        : metrics.map((metric) => (
            <FramePanel key={metric.key} className="flex flex-col gap-3">
              <IconTile variant="soft" className={metric.tone}>
                <metric.icon aria-hidden="true" />
              </IconTile>
              <div className="min-w-0 space-y-0.5">
                <p className="text-muted-foreground text-xs font-medium">{metric.label}</p>
                <p className="text-2xl leading-tight font-semibold tabular-nums">{metric.value}</p>
                <p className="text-muted-foreground truncate text-xs">{metric.caption}</p>
              </div>
            </FramePanel>
          ))}
    </FrameGrid>
  );
}
