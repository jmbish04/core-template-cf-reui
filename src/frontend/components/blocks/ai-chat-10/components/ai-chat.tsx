/**
 * @fileoverview `/chat/scoped` — ReUI `ai-chat-10`, wired to core-guardian.
 *
 * A launch surface: a greeting, a framed ask box whose header toggles which
 * workspace files the chat may read, and three starter asks. Replies come back
 * as structured documents — sortable tables, highlighted code, comparison bars
 * derived from the figures actually in the reply.
 *
 * The scope is real. See `scoped-sources.tsx`: an enabled file's bytes are
 * carried into the turn, a disabled one is named to the model as a source it
 * was not given, with an instruction to call that out as a gap instead of
 * guessing around it.
 */
import { useState } from "react";

import {
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  useThreadSession,
  useThreads,
} from "@/components/chat";
import { useChatThread } from "@/lib/chat";

import { Frame, FrameHeader, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Item } from "@/components/ui/item";

import { ReuiMark } from "./reui-mark";
import { ScopeHeader, SCOPE_SYSTEM_PROMPT, useScopedSources } from "./scoped-sources";
import { ScopedTurns } from "./scoped-turns";

/**
 * Three grounded asks. Each names a shape the structured renderer can show, so
 * the starters demonstrate the surface without the surface faking anything.
 */
const STARTERS = [
  "Compare the files I gave you in a table: name, what it covers, how long it is.",
  "Quote the exact configuration lines that set the database binding.",
  "What question about this workspace can the files you have NOT answer?",
];

/** The greeting above the ask box. Time of day, not a fixed demo clock. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning. What should I read?";
  if (hour < 18) return "Good afternoon. What should I read?";
  return "Good evening. What should I read?";
}

function Welcome({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-10 sm:px-6">
      <ReuiMark />
      <h2 className="text-2xl/8 font-medium tracking-tight text-balance sm:text-3xl/9">
        {greeting()}
      </h2>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {STARTERS.map((prompt) => (
          <Item
            key={prompt}
            variant="outline"
            render={<button type="button" />}
            onClick={() => onPick(prompt)}
            className="hover:bg-accent/50 h-full items-start text-start"
          >
            <span className="text-muted-foreground text-sm/5">{prompt}</span>
          </Item>
        ))}
      </div>
    </div>
  );
}

/** One open conversation, remounted when the reader switches thread. */
function ScopedSession({
  threadId,
  onThreadCreated,
  onTitle,
}: {
  threadId: string | undefined;
  onThreadCreated: (id: string) => void;
  onTitle: (id: string, title: string) => void;
}) {
  const chat = useChatThread({ threadId, systemPrompt: SCOPE_SYSTEM_PROMPT, onThreadCreated, onTitle });
  const scope = useScopedSources();
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  async function send(text: string) {
    await chat.send(await scope.compose(text));
  }

  const started = chat.messages.length > 0 || chat.streaming;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {started ? (
        <ScopedTurns
          messages={chat.messages}
          pending={chat.pending}
          reasoning={chat.reasoning}
          routed={chat.routed}
          latencyMs={chat.latencyMs}
          usage={chat.usage}
          streaming={chat.streaming}
          loading={chat.loading}
          onStop={chat.stop}
        />
      ) : (
        <div className="scrollbar min-h-0 flex-1 overflow-y-auto">
          <Welcome onPick={(text) => setSeed({ text })} />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pb-4 sm:px-6">
        <ChatErrorBanner error={chat.error ?? scope.error} onDismiss={chat.clearError} />

        {/* Surface `frame`: the ask box is the block's one framed object, and
            its header is the scope control rather than a label. */}
        <Frame dense stacked spacing="sm" className="w-full">
          <FrameHeader className="py-2">
            <ScopeHeader sources={scope.sources} loading={scope.loading} onToggle={scope.toggle} />
          </FrameHeader>
          <FramePanel className="p-0">
            <ChatComposer
              seed={seed}
              onSend={(text) => void send(text)}
              onStop={chat.stop}
              streaming={chat.streaming}
              profile={chat.profile}
              onProfileChange={chat.setProfile}
              routed={chat.routed}
              placeholder="Ask about the files switched on above…"
              className="[&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:shadow-none"
            />
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

export interface AiChatProps {
  /** `?t=<id>` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The scoped, structured chat surface.
 *
 * @param props The thread to resume, from the page's query string.
 * @returns The conversation rail beside the framed ask box.
 */
export function AiChat({ initialThreadId }: AiChatProps) {
  const threads = useThreads();
  const session = useThreadSession(initialThreadId);

  return (
    <section
      aria-label="Scoped chat"
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
          <h2 className="min-w-0 truncate text-sm font-medium">
            {threads.threads.find((thread) => thread.id === session.threadId)?.title ?? "New conversation"}
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

        <ScopedSession
          key={session.sessionKey}
          threadId={session.threadId}
          onThreadCreated={(id) => {
            session.adoptThread(id);
            void threads.refresh();
          }}
          onTitle={threads.applyTitle}
        />
      </div>
    </section>
  );
}
