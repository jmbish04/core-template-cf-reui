/**
 * @fileoverview `/chat/sidebar` — ReUI Pro block `ai-chat-4`, wired to
 * core-guardian.
 *
 * The block's shape kept: an assistant panel on the right that PUSHES the page
 * rather than covering it, a thread switcher in its header, a designed
 * thinking indicator, and — the point of this surface — selecting a sentence
 * in an answer replies to that line. The quote is real context: it is prefixed
 * to the outgoing message (`quotedPrompt`), so the model answers the sentence
 * that was selected.
 *
 * The thinking indicator is driven by the real `streaming` flag and the real
 * `reasoning` channel, never a timer.
 *
 * The page beside the panel is the workspace activity feed (`/api/activity`),
 * because the block's placeholder skeleton page was shape with nothing behind
 * it.
 *
 * Removed from the block (no real backing on this Worker): the skeleton page
 * body, the seeded threads/answers and reveal timers, the model list and the
 * "modes" menu (replaced by the routing-profile picker), the invented source
 * attachments and their per-thread counts, the Personalize / Web search /
 * Follow-ups toggles (the Worker exposes none of them), and Copy transcript.
 */
import { useEffect, useRef, useState } from "react";

import { apiGet } from "@/lib/api";
import { useChatThread } from "@/lib/chat";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  ChatComposer,
  ChatErrorBanner,
  QuotedLine,
  SelectionQuotePill,
  ThreadList,
  Transcript,
  quotedPrompt,
  useBelow,
  useThreadSession,
  useThreads,
  type ThreadSession,
  type UseThreads,
} from "@/components/chat";
import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { IconTile } from "@/components/reui/icon-tile";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BotIcon, ChevronDownIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";

interface ActivityRow {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: number;
}

/** The working page the panel is docked beside. Real rows from D1. */
function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    void apiGet<{ data: ActivityRow[] }>("activity", { limit: 30 })
      .then((res) => setRows(res.data))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-base font-semibold tracking-tight">Workspace activity</h2>
        {rows === null ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has happened here yet. Seed the workspace from the Playbook page.
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li key={row.id} className="border-border flex items-center gap-3 border-b py-2 last:border-b-0">
                <Badge variant="outline" size="sm" className="text-muted-foreground shrink-0 font-normal">
                  {row.entityType}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm">{row.summary}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {relativeTime(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The assistant panel: header switcher, transcript with the quote pill, the
 * thinking row, and the composer carrying the quoted line.
 */
function AssistantPanel({
  session,
  rail,
  onClose,
}: {
  session: ThreadSession;
  rail: UseThreads;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  const chat = useChatThread({
    threadId: session.threadId,
    onThreadCreated: (id) => {
      session.adoptThread(id);
      void rail.refresh();
    },
    onTitle: (id, title) => rail.applyTitle(id, title),
  });

  const title = rail.threads.find((t) => t.id === chat.threadId)?.title ?? "Assistant";

  function send(text: string) {
    const message = quotedPrompt(quote, text);
    setQuote(null);
    void chat.send(message);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <IconTile variant="elevated" size="sm" aria-hidden="true">
          <SparklesIcon aria-hidden="true" />
        </IconTile>

        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger
            render={<Button variant="ghost" size="sm" className="-ms-1 min-w-0 shrink gap-1.5 px-2 font-medium" />}
          >
            <span className="min-w-0 truncate">{title}</span>
            <ChevronDownIcon className="opacity-60" data-icon="inline-end" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="flex max-h-96 w-80 flex-col p-2">
            <ThreadList
              threads={rail.threads}
              activeId={chat.threadId}
              loading={rail.loading}
              heading={null}
              onSelect={(id) => {
                setSwitcherOpen(false);
                session.openThread(id);
              }}
              onRename={rail.rename}
              onDelete={(id) => {
                void rail.remove(id);
                if (id === chat.threadId) session.newThread();
              }}
            />
          </PopoverContent>
        </Popover>

        {/* The designed thinking state, driven by the real stream. */}
        {chat.streaming && (
          <Badge variant="primary-light" size="sm" className="shrink-0 gap-1.5">
            <Spinner className="size-3" />
            <span className="shimmer">{chat.pending ? "Writing" : "Thinking"}</span>
          </Badge>
        )}

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={session.newThread} />}
            >
              <PlusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Close the assistant" onClick={onClose} />}
            >
              <XIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Close the assistant</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Relative, because the quote pill is positioned inside this box. */}
      <div ref={host} className="relative flex min-h-0 flex-1 flex-col">
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
          empty={
            <Empty className="m-auto px-4">
              <EmptyHeader>
                <EmptyTitle>Ask about this page</EmptyTitle>
                <EmptyDescription>
                  Select any sentence in an answer to reply to that line.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
        <SelectionQuotePill host={host} onQuote={setQuote} />
      </div>

      <div className="border-border shrink-0 border-t p-2">
        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} className="mb-2" />
        <ChatComposer
          onSend={send}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          placeholder={quote ? "Reply to the quoted line…" : "Ask the assistant…"}
          leading={<QuotedLine quote={quote} onClear={() => setQuote(null)} />}
        />
      </div>
    </div>
  );
}

export interface SidebarChatProps {
  /** `?t=` as the Astro page read it, so a reload resumes the thread. */
  initialThreadId?: string;
}

/**
 * The `/chat/sidebar` surface.
 *
 * @param props The thread to resume, from the query string.
 * @returns The working page with the assistant docked beside it.
 */
export function SidebarChat({ initialThreadId }: SidebarChatProps) {
  const session = useThreadSession(initialThreadId);
  const rail = useThreads();
  const [open, setOpen] = useState(true);
  // Mounted in exactly one place: a second copy behind `lg:hidden` would run a
  // second stream and hold a second composer.
  const narrow = useBelow(1024);

  const panel = <AssistantPanel key={session.sessionKey} session={session} rail={rail} onClose={() => setOpen(false)} />;

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 gap-4 lg:h-[calc(100svh-11rem)]">
        <Frame className="flex min-w-0 flex-1">
          <FramePanel className="flex min-h-0 flex-col p-0">
            <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <span className="text-muted-foreground min-w-0 truncate text-sm">
                The panel pushes this page rather than covering it.
              </span>
              <Button
                variant={open ? "secondary" : "default"}
                size="sm"
                aria-pressed={open}
                onClick={() => setOpen((current) => !current)}
                className="ms-auto shrink-0 gap-1.5"
              >
                <BotIcon className="size-4" aria-hidden="true" />
                Assistant
              </Button>
            </div>
            <ActivityPage />
          </FramePanel>
        </Frame>

        {/* Width, not overlay: closing gives the page the space back. */}
        {!narrow && (
          <Frame
            className={cn(
              "flex shrink-0 overflow-hidden transition-[width] duration-200",
              open ? "w-96" : "w-0 border-0 p-0 opacity-0",
            )}
            aria-hidden={!open}
          >
            <FramePanel className="flex min-h-0 w-96 flex-col p-0">{open && panel}</FramePanel>
          </Frame>
        )}

        {narrow && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" className="w-full p-0 sm:max-w-md">
              <SheetHeader className="sr-only">
                <SheetTitle>Assistant</SheetTitle>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TooltipProvider>
  );
}
