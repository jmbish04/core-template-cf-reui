/**
 * @fileoverview `/chat/support` — ReUI `ai-chat-12`, wired to core-guardian.
 *
 * A docs-support assistant docked to a documentation page as a hideable right
 * panel. It answers only from the product knowledge base and shows its work:
 * the search, each matched article ticking from queued to read, then the write,
 * then a receipt naming how many were read and how many survived into the
 * answer. When the docs genuinely do not cover something it says so and opens a
 * real ticket instead of guessing.
 *
 * WHAT THE BLOCK SHIPPED AND THIS DOES NOT:
 *
 * - helpful / not-helpful voting. There is no table behind it, and a thumb that
 *   quietly records nothing is worse than no thumb, so it is gone rather than
 *   decorative.
 * - the skeleton documentation page. It renders the real knowledge base now —
 *   see `docs-page.tsx`.
 * - the simulated retrieval clock. Each tick is a real resolve; see
 *   `use-retrieval.ts`.
 *
 * The panel is a plain column rather than a `Sidebar`, because the app shell
 * already owns a `SidebarProvider` and nesting a second one would leave two
 * components fighting over one `useSidebar`.
 */
import { useEffect, useRef, useState } from "react";

import {
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  useThreadSession,
  useThreads,
} from "@/components/chat";
import { useChatThread } from "@/lib/chat";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { IconStack } from "@/components/reui/icon-stack";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookOpenIcon, MessagesSquareIcon, SquarePenIcon, XIcon } from "lucide-react";

import { AskThread } from "./ask-thread";
import { DocsPage } from "./docs-page";
import { supportSystemPrompt, type Article } from "./knowledge-base";
import { useRetrieval, type UseRetrieval } from "./use-retrieval";

/** Starters. Each is answerable from this template's own schema documentation. */
const STARTERS = [
  "What does the tasks table store?",
  "How are chat messages linked to a thread?",
  "Which tables hold settings?",
];

