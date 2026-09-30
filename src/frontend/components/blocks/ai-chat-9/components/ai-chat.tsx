/**
 * @fileoverview `/chat/branching` — ReUI `ai-chat-9`, wired to core-guardian.
 *
 * Replies arrive as small documents (sections, bullets, code artifacts) with
 * the model's own thinking folded behind a thought row and the attached drive
 * files listed as sources. Regenerate and Edit do not overwrite a turn: each
 * forks the conversation onto a REAL sibling thread, and the fork rail steps
 * between them.
 *
 * Why a sibling thread and not a tree in memory: D1 stores a flat message list
 * per thread. `branching.ts` explains the whole model, including what it had to
 * borrow to record the fork without a schema change.
 */
import { useEffect, useRef, useState } from "react";

import {
  AttachmentChips,
  AttachmentPicker,
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  describeAttachments,
  useThreadSession,
  useThreads,
  type DriveFile,
} from "@/components/chat";
import { useChatThread } from "@/lib/chat";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { GitBranchIcon } from "lucide-react";

import {
  askBehind,
  composeForkMessage,
  createBranchThread,
  forkGroup,
  forkRootId,
  historyBefore,
  splitForkMessage,
} from "./branching";
import { ForkRail } from "./fork-rail";
import { TurnList } from "./turn-list";

/** Prompt starters. Each is a real question about this workspace's own data. */
const STARTERS = [
  "Summarise the tasks that are in review, grouped by project.",
  "Write a short TypeScript helper that formats a task's due date.",
  "What does the chat_messages table store, column by column?",
];

/** A fork's first message, handed to the session that opens next. */
type Handoff = { text: string } | null;

function ForkStarters({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <Empty className="max-w-xl">
        <EmptyHeader>
          <EmptyTitle>Ask, then branch</EmptyTitle>
          <EmptyDescription>
            Regenerate or edit any turn and the answer lands on a new branch of this
            conversation instead of replacing what is already there.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="gap-2">
          {STARTERS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPick(prompt)}
              className="h-auto w-full justify-start py-2 text-start font-normal whitespace-normal"
            >
              {prompt}
            </Button>
          ))}
        </EmptyContent>
      </Empty>
    </div>
  );
}

/**
 * One open branch: its turns, its composer, and the two fork actions.
 *
 * Remounted whenever the reader switches thread (the session key), which is
 * what lets `useChatThread` re-seed from the new thread id.
 */
function BranchSession({
  threadId,
  handoff,
  onHandoffSent,
  onThreadCreated,
  onTitle,
  onFork,
  forkRail,
}: {
  threadId: string | undefined;
  /** The forked ask, sent once as soon as this branch mounts. */
  handoff: Handoff;
  onHandoffSent: () => void;
  onThreadCreated: (id: string) => void;
  onTitle: (id: string, title: string) => void;
  /** Hand a composed forking message up so the surface can create the branch. */
  onFork: (message: string, prompt: string) => void;
  forkRail: React.ReactNode;
}) {
  const chat = useChatThread({ threadId, onThreadCreated, onTitle });
  const [attached, setAttached] = useState<DriveFile[]>([]);
  const [seed, setSeed] = useState<{ text: string } | null>(null);
  const sentHandoff = useRef(false);

  // A branch sends its forked ask itself, once, so the new thread is never a
  // blank room the reader has to re-type into.
  useEffect(() => {
    if (!handoff || sentHandoff.current) return;
    sentHandoff.current = true;
    onHandoffSent();
    void chat.send(handoff.text);
    // Mount-only: re-running on `chat.send`'s identity would resend the ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send(text: string) {
    const context = describeAttachments(attached);
    void chat.send(context ? `${context}\n\n${text}` : text);
    setAttached([]);
  }

  /** Re-answer the ask behind a reply, on a branch of its own. */
  function regenerate(replyId: string) {
    const ask = askBehind(chat.messages, replyId);
    if (!ask) return;
    const { prompt } = splitForkMessage(ask.content);
    onFork(composeForkMessage(historyBefore(chat.messages, ask.id), prompt), prompt);
  }

  /** Ask a rewritten question on a branch, leaving the original in place. */
  function edit(askId: string, prompt: string) {
    onFork(composeForkMessage(historyBefore(chat.messages, askId), prompt), prompt);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TurnList
        messages={chat.messages}
        pending={chat.pending}
        reasoning={chat.reasoning}
        routed={chat.routed}
        latencyMs={chat.latencyMs}
        usage={chat.usage}
        streaming={chat.streaming}
        loading={chat.loading}
        onStop={chat.stop}
        onRegenerate={regenerate}
        onEdit={edit}
        empty={<ForkStarters onPick={(text) => setSeed({ text })} />}
      />

      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pb-4 sm:px-6">
        {forkRail}
        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} />
        <ChatComposer
          seed={seed}
          onSend={send}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          placeholder="Ask something, then branch the answer…"
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
    </div>
  );
}

