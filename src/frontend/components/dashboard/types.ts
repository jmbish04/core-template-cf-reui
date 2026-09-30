/**
 * @fileoverview Wire types for `/api/dashboard/*`.
 *
 * Mirrors the zod response schemas in `src/backend/api/routes/dashboard.ts`.
 * Kept separate from the hooks so the presentational chart components can be
 * typed without importing fetch logic.
 */

/** `GET /api/dashboard/stats` — the metric row. */
export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  /** Completed / total * 100, one decimal place. */
  completionRatePct: number;
  overdueTasks: number;
  unreadNotifications: number;
}

/** A labelled magnitude — the shape every categorical dataset uses. */
export interface NameValue {
  name: string;
  value: number;
}

/** One day of the created/completed time series. */
export interface TasksOverTimePoint {
  /** YYYY-MM-DD. */
  date: string;
  created: number;
  completed: number;
}

/** One day of completed-task throughput. */
export interface ThroughputPoint {
  date: string;
  value: number;
}

/** `GET /api/dashboard/charts` — every chart dataset in one payload. */
export interface DashboardCharts {
  tasksByStatus: NameValue[];
  tasksByPriority: NameValue[];
  tasksOverTime: TasksOverTimePoint[];
  projectsByStatus: NameValue[];
  throughput: ThroughputPoint[];
}

/** `GET /api/dashboard/insights` — markdown bullets from core-guardian. */
export interface DashboardInsight {
  insight: string;
  /** ISO 8601. */
  generatedAt: string;
}

/** Time window accepted by all three dashboard endpoints. */
export type DashboardRange = "7d" | "30d" | "90d";

/** Options for the range picker, in window order. */
export const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
