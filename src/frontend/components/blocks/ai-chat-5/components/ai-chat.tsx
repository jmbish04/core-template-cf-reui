/**
 * @fileoverview `/chat/sources` — a centred new-chat screen whose composer
 * sits in a ReUI Frame, with the frame footer as a live source strip.
 *
 * Adapted from ReUI `ai-chat-5`. The block's shape is kept — centred column,
 * frame-footer strip, mode chips, per-source receipt — and everything behind
 * it is real: the six toggles are this workspace's own REST collections, a
 * switched-on source is fetched and put into the turn's `systemPrompt`, a
 * switched-off one genuinely is not, and the receipt reports what the prompt
 * actually carried.
 *
 * Removed from the stock block: the nine fake integrations (Google Drive,
 * Slack, Dropbox, Zoom, …), the scripted per-mode answers, the timed step
 * reveal, the invented attachment list, and the hardcoded model tiers — the
 * router picks the model, so the control is `RoutingPicker`.
 */
import { useState } from "react";

import { ChatComposer, ChatErrorBanner, Transcript, useThreadSession, type ThreadSession } from "@/components/chat";
import { Frame, FrameFooter, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useChatThread } from "@/lib/chat";
import { PlusIcon } from "lucide-react";

import { MODES, modePrompt, type ModeId } from "./job-modes";
import { ModeChips } from "./mode-chips";
import { SourceReceiptPanel } from "./source-receipt";
import { SourceStrip } from "@/components/chat/source-strip";
import { useScope } from "@/components/chat/use-scope";
import { describeRead, type SourceReceipt } from "@/components/chat/workspace-sources";

/** Opens with the three collections a project dashboard is mostly about. */
const INITIAL_SCOPE = ["tasks", "projects", "notes"] as const;

/** What the last send actually read, kept beside the turn it belongs to. */
interface Receipt {
  prompt: string;
  rows: SourceReceipt[];
}

function Surface({ session }: { session: ThreadSession }) {
  const scope = useScope([...INITIAL_SCOPE]);
  const [modeId, setModeId] = useState<ModeId>("ask");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const mode = MODES.find((item) => item.id === modeId) ?? MODES[0]!;

  const chat = useChatThread({
    threadId: session.threadId,
    systemPrompt: scope.context || undefined,
    onThreadCreated: session.adoptThread,
  });

  function send(text: string) {
    // The receipt is taken from the scope as it stands at send time, which is
    // the same value the hook closed over for `systemPrompt`.
    setReceipt({ prompt: text, rows: describeRead(scope.loaded) });
    void chat.send(modePrompt(mode, text));
  }

  const started = chat.messages.length > 0 || chat.streaming;

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col justify-center gap-4">
        {started ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {receipt && <SourceReceiptPanel prompt={receipt.prompt} rows={receipt.rows} />}
              </div>
              <Button variant="ghost" size="sm" onClick={session.newThread} className="shrink-0">
                <PlusIcon aria-hidden="true" />
                New
              </Button>
            </div>

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
              className="min-h-64"
              contentClassName="px-0 sm:px-0"
            />
          </div>
        ) : (
          <Empty className="flex-none gap-0 pb-8">
            <EmptyHeader className="max-w-md gap-5">
              <EmptyTitle className="text-2xl tracking-tight">What should I look through?</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} />

        <Frame spacing="sm" className="shrink-0">
          {/* The panel paints the card, so the composer inside drops its own. */}
          <FramePanel fit className="p-0">
            <ChatComposer
              onSend={send}
              onStop={chat.stop}
              streaming={chat.streaming}
              profile={chat.profile}
              onProfileChange={chat.setProfile}
              routed={chat.routed}
              placeholder={mode.placeholder}
              className="[&_[data-slot=input-group]]:rounded-(--frame-panel-radius) [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
            />
          </FramePanel>

          <FrameFooter>
            <SourceStrip loaded={scope.loaded} onToggle={scope.toggle} />
          </FrameFooter>
        </Frame>

        {/* The chips only steer the next question, so a started thread hides
            them rather than offering a switch that changes nothing on screen. */}
        {started ? null : <ModeChips mode={modeId} onModeChange={setModeId} />}
      </div>
    </TooltipProvider>
  );
}

export interface ChatSourcesProps {
  /** `?t` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The `/chat/sources` island.
 *
 * @param props The thread to resume, from the query string.
 * @returns The scoped-sources chat surface.
 */
export function ChatSources({ initialThreadId }: ChatSourcesProps) {
  const session = useThreadSession(initialThreadId);
  // Re-keyed on a deliberate switch so the chat hook re-seeds from the new id.
  return <Surface key={session.sessionKey} session={session} />;
}