export interface AiChatProps {
  /** `?t=<id>` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The branching chat surface.
 *
 * @param props The thread to resume, from the page's query string.
 * @returns The thread rail, the open branch and its fork rail.
 */
export function AiChat({ initialThreadId }: AiChatProps) {
  const threads = useThreads();
  const session = useThreadSession(initialThreadId);
  const [handoff, setHandoff] = useState<Handoff>(null);
  const [forkError, setForkError] = useState<string | null>(null);

  const versions = forkGroup(threads.threads, session.threadId);

  /**
   * Create the sibling thread a new version lives in, then open it.
   *
   * The handoff is set before the switch so the branch that mounts next can
   * send the forked ask without another round trip through the reader.
   */
  async function fork(message: string, prompt: string) {
    const active = threads.threads.find((thread) => thread.id === session.threadId);
    const rootId = active ? forkRootId(active) : session.threadId;
    if (!rootId) return;

    try {
      const branch = await createBranchThread(rootId, prompt.slice(0, 60) || "Branch");
      setForkError(null);
      setHandoff({ text: message });
      session.openThread(branch.id);
      void threads.refresh();
    } catch {
      setForkError("Could not start a branch for that turn.");
    }
  }

  return (
    <section
      aria-label="Branching chat"
      className="bg-card/40 border-border/60 flex h-[calc(100svh-8.5rem)] min-h-[34rem] w-full min-w-0 overflow-hidden rounded-xl border"
    >
      <aside className="border-border/60 hidden w-64 shrink-0 flex-col gap-2 border-e p-2 lg:flex">
        <ThreadList
          threads={threads.threads}
          activeId={session.threadId}
          loading={threads.loading}
          onSelect={session.openThread}
          onNew={session.newThread}
          onRename={threads.rename}
          onDelete={threads.remove}
          heading="Conversations"
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-border/60 flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <GitBranchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <h2 className="min-w-0 truncate text-sm font-medium">
            {versions.find((thread) => thread.id === session.threadId)?.title ?? "New conversation"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={session.newThread}
            className="ms-auto shrink-0"
          >
            New chat
          </Button>
        </header>

        <ChatErrorBanner
          error={forkError}
          onDismiss={() => setForkError(null)}
          className="mx-4 mt-3"
        />

        <BranchSession
          key={session.sessionKey}
          threadId={session.threadId}
          handoff={handoff}
          onHandoffSent={() => setHandoff(null)}
          onThreadCreated={(id) => {
            session.adoptThread(id);
            void threads.refresh();
          }}
          onTitle={threads.applyTitle}
          onFork={(message, prompt) => void fork(message, prompt)}
          forkRail={
            <ForkRail
              versions={versions}
              activeId={session.threadId}
              onOpen={session.openThread}
              className="self-start"
            />
          }
        />
      </div>
    </section>
  );
}
