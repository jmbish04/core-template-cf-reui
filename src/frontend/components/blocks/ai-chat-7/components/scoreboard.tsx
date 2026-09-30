/**
 * @fileoverview The mirrored scoreboard: two sets of meters meeting at a
 * centre column, settling into a verdict and an A/B pick.
 *
 * Kept from ReUI `ai-chat-7` — the paired bars anchored at the divider, the
 * lead emphasis, and the collapse to one delta line. The numbers are the real
 * ones (see `pane-metrics.ts`). The pick is a LOCAL preference: this template
 * has no votes table and nothing is posted, so the label says so rather than
 * implying a record was kept.
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import {
  formatCost,
  formatLatency,
  formatRate,
  formatTokens,
  verdictLine,
  type PaneMetrics,
} from "./pane-metrics";

export type Side = "a" | "b";

interface MeterRow {
  label: string;
  a: number | null;
  b: number | null;
  format: (value: number | null) => string;
  /** Latency and cost read better low; rate and tokens read better high. */
  lowerLeads: boolean;
}

function meterRows(a: PaneMetrics, b: PaneMetrics): MeterRow[] {
  return [
    { label: "latency", a: a.latencyMs, b: b.latencyMs, format: formatLatency, lowerLeads: true },
    { label: "tok/s", a: a.rate, b: b.rate, format: formatRate, lowerLeads: false },
    { label: "tokens", a: a.totalTokens, b: b.totalTokens, format: formatTokens, lowerLeads: false },
    { label: "cost", a: a.costUsd, b: b.costUsd, format: formatCost, lowerLeads: true },
  ];
}

function leads(row: MeterRow, side: Side): boolean {
  if (row.a == null || row.b == null || row.a === row.b) return false;
  const mine = side === "a" ? row.a : row.b;
  const theirs = side === "a" ? row.b : row.a;
  return row.lowerLeads ? mine < theirs : mine > theirs;
}

/** One half of a paired meter: the bar is anchored at the divider and fills outward. */
function MeterCell({ side, row }: { side: Side; row: MeterRow }) {
  const value = side === "a" ? row.a : row.b;
  const ahead = leads(row, side);
  const max = Math.max(row.a ?? 0, row.b ?? 0);
  const fill = value != null && max > 0 ? value / max : 0;

  const label = (
    <span className={cn("shrink-0 text-xs tabular-nums", ahead ? "text-foreground font-medium" : "text-muted-foreground")}>
      {row.format(value)}
    </span>
  );

  return (
    <div className={cn("flex h-4 min-w-0 items-center gap-2", side === "a" ? "justify-end" : "justify-start")}>
      {side === "a" ? label : null}
      <span aria-hidden="true" className="bg-muted h-1 w-full max-w-28 flex-1 overflow-hidden rounded-full">
        <span
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, fill))})` }}
          className={cn(
            "block h-full w-full",
            side === "a" ? "origin-right" : "origin-left",
            ahead ? "bg-foreground/70" : "bg-muted-foreground/40",
          )}
        />
      </span>
      {side === "b" ? label : null}
    </div>
  );
}

export interface ScoreboardProps {
  left: { label: string; metrics: PaneMetrics };
  right: { label: string; metrics: PaneMetrics };
  /** True while either pane is still streaming — the meters stay live. */
  streaming: boolean;
  vote: Side | null;
  onVote: (side: Side | null) => void;
}

/**
 * Render the scoreboard for the current exchange.
 *
 * @param props Both panes' labelled metrics, the live flag and the pick.
 * @returns The meters while streaming, the verdict once both have settled.
 */
export function Scoreboard({ left, right, streaming, vote, onVote }: ScoreboardProps) {
  const rows = meterRows(left.metrics, right.metrics);
  const verdict = streaming ? null : verdictLine(left, right);

  if (verdict) {
    return (
      <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-2">
        <p role="status" className="text-sm tabular-nums">
          {verdict}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">Your pick (kept on this screen only)</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Prefer an answer"
            value={vote ? [vote] : []}
            onValueChange={(group) => onVote((group[0] as Side | undefined) ?? null)}
          >
            <ToggleGroupItem value="a">
              <span className="max-w-36 truncate">{left.label}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="b">
              <span className="max-w-36 truncate">{right.label}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center gap-x-3 border-t px-4 py-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-muted-foreground truncate text-end text-xs">{left.label}</span>
        {rows.map((row) => (
          <MeterCell key={row.label} side="a" row={row} />
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="h-4" />
        {rows.map((row) => (
          <span key={row.label} className="text-muted-foreground flex h-4 w-14 items-center justify-center text-xs">
            {row.label}
          </span>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-muted-foreground truncate text-xs">{right.label}</span>
        {rows.map((row) => (
          <MeterCell key={row.label} side="b" row={row} />
        ))}
      </div>
    </div>
  );
}
