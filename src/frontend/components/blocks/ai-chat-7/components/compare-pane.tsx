/**
 * @fileoverview One side of the comparison: a routing profile, its own thread,
 * and its own live transcript.
 *
 * The stock block's pane header is a model picker over a hardcoded catalogue.
 * core-guardian chooses the model per request, so the control is the routing
 * profile and the header reports the model that ACTUALLY served the turn,
 * which arrives on the `routed` event before the first token.
 */
import { forwardRef, type ReactNode } from "react";

import { ChatErrorBanner, RoutedBadge, RoutingPicker, Transcript } from "@/components/chat";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { UseChatThread } from "@/lib/chat";
import { ThumbsUpIcon } from "lucide-react";

export interface ComparePaneProps {
  /** "Fast" / "Deep" — what this side was asked for. */
  label: string;
  chat: UseChatThread;
  /** True when this side is the current local pick. */
  preferred: boolean;
  onPrefer: () => void;
  /** Extra header controls (the scroll lock lives on the left pane). */
  headerActions?: ReactNode;
}

/**
 * Render one comparison pane.
 *
 * @param props The pane's label, its chat state and the pick handler.
 * @returns The pane, wrapped in the div the scroll lock measures.
 */
export const ComparePane = forwardRef<HTMLDivElement, ComparePaneProps>(function ComparePane(
  { label, chat, preferred, onPrefer, headerActions },
  ref,
) {
  const lastReplyId = [...chat.messages].reverse().find((message) => message.role === "assistant")?.id;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Badge variant="secondary" size="sm" className="shrink-0">
          {label}
        </Badge>
        <RoutingPicker value={chat.profile} onChange={chat.setProfile} disabled={chat.streaming} />
        <RoutedBadge routed={chat.routed} />
        {headerActions && <div className="ms-auto flex items-center gap-1">{headerActions}</div>}
      </header>

      <ChatErrorBanner error={chat.error} onDismiss={chat.clearError} className="m-3" />

      <div ref={ref} className="relative flex min-h-0 flex-1 flex-col">
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
          contentClassName="max-w-none px-3 sm:px-3"
          replyActions={(message) =>
            message.id === lastReplyId ? (
              <Button
                variant={preferred ? "secondary" : "ghost"}
                size="icon-xs"
                aria-label={`Prefer the ${label} answer`}
                aria-pressed={preferred}
                onClick={onPrefer}
              >
                <ThumbsUpIcon aria-hidden="true" />
              </Button>
            ) : null
          }
          empty={
            <Empty className="m-auto">
              <EmptyHeader>
                <EmptyTitle>{label}</EmptyTitle>
                <EmptyDescription>Send a prompt below to run it through both profiles at once.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>
    </div>
  );
});
