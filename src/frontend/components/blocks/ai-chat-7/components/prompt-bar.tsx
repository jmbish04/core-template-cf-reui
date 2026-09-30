/**
 * @fileoverview The one prompt bar that drives both panes.
 *
 * The shared `ChatComposer` carries a routing picker, which is right for a
 * single-thread surface and wrong here: each pane owns its own profile in its
 * own header, so a third picker in the middle would contradict them. This is
 * the same field and the same Enter/Shift+Enter contract, minus that control.
 */
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

export interface PromptBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
  /** True while either pane is still streaming. */
  streaming: boolean;
}

/**
 * Render the shared prompt bar.
 *
 * @param props The send/stop handlers and the combined streaming flag.
 * @returns A form whose submit sends the trimmed draft to both panes.
 */
export function PromptBar({ onSend, onStop, streaming }: PromptBarProps) {
  const [text, setText] = useState("");

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || streaming) return;
    setText("");
    onSend(body);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // An IME candidate window also fires Enter; committing a word there must
    // not post the message.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={submit} className="w-full">
      <InputGroup className="flex-col items-stretch">
        <InputGroupTextarea
          value={text}
          rows={2}
          aria-label="Message for both profiles"
          placeholder="Ask both profiles the same question…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-16"
        />
        <InputGroupAddon align="block-end" className="gap-2">
          <span className="text-muted-foreground text-xs">One prompt, both profiles, in the same tick</span>
          {streaming ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              aria-label="Stop both answers"
              onClick={onStop}
              className="ms-auto rounded-full"
            >
              <SquareIcon className="size-3 fill-current" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send to both profiles"
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
