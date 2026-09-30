/**
 * @fileoverview `/chat/stage` — ReUI `ai-chat-11`, wired to core-guardian.
 *
 * A chat surface on an animated dot field. Asks stay bubbles; every reply
 * renders as a framed receipt carrying the run behind it, with the model,
 * latency and token cost in its chrome bar. All of those are real values off
 * the stream — see `answer-slab.tsx` for what the payload strip can and cannot
 * honestly show.
 *
 * Streaming, Stop, Ask again, thread switching and the scoped source picker are
 * all live against the same endpoints every other surface uses.
 */
import { useState } from "react";

import {
  AttachmentChips,
  AttachmentPicker,
  ChatComposer,
  ChatErrorBanner,
  describeAttachments,
  useThreadSession,
  useThreads,
  type DriveFile,
} from "@/components/chat";
import { useChatThread, type ChatMessage } from "@/lib/chat";
import { relativeTime } from "@/lib/format";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
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
import { SquareIcon } from "lucide-react";

import { AnswerSlab } from "./answer-slab";
import { StageHeader } from "./stage-header";
import { WaveDots } from "./wave-dots";

/** Prompt starters, shown on an empty stage. Each asks about real workspace data. */
const STARTERS = [
  "Which tasks are overdue, and what do they have in common?",
  "Draft a short migration note for adding a column to the tasks table.",
  "Explain how a reply gets from the composer to D1 on this template.",
];

function AskBubble({ message }: { message: ChatMessage }) {
  return (
    <Message align="end" role="group" aria-label="You">
      <MessageAvatar>
        <Avatar>
          <AvatarFallback className="text-xs">You</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="min-w-0 gap-1">
        <BubbleGroup className="w-full items-end">
          <Bubble variant="muted" align="end" className="backdrop-blur-md">
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

export interface AiChatProps {
  /** `?t=<id>` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/** One open conversation on the stage. Remounted when the thread changes. */
function StageSession({
  threadId,
  showRunDetails,
  onThreadCreated,
  onTitle,
}: {
  threadId: string | undefined;
  showRunDetails: boolean;
  onThreadCreated: (id: string) => void;
  onTitle: (id: string, title: string) => void;
}) {
  const chat = useChatThread({ threadId, onThreadCreated, onTitle });
  const [attached, setAttached] = useState<DriveFile[]>([]);
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  const lastReplyId = [...chat.messages].reverse().find((m) => m.role === "assistant")?.id;

  function send(text: string) {
    const context = describeAttachments(attached);
    void chat.send(context ? `${context}\n\n${text}` : text);
    setAttached([]);
  }

  /** Ask the question behind a reply again, as a new turn of its own. */
  function retry(replyId: string) {
    const at = chat.messages.findIndex((message) => message.id === replyId);
    for (let index = at - 1; index >= 0; index -= 1) {
      if (chat.messages[index]!.role === "user") {
        void chat.send(chat.messages[index]!.content);
        return;
      }
    }
  }

  const empty = chat.messages.length === 0 && !chat.streaming && !chat.loading;

  return (
    <>
      {empty ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
          <h2 className="text-2xl/8 font-medium tracking-tight text-balance">
            Ask, and watch the run
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            Every reply arrives as a receipt: the model that answered, how long it took and
            what it cost, beside the answer itself.
          </p>
          <div className="flex w-full max-w-xl flex-col gap-2">
            {STARTERS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSeed({ text: prompt })}
                className="bg-card/60 h-auto w-full justify-start py-2 text-start font-normal whitespace-normal backdrop-blur-md"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="relative z-10 min-h-0 flex-1">
            <MessageScrollerViewport className="scrollbar">
              <MessageScrollerContent
                aria-busy={chat.streaming}
                className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6"
              >
                {chat.loading && chat.messages.length === 0 && (
                  <Skeleton className="h-32 w-full" aria-hidden="true" />
                )}

                {chat.messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    className="animate-in fade-in-0 duration-300 ease-out [content-visibility:visible] motion-reduce:animate-none"
                  >
                    {message.role === "user" ? (
                      <AskBubble message={message} />
                    ) : (
                      <AnswerSlab
                        message={message}
                        routed={message.id === lastReplyId ? chat.routed : null}
                        latencyMs={message.id === lastReplyId && !chat.streaming ? chat.latencyMs : null}
                        usage={message.id === lastReplyId && !chat.streaming ? chat.usage : null}
                        showRunDetails={showRunDetails}
                        onRetry={() => retry(message.id)}
                      />
                    )}
                  </MessageScrollerItem>
                ))}

                {chat.streaming && (
                  <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                    <AnswerSlab
                      message={null}
                      pending={chat.pending}
                      reasoning={chat.reasoning}
                      routed={chat.routed}
                      streaming
                      showRunDetails={showRunDetails}
                    />
                  </MessageScrollerItem>
                )}

                {chat.streaming && (
                  <MessageScrollerItem scrollAnchor={false} className="[content-visibility:visible]">
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={chat.stop}
                        className="bg-card/70 gap-1.5 rounded-full backdrop-blur-md"
                      >
                        <SquareIcon className="size-3 fill-current" aria-hidden="true" />
                        Stop
                      </Button>
                    </div>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>

            <p role="status" aria-live="polite" className="sr-only">
              {chat.streaming ? "Generating a reply" : ""}
            </p>

            <MessageScrollerButton
              variant="outline"
              size="icon-sm"
              className="bottom-4 rounded-full shadow-sm"
            />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pb-4 sm:px-6 sm:pb-6">
        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} />
        <ChatComposer
          seed={seed}
          onSend={send}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          placeholder="Ask anything. The receipt shows what answered…"
          className="[&_[data-slot=input-group]]:bg-card/75 [&_[data-slot=input-group]]:backdrop-blur-md"
          leading={
            <AttachmentChips
              files={attached}
              onDetach={(id) => setAttached((prev) => prev.filter((file) => file.id !== id))}
            />
          }
          addons={
            <AttachmentPicker
              attached={attached}
              onAttach={(file) =>
                setAttached((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]))
              }
              onDetach={(id) => setAttached((prev) => prev.filter((file) => file.id !== id))}
            />
          }
        />
      </div>
    </>
  );
}

/**
 * The stage chat surface.
 *
 * @param props The thread to resume, from the page's query string.
 * @returns The dot field, the chrome bar, the transcript and the composer.
 */
export function AiChat({ initialThreadId }: AiChatProps) {
  const threads = useThreads();
  const session = useThreadSession(initialThreadId);
  const [showRunDetails, setShowRunDetails] = useState(true);

  return (
    <section
      aria-label="Stage chat"
      className="bg-background border-border/60 relative isolate flex h-[calc(100svh-8.5rem)] min-h-[34rem] w-full min-w-0 flex-col overflow-hidden rounded-xl border"
    >
      <WaveDots className="text-muted-foreground [mask-image:radial-gradient(76%_66%_at_50%_54%,black,transparent)]" />

      <StageHeader
        threads={threads}
        activeId={session.threadId}
        onOpen={session.openThread}
        onNew={session.newThread}
        showRunDetails={showRunDetails}
        onRunDetailsChange={setShowRunDetails}
      />

      <StageSession
        key={session.sessionKey}
        threadId={session.threadId}
        showRunDetails={showRunDetails}
        onThreadCreated={(id) => {
          session.adoptThread(id);
          void threads.refresh();
        }}
        onTitle={threads.applyTitle}
      />
    </section>
  );
}
