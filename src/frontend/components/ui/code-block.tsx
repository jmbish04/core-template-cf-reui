/**
 * @fileoverview `CodeBlock` — the docs/playbook code sample, built on ReUI's
 * `components/reui/code-block` rather than a hand-rolled highlighter.
 *
 * This file is an ADAPTER, not an implementation. It keeps the small prop
 * surface the documentation pages already use (`code`, `language`,
 * `filename`, `showLineNumbers`, or several `files` as tabs) and composes
 * ReUI's primitive underneath, so the highlighting, copy button, wrap toggle
 * and theming all come from the design system.
 *
 * SSR SAFETY: ReUI's CodeBlock highlights on the client. Mount it with
 * `client:visible` (or `client:load`) from an Astro page.
 *
 * @example
 * <CodeBlock client:visible filename="wrangler.jsonc" language="json" code={src} showLineNumbers />
 *
 * @example Multi-file tabs:
 * <CodeBlock client:visible files={[{ filename: "a.ts", language: "ts", code: a }]} />
 */
import { useState } from "react";

import {
  CodeBlock as ReuiCodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockTitle,
} from "@/components/reui/code-block/code-block";
import { cn } from "@/lib/utils";

export interface CodeBlockFile {
  filename: string;
  language?: string;
  code: string;
}

export interface CodeBlockProps {
  /** Single-file source. Ignored when `files` is given. */
  code?: string;
  language?: string;
  /** Header label for the single-file form. */
  filename?: string;
  /** Two or more files render as tabs in the header. */
  files?: CodeBlockFile[];
  showLineNumbers?: boolean;
  /** Collapse past this many lines, with an expand control. */
  maxLines?: number;
  className?: string;
}

export function CodeBlock({
  code = "",
  language = "txt",
  filename,
  files,
  showLineNumbers = false,
  maxLines,
  className,
}: CodeBlockProps) {
  const tabs = files && files.length > 0 ? files : null;
  const [active, setActive] = useState(0);

  // A tab index can outrun the list if `files` shrinks between renders; clamp
  // rather than rendering an undefined file.
  const current = tabs ? (tabs[Math.min(active, tabs.length - 1)] ?? tabs[0]!) : null;
  const source = current ? current.code : code;
  const lang = current ? (current.language ?? "txt") : language;

  return (
    <ReuiCodeBlock
      code={source}
      language={lang}
      showLineNumbers={showLineNumbers}
      maxLines={maxLines}
      className={cn("text-sm", className)}
    >
      <CodeBlockHeader>
        {tabs ? (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist">
            {tabs.map((file, index) => (
              <button
                key={file.filename}
                type="button"
                role="tab"
                aria-selected={index === active}
                onClick={() => setActive(index)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors",
                  index === active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {file.filename}
              </button>
            ))}
          </div>
        ) : (
          <CodeBlockTitle>{filename ?? lang}</CodeBlockTitle>
        )}
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockLanguage />
          <CodeBlockCopyButton />
        </div>
      </CodeBlockHeader>
    </ReuiCodeBlock>
  );
}
