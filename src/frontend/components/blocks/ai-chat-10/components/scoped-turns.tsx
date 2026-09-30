/**
 * @fileoverview The transcript for `/chat/scoped`.
 *
 * An ask shows the question, folds away the source excerpts that were carried
 * with it, and states plainly which files were withheld — so the reader can see
 * the same scope the model saw, on a reload as well as live. A reply renders
 * through `StructuredAnswer`.
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
import { EyeOffIcon, FileTextIcon, SparklesIcon, SquareIcon } from "lucide-react";

import { splitScopedMessage } from "./scoped-sources";
import { StructuredAnswer } from "./structured-answer";

function AskTurn({ message }: { message: ChatMessage }) {
  const { sources, withheld, question } = splitScopedMessage(message.content);
  const [open, setOpen] = useState(false);

  return (
    <Message align="end" role="group" aria-label="You">
      <MessageAvatar>
        <Avatar>
          <AvatarFallback className="text-xs">You</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-1">
        <BubbleGroup className="w-full items-end">
          <Bubble variant="muted" align="end">
            <BubbleContent className="whitespace-pre-wrap">{question}</BubbleContent>
          </Bubble>
        </BubbleGroup>

        {withheld.length > 0 && (
          <p className="text-muted-foreground flex flex-wrap items-center justify-end gap-1.5 text-xs">
            <EyeOffIcon className="size-3 shrink-0" aria-hidden="true" />
            Withheld: {withheld.join(", ")}
          </p>
        )}

        {sources && (
          <Collapsible open={open} onOpenChange={setOpen} className="w-full min-w-0">
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground ms-auto h-7 gap-1.5 px-1.5 font-normal [&_svg]:size-3.5"
                />
              }
            >
              <FileTextIcon aria-hidden="true" />
              {open ? "Hide what it was given" : "What it was given to read"}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-border/60 text-muted-foreground mt-1 max-h-64 overflow-y-auto border-s ps-3 text-xs leading-6 whitespace-pre-wrap">
                {sources}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <MessageFooter className="gap-0.5 pe-0">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function ReplyTurn({ message, receipt }: { message: ChatMessage; receipt?: React.ReactNode }) {
  return (
    <Message role="group" aria-label="Assistant">
      <MessageAvatar className="translate-y-0! self-start">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-2">
        <StructuredAnswer content={message.content} />
        <MessageFooter className="flex-wrap gap-1">
          <span className="text-muted-foreground pe-1 text-xs tabular-nums">
            {relativeTime(message.createdAt)}
          </span>
          {receipt}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export interface ScopedTurnsProps {
  messages: ChatMessage[];
  pending: string;
  reasoning: string;
  routed: RoutedTo | null;
  latencyMs: number | null;
  usage: ChatUsage | null;
  streaming: boolean;
  loading: boolean;
  onStop: () => void;
}

/**
 * Render the scoped conversation.
 *
 * @param props The thread's messages plus the live stream state.
 * @returns The scrolling conversation body.
 */
export function ScopedTurns({
  messages,
  pending,
  reasoning,
  routed,
  latencyMs,
  usage,
  streaming,
  loading,
  onStop,
}: ScopedTurnsProps) {
  const lastReplyId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  if (loading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6" aria-hidden="true">
        <Skeleton className="h-14 w-2/3 self-end" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="scrollbar">
          <MessageScrollerContent
            aria-busy={streaming}
            className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6"
          >
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                className="animate-in fade-in-0 duration-300 ease-out [content-visibility:visible] motion-reduce:animate-none"
              >
                {message.role === "user" ? (
                  <AskTurn message={message} />
                ) : (
                  <ReplyTurn
                    message={message}
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
                      <StructuredAnswer content={pending} streaming />
                    ) : reasoning ? null : (
                      <Marker>
                        <MarkerIcon>
                          <Spinner />
                        </MarkerIcon>
                        <MarkerContent className="shimmer">
                          {routed?.model ? `Routing to ${routed.model}` : "Reading the sources"}
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
