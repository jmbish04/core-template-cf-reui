/**
 * @fileoverview `/chat/voice` — a docked voice-first assistant.
 *
 * Adapted from ReUI `ai-chat-8`. Kept: the thread switcher, the widen toggle,
 * the transport, the playable take with its transcription, and the answer that
 * arrives in whichever shape the question deserves.
 *
 * The voice half is the browser's own: `MediaRecorder` for the take,
 * `SpeechRecognition` for the transcription (see `use-voice.ts`). There is no
 * server-side transcription in this template, so none is claimed — and where
 * the API is missing the mic is not rendered at all, with a line saying typing
 * works instead.
 *
 * Removed from the stock block: `data.tsx` (759 lines of scripted turns,
 * availability grids and invented sources), the `setInterval` transport over a
 * hardcoded note length, the rotating answer-shape script, the fake
 * transcription delay, and the slot picker over invented calendar slots.
 *
 * MOUNTING: `MediaRecorder` and `SpeechRecognition` are browser-only, so this
 * island must be `client:only="react"`.
 */
import { useState } from "react";

import {
  ChatComposer,
  ChatErrorBanner,
  ThreadList,
  Transcript,
  useBelow,
  useThreadSession,
  useThreads,
  type ThreadSession,
} from "@/components/chat";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatThread } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { MicIcon, MinimizeIcon, MaximizeIcon, SquareIcon } from "lucide-react";

import { StructuredAnswer } from "./structured-answer";
import { SHAPE_SYSTEM_PROMPT } from "./answer-shape";
import { VoiceTakeCard } from "./voice-take";
import { useVoice, type VoiceTake } from "./use-voice";

function Session({
  session,
  wide,
  onTitle,
  onThreadCreated,
}: {
  session: ThreadSession;
  wide: boolean;
  onTitle: (id: string, title: string) => void;
  onThreadCreated: (id: string) => void;
}) {
  const [takes, setTakes] = useState<VoiceTake[]>([]);
  const [sentTakeIds, setSentTakeIds] = useState<string[]>([]);
  const [seed, setSeed] = useState<{ text: string } | null>(null);

  const chat = useChatThread({
    threadId: session.threadId,
    systemPrompt: SHAPE_SYSTEM_PROMPT,
    onThreadCreated: (id) => {
      session.adoptThread(id);
      onThreadCreated(id);
    },
    onTitle,
  });

  const voice = useVoice((take) => setTakes((prev) => [...prev, take]));

  function sendTake(take: VoiceTake) {
    setSentTakeIds((prev) => [...prev, take.id]);
    void chat.send(take.transcript);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        // This surface's answers are not markdown: the model may return a
        // fenced JSON shape, so the body goes through StructuredAnswer, which
        // degrades to prose while the fence is still half-written.
        renderBody={(content) => <StructuredAnswer text={content} />}
        contentClassName={wide ? "max-w-none" : "max-w-3xl"}
        empty={
          <Empty className="m-auto">
            <EmptyHeader className="max-w-md">
              <EmptyTitle>Ask out loud</EmptyTitle>
              <EmptyDescription>
                {voice.supported
                  ? "Hold the mic, say the question, and the take lands here with its transcription. The answer picks its own shape."
                  : "This browser has no speech recognition, so the mic is hidden. Type the question below instead."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <div className="flex shrink-0 flex-col gap-3 border-t p-3">
        <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} />
        <ChatErrorBanner error={voice.error} onDismiss={voice.clearError} />

        {takes.length > 0 && (
          <div
            className={cn("mx-auto flex w-full flex-col gap-2", wide ? "max-w-none" : "max-w-3xl")}
            aria-label="Your takes"
          >
            {takes.map((take) => (
              <VoiceTakeCard
                key={take.id}
                take={take}
                sent={sentTakeIds.includes(take.id)}
                onSend={() => sendTake(take)}
                onEdit={(text) => setSeed({ text })}
              />
            ))}
          </div>
        )}

        {voice.recording && (
          <p role="status" className="text-muted-foreground mx-auto w-full max-w-3xl text-xs">
            Recording — {voice.interim || "listening…"}
          </p>
        )}

        <ChatComposer
          onSend={(text) => void chat.send(text)}
          onStop={chat.stop}
          streaming={chat.streaming}
          profile={chat.profile}
          onProfileChange={chat.setProfile}
          routed={chat.routed}
          seed={seed}
          placeholder="Say it, or type it…"
          className={cn("mx-auto w-full", wide ? "max-w-none" : "max-w-3xl")}
          addons={
            // Rendered only where both browser APIs exist: a mic that cannot
            // transcribe is a control that silently does nothing.
            voice.supported ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={voice.recording ? "destructive" : "ghost"}
                      aria-label={voice.recording ? "Stop recording" : "Record a question"}
                      aria-pressed={voice.recording}
                      onClick={() => (voice.recording ? voice.stop() : void voice.start())}
                      className="rounded-full"
                    />
                  }
                >
                  {voice.recording ? (
                    <SquareIcon className="size-3 fill-current" aria-hidden="true" />
                  ) : (
                    <MicIcon aria-hidden="true" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{voice.recording ? "Stop and transcribe" : "Record a question"}</TooltipContent>
              </Tooltip>
            ) : null
          }
        />
      </div>
    </div>
  );
}

export interface ChatVoiceProps {
  /** `?t` as the Astro page read it during SSR. */
  initialThreadId?: string;
}

/**
 * The `/chat/voice` island.
 *
 * @param props The thread to resume, from the query string.
 * @returns The thread switcher beside the voice-first assistant.
 */
export function ChatVoice({ initialThreadId }: ChatVoiceProps) {
  const session = useThreadSession(initialThreadId);
  const threads = useThreads();
  const [wide, setWide] = useState(false);
  const narrow = useBelow(1024);

  return (
    <TooltipProvider>
      <div className="bg-card flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        {!narrow && (
          <div className="flex w-64 shrink-0 flex-col border-e p-2">
            <ThreadList
              threads={threads.threads}
              activeId={session.threadId}
              loading={threads.loading}
              onSelect={session.openThread}
              onNew={session.newThread}
              onRename={(id, title) => void threads.rename(id, title)}
              onDelete={(id) => void threads.remove(id)}
            />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <h2 className="text-sm font-medium">Voice assistant</h2>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={wide ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={wide ? "Narrow the answer column" : "Widen the answer column"}
                    aria-pressed={wide}
                    onClick={() => setWide((on) => !on)}
                    className="ms-auto"
                  />
                }
              >
                {wide ? <MinimizeIcon aria-hidden="true" /> : <MaximizeIcon aria-hidden="true" />}
              </TooltipTrigger>
              <TooltipContent>{wide ? "Narrow" : "Widen"}</TooltipContent>
            </Tooltip>
          </header>

          <Session
            key={session.sessionKey}
            session={session}
            wide={wide}
            onTitle={threads.applyTitle}
            onThreadCreated={() => void threads.refresh()}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
