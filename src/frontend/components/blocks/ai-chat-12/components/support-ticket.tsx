/**
 * @fileoverview The one path off the knowledge base: open a real ticket.
 *
 * When the docs genuinely do not cover a question, the block's answer is to
 * stop guessing and raise it with a human. Here that is a real row — a
 * `POST /api/tasks` into the same `tasks` table `/tasks` renders — so the
 * created ticket has an id, a link, and a life after this conversation.
 */
import { useState } from "react";

import { apiSend } from "@/lib/api";
import type { Task } from "@/backend/db/schemas/tasks/tasks";

import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { LifeBuoyIcon, TicketIcon } from "lucide-react";

/**
 * Open a support ticket for an uncovered question.
 *
 * @param question The reader's question, kept verbatim as the ticket title.
 * @param missing The model's one-line statement of what the docs lack.
 * @returns The created task row.
 * @throws {ApiError} When `/api/tasks` rejects the create.
 */
export async function openTicket(question: string, missing: string): Promise<Task> {
  return apiSend<Task>("POST", "tasks", {
    title: question.slice(0, 120),
    description: `Asked in the docs assistant, and the knowledge base did not cover it.\n\n${missing}`,
    status: "todo",
    priority: "medium",
    labels: ["docs-gap"],
  });
}

export interface NotCoveredProps {
  /** The model's sentence naming what the articles did not contain. */
  missing: string;
  /** The question the ticket is raised for. */
  question: string;
}

/**
 * The "the docs do not cover this" card, with its ticket action.
 *
 * @param props What is missing and the question behind it.
 * @returns The card, then the created ticket once one exists.
 */
export function NotCovered({ missing, question }: NotCoveredProps) {
  const [ticket, setTicket] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function raise() {
    setBusy(true);
    setError(null);
    try {
      setTicket(await openTicket(question, missing));
    } catch {
      setError("Could not open a ticket. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert variant="warning" className="items-start gap-3">
      <LifeBuoyIcon aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-2">
        <AlertTitle>The docs do not cover this</AlertTitle>
        <AlertDescription className="block text-sm">{missing}</AlertDescription>

        {ticket ? (
          <p className="text-sm">
            Ticket opened.{" "}
            <a href={`/tasks/${ticket.id}`} className="underline underline-offset-4">
              {ticket.title}
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void raise()}>
              <TicketIcon aria-hidden="true" />
              {busy ? "Opening a ticket…" : "Open a ticket"}
            </Button>
            {error && <span className="text-destructive text-xs">{error}</span>}
          </div>
        )}
      </div>
    </Alert>
  );
}