/** One open support conversation. Remounted when the reader switches thread. */
function SupportSession({
  threadId,
  retrieval,
  onThreadCreated,
  onTitle,
}: {
  threadId: string | undefined;
  /** Owned by the surface, so the docs page and the panel share one load. */
  retrieval: UseRetrieval;
  onThreadCreated: (id: string) => void;
  onTitle: (id: string, title: string) => void;
}) {
  // The retrieved articles are the turn's grounding, so the system prompt has
  // to change per turn. It is set first, and the ask is sent from the effect
  // below — by then `useChatThread` has re-read it.
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>(undefined);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState<{ question: string } | null>(null);
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  const chat = useChatThread({ threadId, systemPrompt, onThreadCreated, onTitle });

  /** Assistant message id → the articles read for it, for this session only. */
  const [reads, setReads] = useState<Record<string, Article[]>>({});
  const awaitingRead = useRef<Article[] | null>(null);

  // A thread switch remounts this session; any trace from the thread just
  // closed belongs to that thread, not this one.
  useEffect(() => {
    retrieval.reset();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingAsk) return;
    setPendingAsk(null);
    void chat.send(pendingAsk);
    // Mount-of-this-ask only: `chat.send`'s identity changes every render and
    // re-running would send the question twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk]);

  // Attach the run's articles to the reply once the reply has an id.
  useEffect(() => {
    if (chat.streaming || !awaitingRead.current) return;
    const reply = [...chat.messages].reverse().find((message) => message.role === "assistant");
    if (!reply) return;
    const read = awaitingRead.current;
    awaitingRead.current = null;
    setReads((current) => ({ ...current, [reply.id]: read }));
    retrieval.reset();
  }, [chat.streaming, chat.messages, retrieval]);

  async function ask(question: string) {
    setNoMatch(null);
    const read = await retrieval.retrieve(question);
    if (read.length === 0) {
      // Nothing matched, so nothing may be answered from. This never reaches a
      // model: an answer with no sources is exactly what this surface refuses.
      setNoMatch({ question });
      return;
    }
    awaitingRead.current = read;
    setSystemPrompt(supportSystemPrompt(read));
    setPendingAsk(question);
  }

  const empty = chat.messages.length === 0 && !chat.streaming && !chat.loading && !noMatch;

  return (
    <>
      {empty ? (
        <div className="scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-16 pb-4">
          <div className="m-auto flex w-full flex-col gap-6">
            <Empty className="flex-none p-0">
              <EmptyHeader>
                <EmptyMedia className="mb-0">
                  <IconStack aria-hidden="true" className="h-16 w-14">
                    <BookOpenIcon strokeWidth="1.9" className="size-3.5" aria-hidden="true" />
                  </IconStack>
                </EmptyMedia>
                <EmptyTitle>Ask the docs</EmptyTitle>
                <EmptyDescription>
                  {retrieval.loading
                    ? "Loading the knowledge base…"
                    : `Answers drawn from ${retrieval.articles.length} articles, and nothing else.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>

            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSeed({ text: prompt })}
                  className="text-muted-foreground hover:text-foreground h-auto py-1.5 text-start font-normal whitespace-normal"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <AskThread
          messages={chat.messages}
          pending={chat.pending}
          reasoning={chat.reasoning}
          streaming={chat.streaming}
          loading={chat.loading}
          onStop={chat.stop}
          articles={retrieval.articles}
          reads={reads}
          phase={retrieval.phase}
          matched={retrieval.matched}
          readCount={retrieval.readCount}
          noMatch={noMatch}
        />
      )}

      <div className="relative z-10 mt-2 flex shrink-0 flex-col gap-2 px-4 pt-2 pb-4">
        <ChatErrorBanner error={chat.error ?? retrieval.error} onDismiss={chat.clearError} />
        <ChatComposer
          seed={seed}
          onSend={(text) => void ask(text)}
          onStop={chat.stop}
          streaming={chat.streaming || retrieval.phase !== "idle"}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          placeholder="Ask about this workspace…"
        />
      </div>
    </>
  );
}

export interface AiChatProps {
  /** `?t=<id>` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The docs-support surface: documentation with the assistant docked beside it.
 *
 * @param props The thread to resume, from the page's query string.
 * @returns The docs page and its hideable assistant panel.
 */
export function AiChat({ initialThreadId }: AiChatProps) {
  const threads = useThreads();
  const session = useThreadSession(initialThreadId);
  const [panelOpen, setPanelOpen] = useState(true);
  const retrieval = useRetrieval();

  return (
    <section
      aria-label="Docs support"
      className="bg-card/40 border-border/60 flex h-[calc(100svh-8.5rem)] min-h-[34rem] w-full min-w-0 overflow-hidden rounded-xl border"
    >
      {/* Below md the panel takes the whole surface: two 390px columns would
          leave neither readable. */}
      <div className={cn("min-h-0 min-w-0 flex-1 flex-col", panelOpen ? "hidden md:flex" : "flex")}>
        <DocsPage
          articles={retrieval.articles}
          loading={retrieval.loading}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
        />
      </div>

      <aside
        aria-label="Docs assistant"
        className={cn(
          "border-border/60 bg-card relative min-h-0 w-[min(26rem,42vw)] shrink-0 flex-col border-s max-md:w-full max-md:border-s-0",
          panelOpen ? "flex" : "hidden",
        )}
      >
        <header className="bg-card/70 supports-backdrop-filter:bg-card/60 after:from-card absolute inset-x-0 top-0 z-20 flex min-h-12 items-center gap-1 px-3 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:to-transparent">
          <span className="min-w-0 truncate ps-1 text-sm font-medium">Docs assistant</span>

          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Past conversations" />
                }
              >
                <MessagesSquareIcon aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-2">
                <ThreadList
                  threads={threads.threads}
                  activeId={session.threadId}
                  loading={threads.loading}
                  onSelect={session.openThread}
                  onRename={threads.rename}
                  onDelete={threads.remove}
                  heading="Conversations"
                  className="max-h-80"
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New question"
              onClick={session.newThread}
            >
              <SquarePenIcon aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide the assistant"
              onClick={() => setPanelOpen(false)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </header>

        <SupportSession
          key={session.sessionKey}
          threadId={session.threadId}
          retrieval={retrieval}
          onThreadCreated={(id) => {
            session.adoptThread(id);
            void threads.refresh();
          }}
          onTitle={threads.applyTitle}
        />
      </aside>
    </section>
  );
}
