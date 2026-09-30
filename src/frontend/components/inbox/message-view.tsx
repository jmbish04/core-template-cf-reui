/**
 * @fileoverview The reading pane body for `/inbox`.
 *
 * SECURITY: `html_body` is attacker-controlled — these are real emails
 * delivered by Cloudflare Email Routing from anyone who can reach the routed
 * address. It is never injected as HTML. The pane renders `text_body` as
 * preformatted text, which is the honest rendering and cannot execute.
 */
import { Badge } from "@/components/reui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { EmailMessage } from "@/components/inbox/types";
import { humanSize, shortDate } from "@/lib/format";

/**
 * Render one message's envelope and body.
 *
 * @param message - The open message.
 * @returns The scrolling reading pane contents.
 */
export function MessageView({ message }: { message: EmailMessage }) {
  const sender = message.fromName ?? message.fromAddress;
  return (
    <article className="min-w-0 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-wrap items-start gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="text-xs font-semibold">
            {sender.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{sender}</p>
          <p className="text-muted-foreground truncate text-xs">{message.fromAddress}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">to {message.toAddress}</p>
        </div>

        <div className="text-muted-foreground shrink-0 text-xs sm:text-right">
          <p>{shortDate(message.receivedAt)}</p>
          <p>{humanSize(message.rawSize)}</p>
        </div>
      </header>

      {message.labels.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1">
          {message.labels.map((label) => (
            <Badge key={label} variant="secondary" size="sm" className="font-normal">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}

      {message.htmlBody ? (
        <p className="text-muted-foreground mt-4 text-xs">
          This message also carried an HTML part. The plain-text body is shown instead — inbound mail
          is never rendered as HTML.
        </p>
      ) : null}

      <div className="mt-5 text-sm leading-relaxed whitespace-pre-wrap">
        {message.textBody || <span className="text-muted-foreground">This message has no body.</span>}
      </div>
    </article>
  );
}
