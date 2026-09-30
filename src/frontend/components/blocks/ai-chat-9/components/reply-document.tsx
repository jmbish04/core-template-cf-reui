/**
 * @fileoverview A reply rendered as a small document rather than a bubble.
 *
 * ReUI `ai-chat-9` shows each answer as sections, bullets and code artifacts
 * with its working folded behind a thought row and its sources listed at the
 * foot. All three are real here:
 *
 * - the prose and the sections are the reply's own markdown;
 * - a code artifact is a fenced block lifted out of that markdown by
 *   `markdownFences` and handed to ReUI's Shiki `CodeBlock`, so nothing is
 *   re-highlighted by hand;
 * - the sources are the drive files that were attached to the ask, read back
 *   out of the persisted user turn. Nothing is cited that was not attached.
 */
import { CodeBlock } from "@/components/ui/code-block";
import { Markdown } from "@/components/ui/markdown";
import { markdownFences } from "@/components/reui/code-block/code-block";
import { cn } from "@/lib/utils";
import { FileIcon } from "lucide-react";

/**
 * The names of the drive files attached to one ask.
 *
 * Mirrors `describeAttachments` in the shared chat layer, which is what wrote
 * the line. A wording change there makes this return nothing, which shows no
 * sources — never an invented one.
 *
 * @param askContent The persisted user message that carried the attachments.
 * @returns The attached file names, or an empty array.
 * @example
 * citedFileNames("Files referenced from the workspace drive: spec.md (text/markdown, 4 KB).")
 * // → ["spec.md"]
 */
export function citedFileNames(askContent: string): string[] {
  const match = askContent.match(/Files referenced from the workspace drive: (.+?)\.\s*$/m);
  if (!match) return [];
  return match[1]!
    .split("; ")
    .map((entry) => entry.replace(/\s*\([^()]*\)\s*$/, "").trim())
    .filter(Boolean);
}

/**
 * The files an answer could have drawn on, listed under it.
 *
 * @param props The file names read back from the ask.
 * @returns A source row, or null when the ask carried no attachments.
 */
export function SourceRow({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-muted-foreground text-xs">Sources</span>
      {names.map((name) => (
        <span
          key={name}
          className="border-border/60 text-muted-foreground flex min-w-0 max-w-56 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
        >
          <FileIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Render one reply body: prose sections, with fenced blocks as artifacts.
 *
 * @param props The reply markdown and whether it is still streaming.
 * @returns The document body.
 */
export function ReplyDocument({
  content,
  streaming = false,
  className,
}: {
  content: string;
  /** A fence that has not closed yet still renders, marked as still arriving. */
  streaming?: boolean;
  className?: string;
}) {
  const parts = markdownFences(content);

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)} data-answer-body>
      {parts.map((part, index) =>
        part.type === "code" ? (
          <CodeBlock
            key={index}
            code={part.content}
            language={part.language ?? "txt"}
            maxLines={streaming && part.open ? undefined : 24}
          />
        ) : (
          <Markdown key={index}>{part.content}</Markdown>
        ),
      )}
    </div>
  );
}
