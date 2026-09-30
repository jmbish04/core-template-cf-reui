/**
 * @fileoverview The support panel's transcript.
 *
 * A question is a bubble. An answer carries its retrieval receipt above it, and
 * is either the answer itself or — when the model reported the articles did not
 * cover the question — the not-covered card with its real ticket action.
 */
import { ReasoningFold } from "@/components/chat";
import type { ChatMessage } from "@/lib/chat";
import { relativeTime } from "@/lib/format";

import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { SquareIcon } from "lucide-react";

import { citedArticles, isNotCovered, NOT_COVERED, type Article } from "./knowledge-base";
import { RetrievalLive, RetrievalReceipt } from "./retrieval-trace";
import { NotCovered } from "./support-ticket";
import type { RetrievalPhase } from "./use-retrieval";

/** The question a reply answered: the user turn directly above it. */
function askAbove(messages: ChatMessage[], index: number): string {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (messages[at]!.role === "user") return messages[at]!.content;
  }
  return "";
}

function Answer({
  message,
  question,
  articles,
  read,
}: {
  message: ChatMessage;
  question: string;
  /** The whole knowledge base, used to resolve the reply's own citations. */
  articles: Article[];
  /** What was read for this turn, when it ran in this session. */
  read: Article[];
}) {
  const used = citedArticles(message.content, articles);
  const covered = !isNotCovered(message.content);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <RetrievalReceipt read={read} used={used} />

      {covered ? (
        <div data-answer-body>
          <Markdown>{message.content}</Markdown>
        </div>
      ) : (
        <NotCovered
          missing={message.content.trimStart().slice(NOT_COVERED.length).trim()}
          question={question}
        />
      )}

      <span className="text-muted-foreground text-xs tabular-nums">
        {relativeTime(message.createdAt)}
      </span>
    </div>
  );
}

export interface AskThreadProps {
  messages: ChatMessage[];
  pending: string;
  reasoning: string;
  streaming: boolean;
  loading: boolean;
  onStop: () => void;
  /** The whole knowledge base, for resolving citations. */
  articles: Article[];
  /** Assistant message id → the articles read for it in this session. */
  reads: Record<string, Article[]>;
  phase: RetrievalPhase;
  matched: Article[];
  readCount: number;
  /** Shown when the search matched nothing at all, before any model call. */
  noMatch: { question: string } | null;
}

/**
 * Render the support conversation.
 *
 * @param props The thread's messages plus the live retrieval and stream state.
 * @returns The scrolling panel body.
 */
export function AskThread({
  messages,
  pending,
  reasoning,
  streaming,
  loading,
  onStop,
  articles,
  reads,
  phase,
  matched,
  readCount,
  noMatch,
}: AskThreadProps) {
  if (loading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" aria-hidden="true">
        <Skeleton className="h-12 w-3/4 self-end" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="scrollbar">
          <MessageScrollerContent
            aria-busy={streaming}
            className="flex w-full min-w-0 flex-col gap-5 px-4 pt-16 pb-4"
          >
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                className="animate-in fade-in-0 duration-300 ease-out [content-visibility:visible] motion-reduce:animate-none"
              >
                {message.role === "user" ? (
                  <BubbleGroup className="w-full items-end">
                    <Bubble variant="muted" align="end">
                      <BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent>
                    </Bubble>
                  </BubbleGroup>
                ) : (
                  <Answer
                    message={message}
                    question={askAbove(messages, index)}
                    articles={articles}
                    read={reads[message.id] ?? []}
                  />
                )}
              </MessageScrollerItem>
            ))}

            {noMatch && (
              <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                <NotCovered
                  missing="Nothing in the knowledge base matched that question, so it was not sent to a model."
                  question={noMatch.question}
                />
              </MessageScrollerItem>
            )}

            {(phase !== "idle" || streaming) && (
              <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                <div className="flex min-w-0 flex-col gap-2">
                  {!pending && <RetrievalLive phase={phase} matched={matched} readCount={readCount} />}
                  <ReasoningFold reasoning={reasoning} live={streaming && !pending} />
                  {pending && (
                    <div data-answer-body>
                      <Markdown>{pending}</Markdown>
                    </div>
                  )}
                  {streaming && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onStop}
                      className="w-fit gap-1.5 rounded-full"
                    >
                      <SquareIcon className="size-3 fill-current" aria-hidden="true" />
                      Stop
                    </Button>
                  )}
                </div>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>

        <p role="status" aria-live="polite" className="sr-only">
          {streaming ? "Writing the answer" : ""}
        </p>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
