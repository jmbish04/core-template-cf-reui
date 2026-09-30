/**
 * @fileoverview Transcript — `ChatMessage[]` plus the streaming `pending`
 * string, rendered as the ReUI message/bubble primitives.
 *
 * One component owns the conversation body for every `/chat/*` surface, so the
 * turns, the in-flight caret, the Stop control and the per-reply receipt read
 * the same everywhere. The surfaces differ in the chrome around it, not in how
 * a turn looks.
 *
 * Assistant bodies carry `data-answer-body`, which is the hook `SelectionQuote`
 * (used by `/chat/sidebar`) anchors its quote pill to. Keep the attribute.
 *
 * Two pieces here are exported on their own because the other chat surfaces
 * need exactly them: `ReasoningFold` (the thinking channel, which streams
 * separately from the answer and must NEVER be concatenated into it) and
 * `TurnReceipt` (model, latency, tokens from the completed turn).
 */
import { useState, type ReactNode } from "react";

import type { ChatMessage, ChatUsage, RoutedTo } from "@/lib/chat";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BrainIcon, CheckIcon, ChevronRightIcon, CopyIcon, SparklesIcon, SquareIcon } from "lucide-react";

import { ReplyReceipt } from "./routing-picker";

// ---------------------------------------------------------------------------
// Reusable pieces (surfaces 5–12 import these directly)
// ---------------------------------------------------------------------------

export interface ReasoningFoldProps {
  /** The `reasoning` channel from `useChatThread`. Never the answer text. */
  reasoning: string;
  /** True while the turn is still running — the fold then shows it is live. */
  live?: boolean;
  /** Open on first render. Default closed: thinking is secondary to the answer. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * The model's thinking, in a fold above the answer.
 *
 * The default route is a reasoning model whose thinking streams on its own SSE
 * channel. It is genuinely separate content, so it gets its own disclosure and
 * is never concatenated into the reply.
 *
 * @param props The reasoning text and whether the turn is still running.
 * @returns The fold, or null when the model did not think out loud.
 */
export function ReasoningFold({ reasoning, live = false, defaultOpen = false, className }: ReasoningFoldProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!reasoning.trim()) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full min-w-0", className)}>
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
          />
        }
      >
        <BrainIcon aria-hidden="true" />
        <span className={live ? "shimmer" : undefined}>{live ? "Thinking" : "Thought process"}</span>
        <ChevronRightIcon
          aria-hidden="true"
          data-icon="inline-end"
          className={cn("transition-transform", open && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-border/60 text-muted-foreground mt-1 max-h-64 overflow-y-auto border-s ps-3 text-xs leading-6 whitespace-pre-wrap">
          {reasoning}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export interface TurnReceiptProps {
  routed?: RoutedTo | null;
  /** Wall-clock time of the completed turn, in ms. */
  latencyMs?: number | null;
  usage?: ChatUsage | null;
  /**
   * The persisted row to fall back on.
   *
   * Latency and token counts arrive on the stream, so a RELOADED conversation
   * has none of them in memory — which used to blank every receipt, on two
   * surfaces whose whole purpose is showing them. They are columns now, and
   * this is where a resumed turn gets them back.
   */
  message?: Pick<ChatMessage, "model" | "latencyMs" | "promptTokens" | "completionTokens"> | null;
  /**
   * Include the model name. Turn it off where the surface already names the
   * model elsewhere in its chrome, so the receipt does not say it twice.
   */
  showModel?: boolean;
  className?: string;
}

/**
 * Model, latency and token counts for one completed turn.
 *
 * Every field is omitted when the router did not report it — an absent token
 * count means "not reported", never zero.
 *
 * @param props The `routed` / `latencyMs` / `usage` values from `useChatThread`.
 * @returns A muted meta row, or null when nothing was reported.
 */
export function TurnReceipt({
  routed,
  latencyMs,
  usage,
  message,
  showModel = true,
  className,
}: TurnReceiptProps) {
  // Live stream values win; the row is the fallback for a resumed turn.
  const model = routed?.model ?? message?.model ?? null;
  const ms = latencyMs ?? message?.latencyMs ?? null;
  const tokens =
    usage?.totalTokens ??
    (message?.promptTokens != null || message?.completionTokens != null
      ? (message.promptTokens ?? 0) + (message.completionTokens ?? 0)
      : null);

  const parts: string[] = [];
  if (showModel && model) parts.push(model);
  if (ms != null) parts.push(ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  if (tokens != null) parts.push(`${tokens.toLocaleString()} tokens`);
  if (parts.length === 0) return null;

  return (
    <span className={cn("text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs", className)}>
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="bg-muted-foreground/40 inline-block size-1 rounded-full" />
          )}
          <span className="tabular-nums">{part}</span>
        </span>
      ))}
    </span>
  );
}

