/**
 * @fileoverview ChatErrorBanner — how a chat surface says the reply failed.
 *
 * Every inference runs through core-guardian, which has three real failure
 * modes, and the Worker already turns each into a sentence a reader can act on
 * (`guardianErrorMessage` in `backend/api/routes/chat.ts`):
 *
 *   422 → no model is available inside the budget right now
 *   429 → the AI router is rate-limited
 *   502 → the AI service is temporarily unavailable
 *
 * So there is no mapping table here — re-deriving one on the client would mean
 * two places to keep in step. This renders the sentence `useChatThread` handed
 * over, and gives it a dismiss (and optionally a retry). The rule it exists to
 * enforce: a failed turn must never be a blank bubble.
 */
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";

export interface ChatErrorBannerProps {
  /** The message from `useChatThread().error`, or null when the turn was fine. */
  error: string | null;
  /** Clears the banner. Usually `useChatThread().clearError`. */
  onDismiss: () => void;
  /** Offered when the surface can resend the last prompt. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Render the assistant's failure as plain language.
 *
 * @param props The error string plus its dismiss/retry handlers.
 * @returns The banner, or null when there is no error.
 */
export function ChatErrorBanner({ error, onDismiss, onRetry, className }: ChatErrorBannerProps) {
  if (!error) return null;

  return (
    <Alert
      variant="destructive"
      role="alert"
      className={cn("items-center gap-3 py-2 ps-3 pe-2 text-sm", className)}
    >
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-foreground block">{error}</AlertDescription>
      <AlertAction className="flex items-center gap-0.5">
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry} className="gap-1.5">
            <RotateCcwIcon aria-hidden="true" />
            Retry
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={onDismiss}>
          <XIcon aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
