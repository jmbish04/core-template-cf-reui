/**
 * @fileoverview The three chart shapes the dashboard surfaces use, all through
 * the shadcn `ChartContainer` wrapper and the OKLCH `--chart-1..5` palette.
 *
 * HARD RULE: no pie or donut charts. `GET /api/dashboard/charts` returns
 * `tasksByStatus` documented as "for a pie chart" — it is rendered here as a
 * horizontal ranked bar instead. Bars run horizontally unless the x-axis is
 * time, which is why only the two date-indexed charts are vertical.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/common";
import type { NameValue, TasksOverTimePoint, ThroughputPoint } from "@/components/dashboard/types";
import { shortDate } from "@/lib/format";

/** The five palette slots, used strictly in order. */
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Shared placeholder for a dataset the API returned empty. */
function NoData({ label }: { label: string }) {
  return (
    <EmptyState
      title="Nothing to chart yet"
      description={`${label} has no rows for this window.`}
      className="py-10"
    />
  );
}

/**
 * Horizontal ranked bar chart — the replacement for every "pie" dataset.
 *
 * Rows are sorted by magnitude and coloured `chart-1..5` in rank order, so the
 * colour itself carries the ranking.
 *
 * @param data Categorical rows from any `{name,value}[]` dataset.
 * @param label Series label shown in the tooltip and the empty state.
 * @param height Plot height in pixels; scale it with the row count.
 */
export function RankedBarChart({
  data,
  label,
  height = 220,
}: {
  data: NameValue[];
  label: string;
  height?: number;
}) {
  if (data.length === 0) return <NoData label={label} />;

  const rows = [...data].sort((a, b) => b.value - a.value);
  const config = { value: { label } } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        <Bar dataKey="value" radius={4} barSize={18}>
          {rows.map((row, index) => (
            <Cell key={row.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Format a `YYYY-MM-DD` axis tick as a short absolute date. */
const dateTick = (value: string) => shortDate(`${value}T00:00:00Z`);

/**
 * Created vs. completed tasks per day — x-axis is time, so this one is vertical.
 *
 * @param data Daily points from `charts.tasksOverTime`.
 */
export function TasksOverTimeChart({ data }: { data: TasksOverTimePoint[] }) {
  if (data.length === 0) return <NoData label="Task activity" />;

  const config = {
    created: { label: "Created", color: PALETTE[0] },
    completed: { label: "Completed", color: PALETTE[1] },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={dateTick}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={dateTick} />} />
        <Area
          dataKey="created"
          type="monotone"
          stroke="var(--color-created)"
          fill="var(--color-created)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          dataKey="completed"
          type="monotone"
          stroke="var(--color-completed)"
          fill="var(--color-completed)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * Completed tasks per day — x-axis is time, so the bars stand vertically.
 *
 * @param data Daily points from `charts.throughput`.
 */
export function ThroughputChart({ data }: { data: ThroughputPoint[] }) {
  if (data.length === 0) return <NoData label="Throughput" />;

  const config = { value: { label: "Completed", color: PALETTE[2] } } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      {/* ui-guard-allow no-vertical-bar: x-axis is a daily time series */}
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={dateTick}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={dateTick} />} cursor={false} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
