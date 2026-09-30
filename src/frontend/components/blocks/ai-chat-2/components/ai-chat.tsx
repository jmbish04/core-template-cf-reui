/**
 * @fileoverview `/chat/docked` — ReUI Pro block `ai-chat-2`, wired to
 * core-guardian.
 *
 * The block's shape kept: a document with the assistant docked beside it, and
 * an "Insert into draft" action on every reply. The difference is that the
 * document is REAL — it is the thread's `chat_documents` row, edited in the
 * PlateJS editor, saved through `PUT /api/threads/{id}/document` and appended
 * to through `POST …/document/append`.
 *
 * MOUNTING: `client:only="react"`. PlateJS touches browser-only DOM APIs and
 * must never run during Astro SSR.
 *
 * Removed from the block (no real backing on this Worker): the skeleton
 * "release doc" and its fixed section list, the seeded transcript and reveal
 * timers, the model list (replaced by the routing-profile picker), the
 * accept/undo draft dance over a single hardcoded section, and the retry on a
 * canned failure.
 */
import { useState } from "react";

import { appendToDocument, useChatThread, type ChatMessage } from "@/lib/chat";

import {
  CanvasDocument,
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  Transcript,
  useBelow,
  useChatDocument,
  useThreadSession,
  useThreads,
} from "@/components/chat";
import { Frame, FramePanel } from "@/components/reui/frame";
import { IconTile } from "@/components/reui/icon-tile";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BotIcon, MessageSquareIcon, PlusIcon, SparklesIcon, TextCursorInputIcon } from "lucide-react";

export interface DockedChatProps {
  /** `?t=` as the Astro page read it, so a reload resumes the thread. */
  initialThreadId?: string;
}

/**
 * The `/chat/docked` surface: a live document with the assistant beside it.
 *
 * @param props The thread to resume, from the query string.
 * @returns The two-pane draft surface.
 */
export function DockedChat({ initialThreadId }: DockedChatProps) {
  const session = useThreadSession(initialThreadId);
  const rail = useThreads();
  const [inserted, setInserted] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Mounted in exactly one place: a second copy behind `lg:hidden` would give
  // the surface two transcripts and two composers over one stream.
  const narrow = useBelow(1024);

  const chat = useChatThread({
    threadId: session.threadId,
    systemPrompt:
      "You are helping the reader write a document that sits beside this conversation. Answer in prose they could paste straight into it.",
    onThreadCreated: (id) => {
      session.adoptThread(id);
      void rail.refresh();
    },
    onTitle: (id, title) => rail.applyTitle(id, title),
  });

  // The document belongs to the thread, so it follows whatever id the chat
  // hook is holding — including the one the server just created mid-stream.
  const doc = useChatDocument(chat.threadId);

  async function insert(message: ChatMessage) {
    if (!chat.threadId) return;
    await appendToDocument(chat.threadId, message.content);
    await doc.reload();
    setInserted(message.id);
    window.setTimeout(() => setInserted((id) => (id === message.id ? null : id)), 1800);
  }

  const assistant = (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <IconTile variant="elevated" size="sm" aria-hidden="true">
          <SparklesIcon aria-hidden="true" />
        </IconTile>
        <h2 className="min-w-0 truncate text-sm font-medium">Assistant</h2>
        <div className="ms-auto flex items-center gap-0.5">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Conversations" />}
            >
              <MessageSquareIcon aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-80 flex-col gap-3 p-3">
              <SheetHeader className="p-0">
                <SheetTitle>Conversations</SheetTitle>
              </SheetHeader>
              <ThreadList
                threads={rail.threads}
                activeId={chat.threadId}
                loading={rail.loading}
                heading={null}
                onSelect={session.openThread}
                onRename={rail.rename}
                onDelete={(id) => {
                  void rail.remove(id);
                  if (id === chat.threadId) session.newThread();
                }}
              />
            </SheetContent>
          </Sheet>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={session.newThread} />
              }
            >
              <PlusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <Transcript
        messages={chat.messages}
        pending={chat.pending}
        reasoning={chat.reasoning}
        routed={chat.routed}
        latencyMs={chat.latencyMs}
        usage={chat.usage}
        streaming={chat.streaming}
        loading={chat.loading}
        onStop={chat.stop}
        contentClassName="max-w-none px-3 py-4 sm:px-3"
        replyActions={(message) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Insert this reply into the draft"
                  disabled={!chat.threadId}
                  onClick={() => void insert(message)}
                />
              }
            >
              <TextCursorInputIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              {inserted === message.id ? "Added to the draft" : "Insert into draft"}
            </TooltipContent>
          </Tooltip>
        )}
        empty={
          <Empty className="m-auto px-4">
            <EmptyHeader>
              <EmptyTitle>Write with the assistant</EmptyTitle>
              <EmptyDescription>
                Ask for a section, then insert the reply straight into the draft.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <div className="border-border shrink-0 border-t p-2">
        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} className="mb-2" />
        <ChatComposer
          onSend={chat.send}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          placeholder="Ask for a section…"
        />
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 gap-4 lg:h-[calc(100svh-11rem)]">
        <Frame className="flex min-w-0 flex-1">
          <FramePanel className="flex min-h-0 flex-col">
            <CanvasDocument
              state={doc}
              emptyHint="Send the assistant a message. The draft is created with the conversation."
            />
          </FramePanel>
        </Frame>

        {/* Docked beside the document above lg; a sheet below it, as the block
            does — there is no room for two panes on a phone. */}
        {!narrow && (
          <Frame className="flex w-96 shrink-0">
            <FramePanel className="flex min-h-0 flex-col p-0">{assistant}</FramePanel>
          </Frame>
        )}

        {narrow && (
          <>
            <Button
              size="lg"
              onClick={() => setSheetOpen(true)}
              className="fixed end-4 bottom-4 z-20 gap-1.5 rounded-full shadow-lg"
            >
              <BotIcon aria-hidden="true" />
              Assistant
            </Button>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="right" className="w-full p-0 sm:max-w-md">
                <SheetHeader className="sr-only">
                  <SheetTitle>Assistant</SheetTitle>
                </SheetHeader>
                {assistant}
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
