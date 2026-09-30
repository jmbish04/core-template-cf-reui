/**
 * @fileoverview The scope control for `/chat/scoped`: which workspace files the
 * chat may read, and what it is told about the ones it may not.
 *
 * The toggles are real drive files from `GET /api/files`. A file switched ON
 * has an excerpt of its bytes (`GET /api/files/{id}/content`) carried into the
 * turn; a file switched OFF is named to the model as a source it was NOT given,
 * with an instruction to say so rather than guess around it. That named gap is
 * the whole point of the block, so it is wired to the real toggle rather than
 * to a label.
 *
 * The excerpts ride in the MESSAGE, not in the system prompt: the message is
 * persisted in `chat_messages`, so re-opening the thread shows exactly what the
 * model was given, and the system prompt is capped at 4000 characters anyway.
 * The transcript folds the block away — see `splitScopedMessage`.
 */
import { useCallback, useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { humanSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DriveFile } from "@/components/chat";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FileIcon } from "lucide-react";

/** How many drive files the scope header offers. Enough to choose between. */
const MAX_SOURCES = 6;
/** Characters of each file carried into the turn. The rest is marked cut. */
const EXCERPT_CHARS = 1800;
/** Ceiling across all enabled files, well inside the 8000-character message. */
const EXCERPT_BUDGET = 5200;

/** Mime types this surface can excerpt. Anything else is offered but skipped. */
const READABLE = /^(text\/|application\/(json|xml|javascript|typescript|yaml|x-yaml))/;

const SOURCES_OPEN = "[sources]";
const SOURCES_CLOSE = "[/sources]";
const WITHHELD_OPEN = "[withheld]";

/**
 * The instruction that makes a switched-off file a named gap.
 *
 * Constant, so it fits the 4000-character system-prompt cap with room to spare
 * and never competes with the excerpts for space.
 */
export const SCOPE_SYSTEM_PROMPT =
  "Answer only from the sources quoted in the user's message. " +
  "If the question needs a file listed after [withheld], do not guess and do not " +
  "reason around it: name that file explicitly as a gap you were not given, say " +
  "what it would have told you, and answer only the part the given sources cover. " +
  "If no sources were given at all, say so plainly. " +
  "Prefer a GitHub-flavoured markdown table when comparing things, and a fenced " +
  "code block for code. Never invent figures.";

export interface ScopedSource {
  file: DriveFile;
  enabled: boolean;
  /** False when the file's type cannot be read as text — it is never excerpted. */
  readable: boolean;
}

export interface UseScopedSources {
  sources: ScopedSource[];
  loading: boolean;
  error: string | null;
  toggle: (id: string) => void;
  /** Compose the turn's message: excerpts, the withheld list, then the ask. */
  compose: (question: string) => Promise<string>;
}

/**
 * Load the drive files this surface can read, and track which are switched on.
 *
 * @returns The toggles plus `compose`, which builds the grounded message.
 */
export function useScopedSources(): UseScopedSources {
  const [sources, setSources] = useState<ScopedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: DriveFile[] }>("files")
      .then((res) => {
        if (cancelled) return;
        setSources(
          res.data
            .filter((entry) => entry.kind === "file")
            .slice(0, MAX_SOURCES)
            .map((file) => ({
              file,
              enabled: true,
              readable: READABLE.test(file.mimeType ?? ""),
            })),
        );
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the workspace drive.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((entry) => (entry.file.id === id ? { ...entry, enabled: !entry.enabled } : entry)),
    );
  }, []);

  const compose = useCallback(
    async (question: string) => {
      const on = sources.filter((entry) => entry.enabled && entry.readable);
      const off = sources.filter((entry) => !entry.enabled);

      const quoted: string[] = [];
      let budget = EXCERPT_BUDGET;

      for (const entry of on) {
        if (budget <= 0) break;
        let body: string;
        try {
          const response = await fetch(`/api/files/${entry.file.id}/content`);
          if (!response.ok) continue;
          body = await response.text();
        } catch {
          // A source that cannot be fetched is not a source. It is left out of
          // the quoted block, which is what stops it being answered from.
          continue;
        }
        const room = Math.min(EXCERPT_CHARS, budget);
        const excerpt = body.length > room ? `${body.slice(0, room)}\n… (excerpt cut)` : body;
        budget -= excerpt.length;
        quoted.push(`### ${entry.file.name}\n${excerpt}`);
      }

      const blocks: string[] = [];
      if (quoted.length) blocks.push(`${SOURCES_OPEN}\n${quoted.join("\n\n")}\n${SOURCES_CLOSE}`);
      if (off.length) {
        blocks.push(`${WITHHELD_OPEN} ${off.map((entry) => entry.file.name).join("; ")}`);
      }
      blocks.push(question);
      return blocks.join("\n\n");
    },
    [sources],
  );

  return { sources, loading, error, toggle, compose };
}

/**
 * Read a composed turn back apart, for the transcript.
 *
 * Round-trips with `compose`. A message without the markers — anything sent
 * from another surface — comes back as the question alone, so an unexpected
 * shape shows the text rather than hiding it.
 *
 * @param content The persisted user message.
 * @returns The quoted sources, the withheld file names, and the ask.
 */
export function splitScopedMessage(content: string): {
  sources: string | null;
  withheld: string[];
  question: string;
} {
  let rest = content;
  let sources: string | null = null;

  if (rest.startsWith(`${SOURCES_OPEN}\n`)) {
    const end = rest.indexOf(`\n${SOURCES_CLOSE}`);
    if (end >= 0) {
      sources = rest.slice(SOURCES_OPEN.length + 1, end);
      rest = rest.slice(end + SOURCES_CLOSE.length + 1).trimStart();
    }
  }

  let withheld: string[] = [];
  if (rest.startsWith(`${WITHHELD_OPEN} `)) {
    const lineEnd = rest.indexOf("\n");
    const line = lineEnd < 0 ? rest : rest.slice(0, lineEnd);
    withheld = line
      .slice(WITHHELD_OPEN.length + 1)
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);
    rest = lineEnd < 0 ? "" : rest.slice(lineEnd + 1).trimStart();
  }

  return { sources, withheld, question: rest.trim() || content };
}

/**
 * The ask box header: one switch per drive file.
 *
 * @param props The loaded sources and the toggle handler.
 * @returns A row of switches, or the drive's loading/empty state.
 */
export function ScopeHeader({
  sources,
  loading,
  onToggle,
  className,
}: {
  sources: ScopedSource[];
  loading: boolean;
  onToggle: (id: string) => void;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("flex flex-wrap gap-2", className)} aria-hidden="true">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-36" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-xs", className)}>
        The drive is empty, so this chat has nothing to read. Upload a file on the Files
        page and it appears here.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <span className="text-muted-foreground text-xs">Files this chat may read</span>
      {sources.map(({ file, enabled, readable }) => (
        // A span, not a label: Base UI's Switch renders a button, so a wrapping
        // label would associate with nothing. The switch names itself instead.
        <span
          key={file.id}
          className={cn(
            "flex min-w-0 items-center gap-2 text-xs",
            !enabled && "text-muted-foreground",
          )}
        >
          <Switch
            size="sm"
            checked={enabled}
            onCheckedChange={() => onToggle(file.id)}
            aria-label={`Let this chat read ${file.name}`}
          />
          <FileIcon className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 max-w-40 truncate">{file.name}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {readable ? humanSize(file.size) : "not text"}
          </span>
        </span>
      ))}
    </div>
  );
}
