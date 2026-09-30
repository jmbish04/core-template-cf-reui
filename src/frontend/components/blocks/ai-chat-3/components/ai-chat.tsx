/**
 * @fileoverview `/chat/welcome` — ReUI Pro block `ai-chat-3`, wired to
 * core-guardian.
 *
 * The block's shape kept: an `Empty` greeting over live workspace figures, a
 * rail of Start / Resume rows, an `InputGroup` composer with attachment chips,
 * and a streaming reply with Stop. Everything under it is real — the figures
 * come from `GET /api/dashboard/stats`, the Resume rows are `/api/threads`,
 * and an attachment is a genuine file from the `/files` drive whose name, type
 * and size go into the prompt (see `describeAttachments`).
 *
 * Removed from the block (no real backing on this Worker): the seeded greeting
 * figures, the invented "connected app" context sources behind the chips, the
 * questionnaire branch (the router returns prose, not a form schema), the
 * seeded transcript and its reveal timers, and the model list (replaced by the
 * routing-profile picker).
 */
import { useEffect, useState, type ReactNode } from "react";

import { apiGet } from "@/lib/api";
import { useChatThread } from "@/lib/chat";
import { compactNumber, relativeTime } from "@/lib/format";

import {
  AttachmentChips,
  AttachmentPicker,
  ChatComposer,
  ChatErrorBanner,
  Transcript,
  describeAttachments,
  useThreadSession,
  useThreads,
  type DriveFile,
  type ThreadSession,
  type UseThreads,
} from "@/components/chat";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChartColumnIcon, FolderKanbanIcon, ListChecksIcon, MessageSquareIcon } from "lucide-react";

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  completionRatePct: number;
  overdueTasks: number;
  unreadNotifications: number;
}

/** Prompt starters. Copy, not data — they fill the composer and nothing else. */
const STARTERS = [
  { icon: ListChecksIcon, prompt: "Which tasks are overdue, and what is blocking them?" },
  { icon: FolderKanbanIcon, prompt: "Summarise where each active project stands." },
  { icon: ChartColumnIcon, prompt: "What changed in this workspace over the last week?" },
];

/** The live workspace figures under the greeting. */
function WorkspaceStats({ stats, loading }: { stats: DashboardStats | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-4 w-72" aria-hidden="true" />;
  if (!stats) {
    // The figures failed to load. Saying so beats a zero that reads as a fact.
    return <span className="text-muted-foreground text-sm">Workspace figures are unavailable right now.</span>;
  }
  return (
    <span className="text-muted-foreground text-sm">
      {compactNumber(stats.activeProjects)} active projects
      <span aria-hidden="true" className="bg-muted-foreground/40 mx-1.5 inline-block size-1 rounded-full align-middle" />
      {compactNumber(stats.totalTasks - stats.completedTasks)} open tasks
      <span aria-hidden="true" className="bg-muted-foreground/40 mx-1.5 inline-block size-1 rounded-full align-middle" />
      {compactNumber(stats.overdueTasks)} overdue
    </span>
  );
}

/**
 * One conversation. Remounted by `sessionKey` on a deliberate switch, because
 * `useChatThread` seeds its thread id once and owns it afterwards.
 */
function WelcomeSession({
  session,
  rail,
  zeroState,
  seed,
  onSeedUsed,
}: {
  session: ThreadSession;
  rail: UseThreads;
  zeroState: ReactNode;
  seed: { text: string } | null;
  onSeedUsed: () => void;
}) {
  const [attached, setAttached] = useState<DriveFile[]>([]);

  const chat = useChatThread({
    threadId: session.threadId,
    onThreadCreated: (id) => {
      session.adoptThread(id);
      void rail.refresh();
    },
    onTitle: (id, title) => rail.applyTitle(id, title),
  });

  /** Attachments ride into the prompt as a context line, then clear. */
  function send(text: string) {
    const context = describeAttachments(attached);
    setAttached([]);
    onSeedUsed();
    void chat.send(context ? `${context}\n\n${text}` : text);
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:h-[calc(100svh-11rem)]">
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
              empty={zeroState}
            />
          </FramePanel>
        </Frame>

        <ChatComposer
          onSend={send}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          seed={seed ?? undefined}
          leading={<AttachmentChips files={attached} onDetach={(id) => setAttached((prev) => prev.filter((f) => f.id !== id))} />}
          addons={
            <AttachmentPicker
              attached={attached}
              onAttach={(file) => setAttached((prev) => [...prev, file])}
              onDetach={(id) => setAttached((prev) => prev.filter((f) => f.id !== id))}
            />
          }
        />
      </div>
    </TooltipProvider>
  );
}

export interface WelcomeChatProps {
  /** `?t=` as the Astro page read it, so a reload resumes the thread. */
  initialThreadId?: string;
}

/**
 * The `/chat/welcome` surface.
 *
 * Owns the zero state (live workspace figures, prompt starters, real recent
 * threads) and hands it to the keyed session that owns the conversation.
 *
 * @param props The thread to resume, from the query string.
 * @returns The zero state, or the transcript once a turn exists.
 */
export function WelcomeChat({ initialThreadId }: WelcomeChatProps) {
  const session = useThreadSession(initialThreadId);
  const rail = useThreads();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  useEffect(() => {
    void apiGet<DashboardStats>("dashboard/stats")
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  const zeroState = (
    <div className="scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="m-auto flex w-full max-w-3xl flex-col gap-8">
        <Empty className="flex-none gap-0 p-0">
          <EmptyHeader className="max-w-none items-center gap-2">
            <EmptyTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <h1>What are we working on?</h1>
            </EmptyTitle>
            <EmptyDescription className="text-sm">
              <WorkspaceStats stats={stats} loading={statsLoading} />
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
          <section className="flex flex-col gap-1">
            <h2 className="text-muted-foreground text-xs font-medium">Start</h2>
            <ul className="flex flex-col gap-2">
              {STARTERS.map(({ icon: Icon, prompt }) => (
                <li key={prompt}>
                  <Button
                    variant="outline"
                    onClick={() => setSeed({ text: prompt })}
                    className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-start font-normal whitespace-normal"
                  >
                    <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 text-sm">{prompt}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1">
            <h2 className="text-muted-foreground text-xs font-medium">Resume</h2>
            {rail.loading ? (
              <Skeleton className="h-16 w-full" aria-hidden="true" />
            ) : rail.threads.length === 0 ? (
              <p className="text-muted-foreground text-sm">No earlier conversations yet.</p>
            ) : (
              <ul className="flex flex-col">
                {rail.threads.slice(0, 5).map((thread) => (
                  <li key={thread.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => session.openThread(thread.id)}
                      className="group/resume flex w-full min-w-0 cursor-pointer items-center gap-2 py-1 text-start"
                    >
                      <MessageSquareIcon
                        aria-hidden="true"
                        className="text-muted-foreground group-hover/resume:text-foreground size-3.5 shrink-0 transition-colors"
                      />
                      <span className="text-muted-foreground group-hover/resume:text-foreground min-w-0 truncate text-sm underline-offset-4 transition-colors group-hover/resume:underline">
                        {thread.title}
                      </span>
                      <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
                        {relativeTime(thread.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );


  return (
    <WelcomeSession
      key={session.sessionKey}
      session={session}
      rail={rail}
      zeroState={zeroState}
      seed={seed}
      onSeedUsed={() => setSeed(null)}
    />
  );
}
