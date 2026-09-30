/**
 * @fileoverview The answer shapes the model may choose, and the parser that
 * reads one back.
 *
 * Split out of `structured-answer.tsx` with no imports at all, so the parser
 * can be exercised by `scripts/selfcheck-chat-shapes.mjs` without dragging
 * React and the `@/…` path aliases into a plain Node process.
 *
 * The parser's hard case is the STREAM: while a reply is arriving, the fence
 * is usually still open and the JSON inside it is half written. Both must fall
 * back to prose, because dropping the body would blank the bubble for every
 * frame until the fence closes.
 */

/** The four shapes the model is offered. Anything else falls back to prose. */
export type AnswerShape =
  | { shape: "steps"; title?: string; items: string[] }
  | { shape: "facts"; title?: string; items: Array<{ label: string; value: string }> }
  | { shape: "table"; title?: string; columns: string[]; rows: string[][] }
  | { shape: "prose" };

/** The instruction that makes the shape the model's choice rather than ours. */
export const SHAPE_SYSTEM_PROMPT = [
  "Answer in whichever shape the question deserves.",
  'When the answer is an ordered procedure, a set of labelled values, or a comparison, emit EXACTLY ONE fenced ```json block and no other prose, using one of these shapes:',
  '{"shape":"steps","title":"…","items":["…"]}',
  '{"shape":"facts","title":"…","items":[{"label":"…","value":"…"}]}',
  '{"shape":"table","title":"…","columns":["…"],"rows":[["…"]]}',
  "For anything else, answer in ordinary prose with no JSON at all.",
].join("\n");

/** Only a CLOSED fence parses; an open one is a reply still arriving. */
const FENCE = /```json\s*([\s\S]*?)```/i;

/**
 * Pull a structured shape out of a reply, if the model emitted one.
 *
 * @param text The assistant's reply, complete or mid-stream.
 * @returns The parsed shape plus whatever prose surrounded it. Unparseable
 *   input yields `{ shape: "prose" }` with the text intact — never a blank.
 */
export function parseAnswer(text: string): { shape: AnswerShape; prose: string } {
  const match = FENCE.exec(text);
  if (!match) return { shape: { shape: "prose" }, prose: text };

  const prose = text.replace(FENCE, "").trim();
  try {
    const parsed = JSON.parse(match[1]!.trim()) as Record<string, unknown>;
    if (parsed.shape === "steps" && Array.isArray(parsed.items)) {
      return { shape: { shape: "steps", title: parsed.title as string, items: parsed.items as string[] }, prose };
    }
    if (parsed.shape === "facts" && Array.isArray(parsed.items)) {
      return {
        shape: {
          shape: "facts",
          title: parsed.title as string,
          items: parsed.items as Array<{ label: string; value: string }>,
        },
        prose,
      };
    }
    if (parsed.shape === "table" && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
      return {
        shape: {
          shape: "table",
          title: parsed.title as string,
          columns: parsed.columns as string[],
          rows: parsed.rows as string[][],
        },
        prose,
      };
    }
  } catch {
    // Half-written JSON mid-stream, or a shape we do not know: the reply is
    // still readable as text, so show it rather than dropping the answer.
  }
  return { shape: { shape: "prose" }, prose: text };
}
