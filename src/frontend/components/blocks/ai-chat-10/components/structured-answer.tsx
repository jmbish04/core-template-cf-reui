/**
 * @fileoverview The structured reply body for `/chat/scoped`.
 *
 * Prose renders as markdown, fenced code through ReUI's Shiki `CodeBlock`, and
 * a GFM table as a real sortable table. A column whose cells are all figures
 * also gets a proportional bar behind them — derived from those figures, so a
 * reply that contains no numbers shows no bars rather than an empty chart.
 */
import { useState } from "react";

import { CodeBlock } from "@/components/ui/code-block";
import { Markdown } from "@/components/ui/markdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { answerParts, cellNumber, numericColumns, type AnswerPart } from "./answer-structure";

type Sort = { column: number; direction: "asc" | "desc" } | null;

/** A figure with its share of the column's largest value drawn behind it. */
function FigureCell({ text, share }: { text: string; share: number }) {
  return (
    <span className="relative flex min-w-0 items-center justify-end gap-2">
      <span
        aria-hidden="true"
        style={{ width: `${Math.round(share * 100)}%` }}
        className="bg-primary/20 absolute inset-y-0.5 end-0 rounded-sm"
      />
      <span className="relative tabular-nums">{text}</span>
    </span>
  );
}

function AnswerTable({ head, rows }: { head: string[]; rows: string[][] }) {
  const [sort, setSort] = useState<Sort>(null);
  const figures = numericColumns(head, rows);

  const ordered = sort
    ? [...rows].sort((a, b) => {
        const left = a[sort.column] ?? "";
        const right = b[sort.column] ?? "";
        const ln = cellNumber(left);
        const rn = cellNumber(right);
        const delta = ln !== null && rn !== null ? ln - rn : left.localeCompare(right);
        return sort.direction === "asc" ? delta : -delta;
      })
    : rows;

  function toggle(column: number) {
    setSort((current) =>
      current?.column === column
        ? current.direction === "asc"
          ? { column, direction: "desc" }
          : null
        : { column, direction: "asc" },
    );
  }

  return (
    <div className="border-border/60 overflow-x-auto rounded-lg border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            {head.map((label, column) => {
              const active = sort?.column === column;
              return (
                <TableHead
                  key={`${label}-${column}`}
                  aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("p-0", figures.has(column) && "text-end")}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column)}
                    className={cn(
                      "hover:text-foreground flex w-full items-center gap-1.5 px-3 py-2 text-start font-semibold",
                      figures.has(column) && "justify-end",
                    )}
                  >
                    {label}
                    {active ? (
                      sort!.direction === "asc" ? (
                        <ChevronUpIcon className="size-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronDownIcon className="size-3 shrink-0" aria-hidden="true" />
                      )
                    ) : (
                      <ChevronsUpDownIcon className="size-3 shrink-0 opacity-40" aria-hidden="true" />
                    )}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, column) => {
                const max = figures.get(column);
                const value = max ? cellNumber(cell) : null;
                return (
                  <TableCell key={column} className={cn("px-3 py-1.5", max && "text-end")}>
                    {max && value !== null ? (
                      <FigureCell text={cell} share={Math.abs(value) / max} />
                    ) : (
                      cell
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Part({ part, streaming }: { part: AnswerPart; streaming: boolean }) {
  if (part.type === "code") {
    return (
      <CodeBlock
        code={part.content}
        language={part.language ?? "txt"}
        maxLines={streaming && part.open ? undefined : 24}
      />
    );
  }
  if (part.type === "table") return <AnswerTable head={part.head} rows={part.rows} />;
  return <Markdown>{part.content}</Markdown>;
}

/**
 * Render one reply as a structured document.
 *
 * @param props The reply markdown and whether it is still arriving.
 * @returns Prose, tables and code artifacts in source order.
 */
export function StructuredAnswer({
  content,
  streaming = false,
  className,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)} data-answer-body>
      {answerParts(content).map((part, index) => (
        <Part key={index} part={part} streaming={streaming} />
      ))}
    </div>
  );
}
