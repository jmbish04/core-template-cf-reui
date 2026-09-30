/**
 * @fileoverview SelectionQuote — select a sentence in an answer, reply to that
 * line.
 *
 * Adapted from ReUI `ai-chat-4`'s quote pill. It anchors into the transcript's
 * own box (not the viewport) so scrolling moves the pill or clears it, rather
 * than leaving it floating over the wrong line. It only fires on a selection
 * inside an element marked `data-answer-body` — the attribute `Transcript`
 * puts on every assistant body.
 *
 * The quote is real context: the surface prepends it to the outgoing message
 * via `quotedPrompt`, so the model answers the line that was selected instead
 * of guessing from position.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { MessageSquareTextIcon, XIcon } from "lucide-react";

/** Below this much room above the selection the pill would leave the box. */
const HEADROOM = 40;
/** Keeps the pill's own width inside the panel at either end of a line. */
const INSET = 56;
/** A one-word selection is almost always an accident, not a quote. */
const MIN_QUOTE = 8;

type Anchor = { x: number; y: number; below: boolean; text: string };

/**
 * Compose the message actually sent when a line was quoted.
 *
 * @param quote The selected sentence, or null.
 * @param text The reader's own message.
 * @returns The message with the quoted line as explicit context.
 */
export function quotedPrompt(quote: string | null, text: string): string {
  if (!quote) return text;
  return `Regarding this line from your previous answer:\n\n> ${quote}\n\n${text}`;
}

export interface SelectionQuotePillProps {
  /** The positioned transcript wrapper the pill is measured and placed into. */
  host: RefObject<HTMLDivElement | null>;
  onQuote: (quote: string) => void;
}

/**
 * The floating "Reply" pill that appears over a selection in an answer.
 *
 * @param props The transcript wrapper and the quote handler.
 * @returns The pill, or null when there is no qualifying selection.
 */
export function SelectionQuotePill({ host, onQuote }: SelectionQuotePillProps) {
  const rangeRef = useRef<Range | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;

    function measure(range: Range) {
      if (!box) return null;
      const rect = range.getBoundingClientRect();
      const frame = box.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      if (rect.bottom < frame.top || rect.top > frame.bottom) return null;
      const below = rect.top - frame.top < HEADROOM;
      const limit = Math.max(INSET, frame.width - INSET);
      return {
        x: Math.min(Math.max(rect.left + rect.width / 2 - frame.left, INSET), limit),
        y: (below ? rect.bottom : rect.top) - frame.top,
        below,
      };
    }

    function clear() {
      rangeRef.current = null;
      setAnchor(null);
    }

    function onSelectionChange() {
      const selection = window.document.getSelection();
      if (!box || !selection || selection.isCollapsed) return clear();
      const node = selection.anchorNode;
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      const body = element?.closest("[data-answer-body]");
      const text = selection.toString().trim();
      if (!body || !box.contains(body) || text.length < MIN_QUOTE) return clear();
      rangeRef.current = selection.getRangeAt(0);
      const spot = measure(rangeRef.current);
      setAnchor(spot ? { ...spot, text } : null);
    }

    function reposition() {
      const range = rangeRef.current;
      if (!range) return;
      const spot = measure(range);
      setAnchor((current) => (current && spot ? { ...current, ...spot } : null));
    }

    // Scroll fires on the element that scrolled and does not bubble, so the
    // listener goes on the viewport itself, not on the wrapper around it.
    const viewport = box.querySelector("[data-slot=message-scroller-viewport]");
    window.document.addEventListener("selectionchange", onSelectionChange);
    viewport?.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", clear);
    return () => {
      window.document.removeEventListener("selectionchange", onSelectionChange);
      viewport?.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", clear);
    };
  }, [host]);

  if (!anchor) return null;

  return (
    <Button
      size="sm"
      aria-label="Reply to the selected sentence"
      onClick={() => {
        onQuote(anchor.text);
        window.document.getSelection()?.removeAllRanges();
      }}
      style={{ left: anchor.x, top: anchor.y }}
      className={`absolute z-10 h-7 -translate-x-1/2 gap-1.5 rounded-full px-2.5 text-xs shadow-md ${
        anchor.below ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]"
      }`}
    >
      <MessageSquareTextIcon className="size-3.5 shrink-0" aria-hidden="true" />
      Reply
    </Button>
  );
}

/**
 * The composer chip showing which line the next message answers.
 *
 * @param props The quoted text and a clear handler.
 * @returns The chip, or null when nothing is quoted.
 */
export function QuotedLine({ quote, onClear }: { quote: string | null; onClear: () => void }) {
  if (!quote) return null;
  return (
    <div className="border-primary/40 flex w-full min-w-0 items-start gap-2 border-s-2 ps-2">
      <p className="text-muted-foreground min-w-0 flex-1 line-clamp-2 text-xs italic">{quote}</p>
      <Button variant="ghost" size="icon-xs" aria-label="Clear the quoted line" onClick={onClear}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
