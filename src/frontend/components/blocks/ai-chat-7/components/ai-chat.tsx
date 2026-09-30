/**
 * @fileoverview `/chat/compare` — one prompt, two routing profiles, two real
 * streams, side by side.
 *
 * Adapted from ReUI `ai-chat-7`. The block's shape is kept: resizable panes
 * (tabs below `md`), the scroll lock, per-answer actions, and the mirrored
 * scoreboard that settles into a verdict and an A/B pick.
 *
 * What changed: the panes are not two models from a hardcoded catalogue — this
 * router picks the model itself, so the two sides are two routing PROFILES
 * (Fast against Deep) and the model each one was actually served by is
 * reported from its `routed` event. Both sides are separate D1 threads and
 * separate SSE streams started in the same tick.
 *
 * Removed from the stock block: the simulated clock (`clock.tsx`,
 * `pane-view.ts`) that produced latency and token rate from a scripted
 * per-model speed, the baked price table, the fake 429 with its scripted
 * recovery, the canned seed exchanges, and the vote's implied record — the
 * pick is local and labelled as such.
 */
import { useRef, useState } from "react";

import { COMPARE_PARAMS, useBelow, writeParam } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatThread } from "@/lib/chat";
import { LinkIcon, PlusIcon } from "lucide-react";

import { ComparePane } from "./compare-pane";
import { paneMetrics } from "./pane-metrics";
import { PromptBar } from "./prompt-bar";
import { Scoreboard, type Side } from "./scoreboard";
import { useScrollLock } from "./use-scroll-lock";

const LEFT_LABEL = "Fast";
const RIGHT_LABEL = "Deep";

function Comparison({
  initialLeft,
  initialRight,
  onReset,
}: {
  initialLeft?: string;
  initialRight?: string;
  onReset: () => void;
}) {
  // Two hooks, two threads, two streams. Owned here rather than inside the
  // panes so one send can start both in the same tick.
  //
  // Both ids go into the URL as they are created, so a reload — or a shared
  // link — resumes THIS comparison. One `?t` cannot describe two threads,
  // which is why these use `COMPARE_PARAMS` rather than the shared session
  // helper. `replace: true` keeps a comparison one entry in history.
  const left = useChatThread({
    profile: "fast",
    threadId: initialLeft,
    onThreadCreated: (id) => writeParam(COMPARE_PARAMS.left, id, true),
  });
  const right = useChatThread({
    profile: "deep",
    threadId: initialRight,
    onThreadCreated: (id) => writeParam(COMPARE_PARAMS.right, id, true),
  });

  const [vote, setVote] = useState<Side | null>(null);
  const [locked, setLocked] = useState(true);
  const [tab, setTab] = useState<Side>("a");

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const narrow = useBelow(768);

  const turns = Math.min(left.messages.length, right.messages.length);
  useScrollLock(locked && !narrow, leftRef, rightRef, turns);

  const streaming = left.streaming || right.streaming;

  function send(text: string) {
    // A new exchange retires the pick: it argued about two specific answers.
    setVote(null);
    void left.send(text);
    void right.send(text);
  }

  function stop() {
    left.stop();
    right.stop();
  }

  const panes = [
    {
      side: "a" as const,
      label: LEFT_LABEL,
      chat: left,
      ref: leftRef,
      actions: (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={locked ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Lock both transcripts to one scroll position"
                aria-pressed={locked}
                onClick={() => setLocked((on) => !on)}
                className="max-md:hidden"
              />
            }
          >
            <LinkIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{locked ? "Scroll locked" : "Scroll unlocked"}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      side: "b" as const,
      label: RIGHT_LABEL,
      chat: right,
      ref: rightRef,
      actions: (
        <Button variant="ghost" size="sm" onClick={onReset} disabled={streaming}>
          <PlusIcon aria-hidden="true" />
          New
        </Button>
      ),
    },
  ];

  return (
    <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      {narrow ? (
        <Tabs
          value={tab}
          onValueChange={(value) => value && setTab(value as Side)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-3 mt-3 grid shrink-0 grid-cols-2">
            {panes.map((pane) => (
              <TabsTrigger key={pane.side} value={pane.side}>
                {pane.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {panes.map((pane) => (
            // keepMounted so the hidden side keeps streaming rather than
            // unmounting the transcript that a live reply is landing in.
            <TabsContent key={pane.side} value={pane.side} keepMounted className="min-h-0 flex-1 inert:hidden">
              <ComparePane
                ref={pane.ref}
                label={pane.label}
                chat={pane.chat}
                preferred={vote === pane.side}
                onPrefer={() => setVote(vote === pane.side ? null : pane.side)}
                headerActions={pane.actions}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="50" minSize={280} className="flex min-h-0">
            <ComparePane
              ref={leftRef}
              label={LEFT_LABEL}
              chat={left}
              preferred={vote === "a"}
              onPrefer={() => setVote(vote === "a" ? null : "a")}
              headerActions={panes[0]!.actions}
            />
          </ResizablePanel>
          <ResizableHandle
            title="Drag to resize the panes"
            className="hover:bg-primary data-[separator=hover]:bg-primary data-[separator=active]:bg-primary relative z-10 cursor-col-resize transition-colors after:w-4"
          />
          <ResizablePanel defaultSize="50" minSize={280} className="flex min-h-0">
            <ComparePane
              ref={rightRef}
              label={RIGHT_LABEL}
              chat={right}
              preferred={vote === "b"}
              onPrefer={() => setVote(vote === "b" ? null : "b")}
              headerActions={panes[1]!.actions}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {turns > 0 && (
        <Scoreboard
          left={{ label: LEFT_LABEL, metrics: paneMetrics(left) }}
          right={{ label: RIGHT_LABEL, metrics: paneMetrics(right) }}
          streaming={streaming}
          vote={vote}
          onVote={setVote}
        />
      )}

      <div className="shrink-0 border-t p-3">
        <PromptBar onSend={send} onStop={stop} streaming={streaming} />
      </div>
    </div>
  );
}

/**
 * The `/chat/compare` island.
 *
 * @returns Two panes answering one prompt, with the scoreboard beneath.
 */
export function ChatCompare({
  initialLeft,
  initialRight,
}: {
  initialLeft?: string;
  initialRight?: string;
}) {
  // "New comparison" remounts both threads AND drops both ids from the URL,
  // so a reload after a reset does not resurrect the pair that was just
  // retired. The seeded ids are deliberately not re-applied to a later
  // generation — only the first mount resumes.
  const [generation, setGeneration] = useState(0);
  return (
    <TooltipProvider>
      <Comparison
        key={generation}
        initialLeft={generation === 0 ? initialLeft : undefined}
        initialRight={generation === 0 ? initialRight : undefined}
        onReset={() => {
          writeParam(COMPARE_PARAMS.left, undefined, true);
          writeParam(COMPARE_PARAMS.right, undefined, true);
          setGeneration((n) => n + 1);
        }}
      />
    </TooltipProvider>
  );
}
