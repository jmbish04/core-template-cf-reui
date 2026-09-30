/**
 * @fileoverview The framed receipt one reply renders as, on `/chat/stage`.
 *
 * ReUI `ai-chat-11` gives every answer a chrome bar and a payload strip
 * carrying "the run behind it". This template has no tool-calling layer, so
 * there is no tool log to draw — inventing one would be the single most
 * dishonest thing this surface could do. What there IS, and what the strip
 * shows instead:
 *
 * - the ROUTING DECISION: which provider and model core-guardian picked, which
 *   arrives on the `routed` event before the first token;
 * - the MODEL'S THINKING: the `reasoning` channel, folded. It streams live and
 *   is not persisted, so a settled turn from an earlier session has none, and
 *   the fold simply does not render — an absence, never a placeholder;
 * - the METRICS: prompt/completion/total tokens, latency and the row's own
 *   cost, each omitted when the router did not report it;
 * - the CODE PATCH: any fenced block in the reply, through ReUI's `CodeBlock`.
 */
import { ReasoningFold, ReplyReceipt, TurnReceipt } from "@/components/chat";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { markdownFences } from "@/components/reui/code-block/code-block";
import type { ChatMessage, ChatUsage, RoutedTo } from "@/lib/chat";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Markdown } from "@/components/ui/markdown";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { MessageFooter } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCwIcon } from "lucide-react";

/** Frosted, not opaque: the dot field stays faintly visible under a turn. */
const GLASS = "bg-card/75 backdrop-blur-md";

/** The token counts, as a metric row. Each figure is dropped when unreported. */
function MetricRow({ usage, latencyMs }: { usage: ChatUsage | null; latencyMs: number | null }) {
  const figures: Array<{ label: string; value: string }> = [];
  if (usage) {
    figures.push({ label: "Prompt", value: usage.promptTokens.toLocaleString() });
    figures.push({ label: "Completion", value: usage.completionTokens.toLocaleString() });
    figures.push({ label: "Total", value: usage.totalTokens.toLocaleString() });
  }
  if (latencyMs != null) {
    figures.push({
      label: "Latency",
      value: latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`,
    });
  }
  if (figures.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground truncate text-xs">{figure.label}</dt>
          <dd className="truncate text-base font-semibold tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface AnswerSlabProps {
  /** The settled reply, or null while this turn is still streaming. */
  message: ChatMessage | null;
  /** Streaming answer text. Ignored once `message` is set. */
  pending?: string;
  /** The thinking channel for the live turn. Empty for a settled one. */
  reasoning?: string;
  routed?: RoutedTo | null;
  latencyMs?: number | null;
  usage?: ChatUsage | null;
  streaming?: boolean;
  /** Hides the metric strip without touching the answer. */
  showRunDetails?: boolean;
  /** Ask the same question again, as a new turn. Absent while streaming. */
  onRetry?: () => void;
  className?: string;
}

/**
 * One reply, as a framed receipt carrying the run behind it.
 *
 * @param props The settled message (or the live stream) plus its run facts.
 * @returns The framed answer with its chrome bar and payload strip.
 */
export function AnswerSlab({
  message,
  pending = "",
  reasoning = "",
  routed = null,
  latencyMs = null,
  usage = null,
  streaming = false,
  showRunDetails = true,
  onRetry,
  className,
}: AnswerSlabProps) {
  const body = message?.content ?? pending;
  const parts = markdownFences(body);
  const model = message?.model ?? routed?.model;

  return (
    <div className={cn("group/slab flex flex-col gap-1.5", className)}>
      <Frame dense stacked spacing="sm" className={cn(GLASS, "w-full")} aria-busy={streaming || undefined}>
        <FrameHeader className="flex-row flex-wrap items-center gap-2 py-2">
          <FrameTitle className="truncate">Assistant</FrameTitle>
          {model && (
            <>
              <span aria-hidden="true" className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
              <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">{model}</span>
            </>
          )}
          {showRunDetails && !streaming && (
            <span className="ms-auto shrink-0">
              {/* The chrome bar already names the model, so neither receipt
                  repeats it. A settled turn reads its own persisted columns —
                  latency and tokens survive a reload now — and ReplyReceipt
                  adds the cost the router reported. */}
              {message ? (
                <span className="flex items-center gap-1.5">
                  <TurnReceipt message={message} showModel={false} />
                  <ReplyReceipt message={{ ...message, model: null }} />
                </span>
              ) : (
                <TurnReceipt routed={routed} latencyMs={latencyMs} usage={usage} showModel={false} />
              )}
            </span>
          )}
        </FrameHeader>

        <FramePanel className="flex flex-col gap-3">
          {reasoning && <ReasoningFold reasoning={reasoning} live={streaming} defaultOpen={!body} />}

          {body ? (
            <div data-answer-body className="flex min-w-0 flex-col gap-3">
              {parts.map((part, index) =>
                part.type === "code" ? (
                  <CodeBlock
                    key={index}
                    code={part.content}
                    language={part.language ?? "txt"}
                    maxLines={streaming && part.open ? undefined : 24}
                  />
                ) : (
                  <Markdown key={index}>{part.content}</Markdown>
                ),
              )}
            </div>
          ) : reasoning ? null : (
            <Marker role="status">
              <MarkerIcon>
                <Spinner className="size-3.5" />
              </MarkerIcon>
              <MarkerContent className="shimmer text-muted-foreground text-sm">
                {routed?.model ? `Routed to ${routed.model}` : "Choosing a model"}
              </MarkerContent>
            </Marker>
          )}
        </FramePanel>

        {showRunDetails && !streaming && (usage || latencyMs != null) && (
          <FramePanel className="bg-muted/40">
            <MetricRow usage={usage} latencyMs={latencyMs} />
          </FramePanel>
        )}
      </Frame>

      {message && (
        <MessageFooter className="gap-1 opacity-0 transition-opacity group-focus-within/slab:opacity-100 group-hover/slab:opacity-100 max-md:opacity-100">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="text-muted-foreground h-7 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
            >
              <RefreshCwIcon aria-hidden="true" />
              Ask again
            </Button>
          )}
        </MessageFooter>
      )}
    </div>
  );
}
