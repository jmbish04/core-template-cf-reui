/**
 * @fileoverview ChatComposer — the InputGroup composer every chat surface uses.
 *
 * Owns the draft text, Enter-to-send (Shift+Enter for a newline), the
 * send/stop swap and the routing picker. Anything a surface adds — attachment
 * chips, a quoted line, a scope selector — goes in `leading` (above the field)
 * or `addons` (beside the routing picker), so no surface has to re-implement
 * the field itself.
 *
 * `seed` fills the field from outside (a prompt starter, an Edit action). It is
 * an object rather than a string so the same text can be re-seeded: a new
 * object identity is the signal, which a bare string could not give.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import type { RoutedTo, RoutingProfile } from "@/lib/chat";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";

import { RoutedBadge, RoutingPicker } from "./routing-picker";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

export interface ChatComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  profile: RoutingProfile;
  onProfileChange: (profile: RoutingProfile) => void;
  /** Provider/model the router actually used, shown beside the picker. */
  routed?: RoutedTo | null;
  placeholder?: string;
  /** Re-seed the field from outside. A fresh object re-applies the same text. */
  seed?: { text: string } | null;
  /** Rendered above the field — attachment chips, a quoted line. */
  leading?: ReactNode;
  /** Rendered beside the routing picker — extra per-surface controls. */
  addons?: ReactNode;
  className?: string;
}

/**
 * The shared message composer.
 *
 * @param props Send/stop handlers, the routing profile, and optional slots.
 * @returns A form whose submit sends the trimmed draft.
 */
export function ChatComposer({
  onSend,
  onStop,
  streaming,
  profile,
  onProfileChange,
  routed = null,
  placeholder = "Ask anything about this workspace…",
  seed,
  leading,
  addons,
  className,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    fieldRef.current?.focus();
  }, [seed]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || streaming) return;
    setText("");
    onSend(body);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className={cn("w-full", className)}>
      <InputGroup className="flex-col items-stretch">
        {leading && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
            {leading}
          </InputGroupAddon>
        )}

        <InputGroupTextarea
          ref={fieldRef}
          value={text}
          rows={2}
          aria-label="Message"
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-48 min-h-16"
        />

        <InputGroupAddon align="block-end" className="gap-2">
          <RoutingPicker value={profile} onChange={onProfileChange} disabled={streaming} />
          <RoutedBadge routed={routed} />
          {addons}

          {streaming ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              aria-label="Stop generating"
              onClick={onStop}
              className="ms-auto rounded-full"
            >
              <SquareIcon className="size-3 fill-current" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send message"
              disabled={!text.trim()}
              className="ms-auto rounded-full"
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
