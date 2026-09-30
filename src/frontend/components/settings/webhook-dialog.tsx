/**
 * @fileoverview The create / edit dialog behind `/settings/webhooks`.
 *
 * One dialog serves both jobs: with no `webhook` it POSTs `/api/webhooks`
 * (the API mints the signing secret), with one it PATCHes `/api/webhooks/{id}`.
 * The URL uses the settings-3 prefixed `InputGroup` so the scheme is fixed and
 * the stored value is always absolute.
 */
import { useState } from "react";

import { ErrorState, MOBILE_SHEET_DIALOG } from "@/components/common";
import type { Webhook } from "@/components/settings/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { apiSend } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Event types the template's own writers emit, offered as a starting set. */
const SUGGESTED_EVENTS = ["task.created", "task.updated", "project.created", "note.updated", "system.health"];

export interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Row being edited, or undefined to create a new one. */
  webhook?: Webhook;
  /** Called with the saved row after a successful write. */
  onSaved: (row: Webhook) => void;
}

/**
 * Create or edit one webhook registration.
 *
 * @param props - Open state, the row being edited (if any) and the save callback.
 * @returns The dialog; a bottom sheet below `md`.
 */
export function WebhookDialog({ open, onOpenChange, webhook, onSaved }: WebhookDialogProps) {
  const [name, setName] = useState(webhook?.name ?? "");
  const [url, setUrl] = useState(stripScheme(webhook?.url ?? ""));
  const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
  const [active, setActive] = useState(webhook?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), url: `https://${stripScheme(url.trim())}`, events, active };
    try {
      const row = webhook
        ? await apiSend<Webhook>("PATCH", `webhooks/${webhook.id}`, body)
        : await apiSend<Webhook>("POST", "webhooks", body);
      onSaved(row);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that webhook.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", MOBILE_SHEET_DIALOG)}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{webhook ? "Edit webhook" : "New webhook"}</DialogTitle>
            <DialogDescription>
              {webhook
                ? "Changes are written straight to the webhooks table."
                : "The signing secret is generated server-side when the row is created."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {error ? <ErrorState message={error} /> : null}

            <Field>
              <FieldLabel htmlFor="webhook-name">Name</FieldLabel>
              <Input
                id="webhook-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Deploy notifier"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="webhook-url">Endpoint URL</FieldLabel>
              <InputGroup className="w-full">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>https://</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="webhook-url"
                  value={url}
                  onChange={(e) => setUrl(stripScheme(e.target.value))}
                  placeholder="hooks.example.com/edge"
                  required
                />
              </InputGroup>
              <FieldDescription>Deliveries are POSTed here as JSON.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Events</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_EVENTS.map((event) => {
                  const on = events.includes(event);
                  return (
                    <Button
                      key={event}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "outline"}
                      aria-pressed={on}
                      onClick={() =>
                        setEvents((prev) =>
                          prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
                        )
                      }
                    >
                      {event}
                    </Button>
                  );
                })}
              </div>
              <FieldDescription>
                {events.length === 0
                  ? "No events selected — this endpoint receives nothing until one is."
                  : `${events.length} event type${events.length === 1 ? "" : "s"} subscribed.`}
              </FieldDescription>
            </Field>

            <Field orientation="horizontal" className="gap-3">
              <Switch id="webhook-active" checked={active} onCheckedChange={setActive} />
              <FieldLabel htmlFor="webhook-active">Active</FieldLabel>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : webhook ? "Save changes" : "Create webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Remove a leading scheme so the value matches the `https://` addon.
 *
 * @param value - A URL with or without a scheme.
 * @returns The host-and-path remainder.
 */
function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}
