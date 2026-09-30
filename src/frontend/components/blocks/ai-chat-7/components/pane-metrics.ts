/**
 * @fileoverview What each pane actually measured, and how the scoreboard
 * formats it.
 *
 * ReUI `ai-chat-7` computes its meters from a scripted per-model token rate
 * and a price table baked into `data.ts`. Every number here comes off the
 * wire.
 *
 * The LIVE stream values win, and the PERSISTED ROW is the fallback. That
 * matters because a comparison is resumable — `?a` and `?b` bring both threads
 * back — and a scoreboard of em-dashes on a resumed comparison would empty the
 * one thing this surface exists to show. Latency and token counts are columns
 * on `chat_messages` for exactly this reason.
 *
 * A field the router did not report stays `null` and renders as a dash — never
 * as zero, which would read as free or instant.
 */
import type { ChatMessage, ChatUsage, RoutedTo } from "@/lib/chat";

export interface PaneMetrics {
  model: string | null;
  provider: string | null;
  latencyMs: number | null;
  /** Completion tokens per second, when both inputs were reported. */
  rate: number | null;
  totalTokens: number | null;
  /** What the router charged for the last reply, when it said. */
  costUsd: number | null;
}

export interface PaneSource {
  routed: RoutedTo | null;
  latencyMs: number | null;
  usage: ChatUsage | null;
  messages: ChatMessage[];
}

/**
 * Read one pane's metrics off its chat state.
 *
 * @param pane The pane's `useChatThread` values.
 * @returns The measured metrics, with nulls where nothing was reported.
 */
export function paneMetrics(pane: PaneSource): PaneMetrics {
  const lastReply = [...pane.messages].reverse().find((message) => message.role === "assistant");

  const latencyMs = pane.latencyMs ?? lastReply?.latencyMs ?? null;
  const completionTokens = pane.usage?.completionTokens ?? lastReply?.completionTokens ?? null;
  const totalTokens =
    pane.usage?.totalTokens ??
    (lastReply && (lastReply.promptTokens != null || lastReply.completionTokens != null)
      ? (lastReply.promptTokens ?? 0) + (lastReply.completionTokens ?? 0)
      : null);

  // Both inputs, or nothing: a rate computed from one measured number and one
  // assumed zero is a fabrication that reads like a measurement.
  const rate =
    completionTokens != null && latencyMs != null && latencyMs > 0
      ? completionTokens / (latencyMs / 1000)
      : null;

  return {
    model: pane.routed?.model ?? lastReply?.model ?? null,
    provider: pane.routed?.provider ?? lastReply?.provider ?? null,
    latencyMs,
    rate,
    totalTokens,
    costUsd: lastReply?.costUsd ?? null,
  };
}

/** Seconds to one decimal, which is the resolution a reader can act on. */
export function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function formatRate(rate: number | null): string {
  return rate == null ? "—" : rate.toFixed(0);
}

export function formatTokens(tokens: number | null): string {
  return tokens == null ? "—" : tokens.toLocaleString();
}

export function formatCost(cost: number | null): string {
  if (cost == null) return "—";
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

/**
 * The one-line verdict once both panes have settled.
 *
 * @param a Left pane metrics, with its profile label.
 * @param b Right pane metrics.
 * @returns A sentence, or null when there is nothing comparable yet.
 */
export function verdictLine(
  a: { label: string; metrics: PaneMetrics },
  b: { label: string; metrics: PaneMetrics },
): string | null {
  const latA = a.metrics.latencyMs;
  const latB = b.metrics.latencyMs;
  if (latA == null && latB == null) return null;
  if (latA == null || latB == null) {
    const only = latA == null ? b : a;
    return `Only ${only.label} answered, in ${formatLatency(only.metrics.latencyMs)}`;
  }

  const faster = latA <= latB ? a : b;
  const slower = faster === a ? b : a;
  const gap = (slower.metrics.latencyMs! - faster.metrics.latencyMs!) / 1000;
  const speed = gap < 0.05 ? "matched on speed" : `${gap.toFixed(1)}s faster`;

  const costA = a.metrics.costUsd;
  const costB = b.metrics.costUsd;
  if (costA == null || costB == null) return `${faster.label}: ${speed}`;
  const costGap = faster.metrics.costUsd! - slower.metrics.costUsd!;
  const cost =
    Math.abs(costGap) < 0.00005 ? "same cost" : `${formatCost(Math.abs(costGap))} ${costGap > 0 ? "more" : "less"}`;
  return `${faster.label}: ${speed}, ${cost}`;
}
