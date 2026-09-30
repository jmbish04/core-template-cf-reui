/**
 * @fileoverview The branching transcript: asks as bubbles, replies as
 * documents, and the two controls that fork the conversation.
 *
 * This surface does not use the shared `Transcript` because it owns both ends
 * of a turn: a forking ask carries the transcript it was branched from (folded
 * away, see `branching.ts`) and a reply is a document rather than a bubble.
 * Everything else — the thinking channel, the turn receipt, the failure
 * banner — still comes from the shared chat layer.
 */
import { useState } from "react";

import { ReasoningFold, TurnReceipt } from "@/components/chat";
import type { ChatMessage, ChatUsage, RoutedTo } from "@/lib/chat";
import { relativeTime } from "@/lib/format";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Textarea } from "@/components/ui/textarea";
import { GitBranchIcon, PencilIcon, RefreshCwIcon, SparklesIcon, SquareIcon } from "lucide-react";

import { splitForkMessage } from "./branching";
import { citedFileNames, ReplyDocument, SourceRow } from "./reply-document";

/** The carried transcript above a forking ask, folded shut by default. */
function CarriedContext({ context }: { context: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full min-w-0">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
          />
        }
      >
        <GitBranchIcon aria-hidden="true" />
        {open ? "Hide the turns this branch carried" : "Carried from the parent thread"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-border/60 text-muted-foreground mt-1 max-h-56 overflow-y-auto border-s ps-3 text-xs leading-6 whitespace-pre-wrap">
          {context}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AskTurn({
  message,
  onEdit,
}: {
  message: ChatMessage;
  /** Forks the conversation on the rewritten ask. */
  onEdit: (prompt: string) => void;
}) {
  const { context, prompt } = splitForkMessage(message.content);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Message align="end" role="group" aria-label="You" className="group/turn">
      <MessageAvatar>
        <Avatar>
          <AvatarFallback className="text-xs">You</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-1">
        {context && <CarriedContext context={context} />}

        {draft === null ? (
          <BubbleGroup className="w-full items-end">
            <Bubble variant="muted" align="end">
              <BubbleContent className="whitespace-pre-wrap">{prompt}</BubbleContent>
            </Bubble>
          </BubbleGroup>
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-2">
            <Textarea
              autoFocus
              rows={3}
              aria-label="Rewrite this message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-20"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!draft.trim() || draft.trim() === prompt}
                onClick={() => {
                  const next = draft.trim();
                  setDraft(null);
                  onEdit(next);
                }}
              >
                Ask on a new branch
              </Button>
            </div>
          </div>
        )}

        <MessageFooter className="gap-0.5 pe-0">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
          {draft === null && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit this message on a new branch"
              onClick={() => setDraft(prompt)}
              className="opacity-0 transition-opacity group-hover/turn:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            >
              <PencilIcon aria-hidden="true" />
            </Button>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function ReplyTurn({
  message,
  sources,
  receipt,
  onRegenerate,
}: {
  message: ChatMessage;
  sources: string[];
  receipt?: React.ReactNode;
  onRegenerate: () => void;
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

      <MessageContent className="min-w-0 gap-2">
        <ReplyDocument content={message.content} />
        <SourceRow names={sources} />

        <MessageFooter className="flex-wrap gap-1">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
          {receipt}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            className="text-muted-foreground h-7 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
          >
            <RefreshCwIcon aria-hidden="true" />
            Regenerate on a branch
          </Button>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export interface TurnListProps {
  messages: ChatMessage[];
  pending: string;
  reasoning: string;
  routed: RoutedTo | null;
  latencyMs: number | null;
  usage: ChatUsage | null;
  streaming: boolean;
  loading: boolean;
  onStop: () => void;
  /** Fork this reply's ask onto a new sibling thread. */
  onRegenerate: (replyId: string) => void;
  /** Fork this ask, rewritten, onto a new sibling thread. */
  onEdit: (askId: string, prompt: string) => void;
  empty?: React.ReactNode;
}

/**
 * Render the open branch's turns.
 *
 * @param props The thread's messages plus the live stream state.
 * @returns The scrolling conversation body.
 */
export function TurnList({
  messages,
  pending,
  reasoning,
  routed,
  latencyMs,
  usage,
  streaming,
  loading,
  onStop,
  onRegenerate,
  onEdit,
  empty,
}: TurnListProps) {
  const lastReplyId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  if (loading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6" aria-hidden="true">
        <Skeleton className="h-16 w-3/4 self-end" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (messages.length === 0 && !streaming && empty) {
    return <div className="flex min-h-0 flex-1 flex-col">{empty}</div>;
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="scrollbar">
          <MessageScrollerContent
            aria-busy={streaming}
            className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6"
          >
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                className="animate-in fade-in-0 duration-300 ease-out [content-visibility:visible] motion-reduce:animate-none"
              >
                {message.role === "user" ? (
                  <AskTurn message={message} onEdit={(prompt) => onEdit(message.id, prompt)} />
                ) : (
                  <ReplyTurn
                    message={message}
                    // Only the ask directly above a reply can have carried its
                    // attachments, so that is the only turn worth reading.
                    sources={citedFileNames(messages[index - 1]?.content ?? "")}
                    receipt={
                      // Live stream values only on the newest turn; every
                      // other turn reads its own persisted row, so a reload
                      // does not blank the receipts.
                      message.id === lastReplyId && !streaming ? (
                        <TurnReceipt routed={routed} latencyMs={latencyMs} usage={usage} message={message} />
                      ) : (
                        <TurnReceipt message={message} />
                      )
                    }
                    onRegenerate={() => onRegenerate(message.id)}
                  />
                )}
              </MessageScrollerItem>
            ))}

            {streaming && (
              <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                <Message role="group" aria-label="Assistant">
                  <MessageAvatar className="translate-y-0! self-start">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        <SparklesIcon className="size-3.5" aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent className="min-w-0 gap-2">
                    <ReasoningFold reasoning={reasoning} live={!pending} defaultOpen={!pending} />
                    {pending ? (
                      <ReplyDocument content={pending} streaming />
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

        <p role="status" aria-live="polite" className="sr-only">
          {streaming ? "Generating a reply" : ""}
        </p>

        <MessageScrollerButton variant="outline" size="icon-sm" className="bottom-4 rounded-full shadow-sm" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
