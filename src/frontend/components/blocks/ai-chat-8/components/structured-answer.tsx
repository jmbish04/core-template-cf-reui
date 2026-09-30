/**
 * @fileoverview "The answer arrives in whichever shape the question deserves."
 *
 * ReUI `ai-chat-8` rotates through its answer shapes on a script — turn three
 * is always the availability grid. Here the MODEL picks the shape: its system
 * prompt offers four, it emits one fenced ```json block when one of them fits,
 * and this renders whatever came back. When it returns prose, prose is what
 * renders. Nothing rotates and nothing is on a timer.
 */
import { Badge } from "@/components/reui/badge";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Markdown } from "@/components/ui/markdown";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckIcon } from "lucide-react";

import { parseAnswer } from "./answer-shape";

export { SHAPE_SYSTEM_PROMPT, parseAnswer, type AnswerShape } from "./answer-shape";

/**
 * Render one reply in the shape the model chose.
 *
 * @param props The raw assistant text.
 * @returns The structured view plus any surrounding prose.
 */
export function StructuredAnswer({ text }: { text: string }) {
  const { shape, prose } = parseAnswer(text);

  if (shape.shape === "prose") return <Markdown>{prose}</Markdown>;

  return (
    <div className="flex flex-col gap-3">
      {shape.title && <p className="text-sm font-medium">{shape.title}</p>}

      {shape.shape === "steps" && (
        <ol className="flex flex-col gap-1.5">
          {shape.items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 16)}`}>
              <Item size="sm" variant="outline" className="items-start">
                <ItemMedia variant="icon" className="bg-transparent">
                  <span className="text-muted-foreground text-xs tabular-nums">{index + 1}</span>
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="font-normal text-wrap">{item}</ItemTitle>
                </ItemContent>
              </Item>
            </li>
          ))}
        </ol>
      )}

      {shape.shape === "facts" && (
        <dl className="flex flex-wrap gap-2">
          {shape.items.map((fact) => (
            <div key={fact.label} className="bg-muted/40 flex min-w-32 flex-col gap-0.5 rounded-md px-3 py-2">
              <dt className="text-muted-foreground text-xs">{fact.label}</dt>
              <dd className="text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {shape.shape === "table" && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {shape.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shape.rows.map((row, index) => (
                <TableRow key={`${index}-${row[0] ?? ""}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${cellIndex}-${cell}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {prose && <Markdown>{prose}</Markdown>}

      <Badge variant="outline" size="sm" className="text-muted-foreground w-fit font-normal">
        <CheckIcon className="size-3" aria-hidden="true" />
        Shape chosen by the model: {shape.shape}
      </Badge>
    </div>
  );
}
