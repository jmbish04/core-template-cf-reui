/**
 * @fileoverview SaveBar — the dirty-state footer shared by the settings forms.
 *
 * Sits in the settings-3 `FrameFooter`. Both buttons stay disabled until the
 * draft differs from the loaded row, so "Save changes" never fires a no-op PUT
 * and "Discard" never looks live when there is nothing to discard.
 */
import { Button } from "@/components/ui/button";

export interface SaveBarProps {
  /** True when the draft differs from what the API returned. */
  dirty: boolean;
  /** True while the PUT is in flight. */
  saving: boolean;
  /** Set after a successful save; cleared on the next edit. */
  saved?: boolean;
  /** Message from a failed save, rendered beside the buttons. */
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * Render the save/discard row with its inline status line.
 *
 * @param props - Dirty/saving flags plus the two handlers.
 * @returns The footer contents; the caller supplies the `FrameFooter`.
 */
export function SaveBar({ dirty, saving, saved, error, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="mr-auto min-w-0 text-sm" role="status">
        {error ? (
          <span className="text-destructive-foreground">{error}</span>
        ) : saving ? (
          <span className="text-muted-foreground">Saving…</span>
        ) : dirty ? (
          <span className="text-muted-foreground">Unsaved changes.</span>
        ) : saved ? (
          <span className="text-success-foreground">Saved.</span>
        ) : null}
      </p>
      <Button variant="outline" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </Button>
      <Button onClick={onSave} disabled={!dirty || saving}>
        Save changes
      </Button>
    </div>
  );
}
