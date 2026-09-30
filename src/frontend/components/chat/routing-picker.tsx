/**
 * @fileoverview RoutingPicker — the honest replacement for the "model picker"
 * every ReUI `ai-chat-*` block ships.
 *
 * core-guardian chooses the provider and the model itself, per request, from a
 * catalogue this frontend never sees. There is therefore no model list to
 * offer, and a hardcoded one would be wrong the first time the router's
 * catalogue moved. What a caller really controls is how hard the router should
 * try — `ROUTING_PROFILES` (Fast / Balanced / Deep) — so that is what this sets
 * and what the label says.
 *
 * What was actually used is a separate, real fact, and it has two sources:
 * the `routed` SSE event (before the first token, rendered by `RoutedBadge`)
 * and the persisted assistant message's `provider`/`model`/`costUsd`
 * (rendered by `ReplyReceipt`). Both report; neither promises.
 */
import { ROUTING_PROFILES, type ChatMessage, type RoutedTo, type RoutingProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/reui/badge";
import { OptionSelect } from "@/components/ui/option-select";

export interface RoutingPickerProps {
  value: RoutingProfile;
  onChange: (profile: RoutingProfile) => void;
  /** Disabled while a reply is streaming — the turn is already routed. */
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Routing-profile select.
 *
 * @param props Current profile and its setter.
 * @returns A labelled select whose options carry the profile descriptions.
 */
export function RoutingPicker({ value, onChange, disabled, size = "sm", className }: RoutingPickerProps) {
  return (
    <OptionSelect<RoutingProfile>
      value={value}
      onChange={onChange}
      ariaLabel="Routing profile"
      size={size}
      className={cn("w-[112px]", disabled && "pointer-events-none opacity-50", className)}
      contentClassName="w-72"
      options={ROUTING_PROFILES.map((profile) => ({
        value: profile.value,
        label: profile.label,
        description: profile.description,
      }))}
    />
  );
}

/**
 * The provider/model core-guardian actually routed the turn to.
 *
 * Sits beside the routing picker: the picker states the request, this states
 * what served it. Renders nothing before the `routed` event arrives, rather
 * than showing a guess.
 *
 * @param props The `routed` value from `useChatThread`.
 * @returns A badge naming the live model, or null.
 */
export function RoutedBadge({ routed, className }: { routed: RoutedTo | null; className?: string }) {
  if (!routed?.model) return null;
  return (
    <Badge
      variant="outline"
      size="sm"
      title={routed.provider ? `Routed to ${routed.provider}` : undefined}
      className={cn("text-muted-foreground min-w-0 max-w-40 font-mono font-normal", className)}
    >
      <span className="min-w-0 truncate">{routed.model}</span>
    </Badge>
  );
}

/** Four significant figures is enough to tell a cent from a tenth of one. */
function formatCost(costUsd: number): string {
  return costUsd < 0.01 ? `$${costUsd.toFixed(4)}` : `$${costUsd.toFixed(2)}`;
}

export interface ReplyReceiptProps {
  message: Pick<ChatMessage, "provider" | "model" | "costUsd">;
  className?: string;
}

/**
 * The provider, model and cost the router actually spent on one reply.
 *
 * Renders nothing when the row carries none of them, rather than inventing a
 * placeholder — an older message may predate the columns.
 *
 * @param props The persisted assistant message.
 * @returns A muted meta line, or null.
 */
export function ReplyReceipt({ message, className }: ReplyReceiptProps) {
  const parts = [
    message.provider ?? undefined,
    message.model ?? undefined,
    message.costUsd != null ? formatCost(message.costUsd) : undefined,
  ].filter(Boolean) as string[];
  if (parts.length === 0) return null;

  return (
    <span className={cn("text-muted-foreground text-xs", className)}>
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 && (
            <span aria-hidden="true" className="bg-muted-foreground/40 mx-1.5 inline-block size-1 rounded-full align-middle" />
          )}
          <span className={index === parts.length - 1 && message.costUsd != null ? "tabular-nums" : undefined}>
            {part}
          </span>
        </span>
      ))}
    </span>
  );
}
