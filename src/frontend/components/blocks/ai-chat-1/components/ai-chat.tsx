/**
 * @fileoverview `/chat/copilot` — ReUI Pro block `ai-chat-1`, wired to
 * core-guardian.
 *
 * The block's shape kept: a full-height streaming transcript with a
 * recent-chats rail beside it, one composer at the foot. Everything behind it
 * is real — `useChatThread` streams `POST /api/chat/stream`, the rail is the
 * D1 `/api/threads` index, and the open thread lives in `?t=<id>` so a reload
 * resumes it.
 *
 * Removed from the block (no real backing on this Worker): the seeded
 * transcripts and typing timers, the hardcoded model list (replaced by the
 * routing-profile picker, which is what core-guardian actually takes), the
 * Memory toggle, Copy link / Export transcript, the pinned/Today/Earlier
 * tabs (the thread row has no pinned column), the artifact chips, the reply
 * like/dislike vote, and the Terms alert.
 */
import { useState } from "react";

import { useChatThread } from "@/lib/chat";

import {
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  Transcript,
  useThreadSession,
  useThreads,
  type ThreadSession,
  type UseThreads,
} from "@/components/chat";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { IconStack } from "@/components/reui/icon-stack";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BotIcon, PanelLeftIcon, PlusIcon } from "lucide-react";

/** Prompt starters. Copy, not data — they fill the composer, nothing more. */
const STARTERS = [
  "Summarise what changed in this workspace this week.",
  "Which tasks are overdue, and what is blocking them?",
  "Draft a status update for the active projects.",
];

function CopilotEmpty({ onStart }: { onStart: (prompt: string) => void }) {
  return (
    <div className="scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
      <div className="m-auto flex w-full max-w-xl flex-col gap-6">
        <Empty className="flex-none p-0">
          <EmptyHeader>
            <EmptyMedia className="mb-0">
              <IconStack aria-hidden="true" className="h-16 w-14">
                <BotIcon strokeWidth="1.9" className="size-3.5" aria-hidden="true" />
              </IconStack>
            </EmptyMedia>
            <EmptyTitle>How can I help?</EmptyTitle>
            <EmptyDescription>
              Ask about the projects, tasks and notes in this workspace.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div className="flex flex-col">
          {STARTERS.map((prompt) => (
            <Button
              key={prompt}
              variant="ghost"
              onClick={() => onStart(prompt)}
              className="border-border h-auto w-full justify-start rounded-none border-x-0 border-t-0 border-b px-0 py-2.5 text-start font-normal whitespace-normal last:border-b-0 hover:bg-transparent"
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One conversation. Remounted by `sessionKey` when the reader switches thread,
 * because `useChatThread` seeds its id once and owns it afterwards.
 */
function CopilotSession({ session, rail }: { session: ThreadSession; rail: UseThreads }) {
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  const chat = useChatThread({
    threadId: session.threadId,
    onThreadCreated: (id) => {
      session.adoptThread(id);
      // The rail has never seen this thread; a re-read is the only way to get
      // its row, including the title the server is about to write.
      void rail.refresh();
    },
    onTitle: (id, title) => rail.applyTitle(id, title),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} />

      <Frame className="flex min-h-0 flex-1">
        <FramePanel className="flex min-h-0 flex-col p-0">
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
            empty={<CopilotEmpty onStart={(text) => setSeed({ text })} />}
          />
        </FramePanel>
      </Frame>

      <ChatComposer
        onSend={chat.send}
        onStop={chat.stop}
        streaming={chat.streaming}
        profile={chat.profile}
        onProfileChange={chat.setProfile}
        routed={chat.routed}
        seed={seed}
      />
    </div>
  );
}

export interface CopilotChatProps {
  /** `?t=` as the Astro page read it, so a reload resumes the thread. */
  initialThreadId?: string;
}

/**
 * The `/chat/copilot` surface.
 *
 * @param props The thread to resume, from the query string.
 * @returns The transcript, the rail and the composer.
 */
export function CopilotChat({ initialThreadId }: CopilotChatProps) {
  const session = useThreadSession(initialThreadId);
  const rail = useThreads();

  const list = (
    <ThreadList
      threads={rail.threads}
      activeId={session.threadId}
      loading={rail.loading}
      onSelect={session.openThread}
      onNew={session.newThread}
      onRename={rail.rename}
      onDelete={(id) => {
        void rail.remove(id);
        if (id === session.threadId) session.newThread();
      }}
    />
  );

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 gap-4 md:h-[calc(100svh-11rem)]">
        <Frame className="hidden w-64 shrink-0 lg:flex">
          <FramePanel className="flex min-h-0 flex-col">{list}</FramePanel>
        </Frame>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* The rail has no room below lg, so it becomes a sheet there. */}
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
                <PanelLeftIcon aria-hidden="true" />
                Chats
              </SheetTrigger>
              <SheetContent side="left" className="flex w-80 flex-col gap-3 p-3">
                <SheetHeader className="p-0">
                  <SheetTitle>Conversations</SheetTitle>
                </SheetHeader>
                {list}
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="sm" onClick={session.newThread} className="gap-1.5">
              <PlusIcon aria-hidden="true" />
              New chat
            </Button>
          </div>

          <CopilotSession key={session.sessionKey} session={session} rail={rail} />
        </div>
      </div>
    </TooltipProvider>
  );
}