/** Copy one message body. Silent on failure — clipboard access can be denied. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: (text: string) => {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => undefined);
    },
  };
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy();
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} onClick={() => copy(text)}>
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
    </Button>
  );
}

function AssistantTurn({
  message,
  actions,
  receipt,
  renderBody,
}: {
  message: ChatMessage;
  actions?: ReactNode;
  /** Live-stream facts for the most recent turn only; not persisted in D1. */
  receipt?: ReactNode;
  renderBody?: RenderBody;
}) {
  return (
    <Message role="group" aria-label="Assistant" className="group/turn">
      <MessageAvatar className="translate-y-0! self-start">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>

      <MessageContent className="min-w-0 gap-1">
        <Bubble variant="ghost" className="w-full min-w-0">
          <BubbleContent className="min-w-0">
            {/* The quote pill in /chat/sidebar looks for this attribute. */}
            <div data-answer-body>
              {renderBody ? renderBody(message.content, false) : <Markdown>{message.content}</Markdown>}
            </div>
          </BubbleContent>
        </Bubble>

        <MessageFooter className="flex-wrap gap-1">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
          <ReplyReceipt message={message} />
          {receipt}
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/turn:opacity-100 focus-within:opacity-100 max-md:opacity-100">
            <CopyButton text={message.content} label="Copy reply" />
            {actions}
          </span>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function UserTurn({ message }: { message: ChatMessage }) {
  return (
    <Message align="end" role="group" aria-label="You" className="group/turn">
      <MessageAvatar>
        <Avatar>
          <AvatarFallback className="text-xs">You</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-1">
        <BubbleGroup className="w-full items-end">
          <Bubble variant="muted" align="end">
            <BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent>
          </Bubble>
        </BubbleGroup>
        <MessageFooter className="gap-0.5 pe-0">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

/**
 * Render an assistant reply's body.
 *
 * Exists so a surface whose answers are not plain markdown — a structured
 * answer, a framed receipt, a code artifact — can reuse this transcript rather
 * than copy its whole structure. `streaming` is true for the in-flight reply,
 * so a parser can degrade to prose while the text is still half-written
 * instead of blanking the bubble.
 *
 * @param content The reply text so far.
 * @param streaming Whether this body is the turn still arriving.
 */
export type RenderBody = (content: string, streaming: boolean) => ReactNode;

export interface TranscriptProps {
  messages: ChatMessage[];
  /** Text streaming in for the in-flight reply, or "" when idle. */
  pending: string;
  /** The in-flight turn's thinking channel. Never appended to `pending`. */
  reasoning?: string;
  /** Provider/model the router picked for the current or last turn. */
  routed?: RoutedTo | null;
  /** Latency of the last completed turn, in ms. */
  latencyMs?: number | null;
  /** Token counts for the last completed turn, when reported. */
  usage?: ChatUsage | null;
  streaming: boolean;
  /** True while the thread's history is being read from D1. */
  loading?: boolean;
  /** Abort the in-flight reply. Rendered as a Stop control while streaming. */
  onStop: () => void;
  /** Extra controls beside the copy button on each settled assistant reply. */
  replyActions?: (message: ChatMessage) => ReactNode;
  /** Shown instead of the turns when the thread is empty. */
  empty?: ReactNode;
  /** Replace the markdown renderer for assistant bodies. */
  renderBody?: RenderBody;
  className?: string;
  /** Classes for the scrolling column (width, padding). */
  contentClassName?: string;
}

/**
 * Render one thread's turns, the streaming reply and the Stop control.
 *
 * @param props Turns from D1 plus the live stream state.
 * @returns The scrolling conversation body.
 */
export function Transcript({
  messages,
  pending,
  reasoning = "",
  routed = null,
  latencyMs = null,
  usage = null,
  streaming,
  loading = false,
  onStop,
  replyActions,
  empty,
  renderBody,
  className,
  contentClassName,
}: TranscriptProps) {
  // Every assistant turn carries its OWN receipt, because latency and token
  // counts are columns now. Only the newest gets the live stream values laid
  // over the top — an older turn reads its own row and never borrows this
  // one's, which is what the previous newest-only rule existed to prevent.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  if (loading && messages.length === 0) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col gap-6 p-6", className)} aria-hidden="true">
        <Skeleton className="h-16 w-3/4 self-end" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-2/3 self-end" />
      </div>
    );
  }

  if (messages.length === 0 && !streaming && empty) {
    return <div className={cn("flex min-h-0 flex-1 flex-col", className)}>{empty}</div>;
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={cn("min-h-0 flex-1", className)}>
        <MessageScrollerViewport className="scrollbar">
          <MessageScrollerContent
            aria-busy={streaming}
            className={cn("mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6", contentClassName)}
          >
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                className="animate-in fade-in-0 duration-300 ease-out [content-visibility:visible] motion-reduce:animate-none"
              >
                {message.role === "user" ? (
                  <UserTurn message={message} />
                ) : (
                  <AssistantTurn
                    renderBody={renderBody}
                    message={message}
                    actions={replyActions?.(message)}
                    receipt={
                      message.id === lastAssistantId && !streaming ? (
                        <TurnReceipt latencyMs={latencyMs} usage={usage} message={message} />
                      ) : (
                        <TurnReceipt message={message} />
                      )
                    }
                  />
                )}
              </MessageScrollerItem>
            ))}

            {/* The in-flight reply. Before the first token lands there is no
                text to show, so the wait is a marker rather than an empty
                bubble that reads as a failed answer. */}
            {streaming && (
              <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                <Message role="group" aria-label="Assistant" className="group/turn">
                  <MessageAvatar className="translate-y-0! self-start">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        <SparklesIcon className="size-3.5" aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent className="min-w-0 gap-1">
                    {/* The thinking channel, above the answer and separate from
                        it. `live` while the answer has not started. */}
                    <ReasoningFold reasoning={reasoning} live={!pending} defaultOpen={!pending} />

                    {pending ? (
                      <Bubble variant="ghost" className="w-full min-w-0">
                        <BubbleContent className="min-w-0">
                          <div data-answer-body>
                            {renderBody ? renderBody(pending, true) : <Markdown>{pending}</Markdown>}
                          </div>
                        </BubbleContent>
                      </Bubble>
                    ) : reasoning ? null : (
                      <Marker>
                        <MarkerIcon>
                          <Spinner />
                        </MarkerIcon>
                        <MarkerContent className="shimmer">
                          {routed?.model ? `Routing to ${routed.model}` : "Thinking"}
                        </MarkerContent>
                      </Marker>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            )}

            {streaming && (
              <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={onStop} className="gap-1.5 rounded-full">
                    <SquareIcon className="size-3 fill-current" aria-hidden="true" />
                    Stop
                  </Button>
                </div>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>

        {/* aria-busy silences the log, so the wait is announced from outside it. */}
        <p role="status" aria-live="polite" className="sr-only">
          {streaming ? "Generating a reply" : ""}
        </p>

        <MessageScrollerButton variant="outline" size="icon-sm" className="bottom-4 rounded-full shadow-sm" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
