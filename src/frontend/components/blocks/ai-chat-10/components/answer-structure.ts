/**
 * @fileoverview Splitting a reply into the parts `/chat/scoped` renders.
 *
 * ReUI `ai-chat-10` shows answers as structured documents — sortable tables,
 * highlighted code, proportional comparison bars. None of that is decoration
 * here: every part is lifted out of the model's own markdown, so a reply with
 * no table renders no table and a reply with no numbers renders no bars.
 *
 * Fenced code is found by ReUI's own `markdownFences`; this module adds the
 * GFM table split and the numeric-column detection the bars are derived from.
 */
import { markdownFences } from "@/components/reui/code-block/code-block";

/** One piece of a reply, in the order it appeared. */
export type AnswerPart =
  | { type: "prose"; content: string }
  | { type: "code"; content: string; language?: string; open: boolean }
  | { type: "table"; head: string[]; rows: string[][] };

/** A GFM delimiter row: `| --- | :--: |`. It is what makes a table a table. */
const DELIMITER = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

/** Split one `| a | b |` row into trimmed cells. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Split prose into text runs and GFM tables.
 *
 * @param text A markdown run with no fenced code in it.
 * @returns The runs and tables, in source order.
 */
function splitTables(text: string): AnswerPart[] {
  const lines = text.split("\n");
  const parts: AnswerPart[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const prose = buffer.join("\n").trim();
    if (prose) parts.push({ type: "prose", content: prose });
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const next = lines[index + 1];
    const isHeader = line.includes("|") && next !== undefined && DELIMITER.test(next) && next.includes("|");

    if (!isHeader) {
      buffer.push(line);
      continue;
    }

    const head = cells(line);
    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor]!.includes("|")) {
      const row = cells(lines[cursor]!);
      // A short row is still data; a long one means the model over-ran the
      // header, and padding beats dropping the columns it did fill.
      rows.push(Array.from({ length: head.length }, (_, at) => row[at] ?? ""));
      cursor += 1;
    }

    // A header with no body is not a table anyone can read; keep it as prose.
    if (rows.length === 0) {
      buffer.push(line);
      continue;
    }

    flush();
    parts.push({ type: "table", head, rows });
    index = cursor - 1;
  }

  flush();
  return parts;
}

/**
 * Split a reply body into its renderable parts.
 *
 * @param markdown The assistant reply, exactly as it was persisted.
 * @returns Prose, code artifacts and tables, in source order.
 * @example
 * answerParts("Totals\n\n| Project | Open |\n| --- | --- |\n| Web | 4 |")
 * // → [{type:"prose",…}, {type:"table", head:["Project","Open"], rows:[["Web","4"]]}]
 */
export function answerParts(markdown: string): AnswerPart[] {
  return markdownFences(markdown).flatMap((part) =>
    part.type === "code"
      ? [{ type: "code" as const, content: part.content, language: part.language, open: part.open }]
      : splitTables(part.content),
  );
}

/**
 * Read a table cell as a number.
 *
 * Tolerates the shapes a model writes figures in — thousands separators, a
 * leading currency symbol, a trailing percent or unit.
 *
 * @param cell One cell's text.
 * @returns The number, or null when the cell is not one.
 */
export function cellNumber(cell: string): number | null {
  const cleaned = cell.replace(/[$£€\s,]/g, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Which columns carry comparable figures, and what the largest one is.
 *
 * A column qualifies only when every filled cell is a number, at least two of
 * them differ, and the largest is positive — so an id column, a year column or
 * a single-row table draws no bars. This is the only thing the comparison bars
 * are derived from; a reply with no figures gets none.
 *
 * @param head The table's header cells.
 * @param rows The table's body rows.
 * @returns Column index → the maximum absolute value in that column.
 */
export function numericColumns(head: string[], rows: string[][]): Map<number, number> {
  const found = new Map<number, number>();

  for (let column = 0; column < head.length; column += 1) {
    const values: number[] = [];
    let ok = true;
    for (const row of rows) {
      const cell = row[column] ?? "";
      if (!cell) continue;
      const value = cellNumber(cell);
      if (value === null) {
        ok = false;
        break;
      }
      values.push(value);
    }
    if (!ok || values.length < 2) continue;
    if (new Set(values).size < 2) continue;
    const max = Math.max(...values.map(Math.abs));
    if (max > 0) found.set(column, max);
  }

  return found;
}
