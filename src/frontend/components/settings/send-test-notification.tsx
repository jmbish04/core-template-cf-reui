/**
 * @fileoverview A small composer that POSTs a notification to
 * `/api/notifications`, so the feed beside it can be seen filling up without
 * waiting for a real event.
 *
 * Deliberately real: the row it writes is the same shape a task or webhook
 * event writes, which is what makes it useful in a template — delete this
 * component and the feed still works.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Frame, FrameHeader, FrameTitle, FrameDescription, FramePanel } from "@/components/reui/frame";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { apiSend } from "@/lib/api";
import { NOTIFICATIONS_CHANGED, emit } from "@/lib/events";

const TYPES = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "mention", label: "Mention" },
  { value: "system", label: "System" },
] as const;

type NotificationType = (typeof TYPES)[number]["value"];

export function SendTestNotification() {
  const [title, setTitle] = useState("Deployment finished");
  const [body, setBody] = useState("Version 42 is live on the edge.");
  const [type, setType] = useState<NotificationType>("success");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setState("sending");
    try {
      await apiSend("POST", "notifications", { type, title: title.trim(), body: body.trim() || null });
      setState("sent");
      // The feed polls; nudge it so the new row lands immediately.
      emit(NOTIFICATIONS_CHANGED);
    } catch {
      setState("failed");
    }
  }

  return (
    <Frame>
      <FramePanel>
        <FrameHeader>
          <FrameTitle>Send a test notification</FrameTitle>
          <FrameDescription>Writes a real row through POST /api/notifications.</FrameDescription>
        </FrameHeader>
        <form className="flex flex-col gap-4 p-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="notif-title">Title</FieldLabel>
            <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="notif-body">Body</FieldLabel>
            <Input id="notif-body" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <OptionSelect
              value={type}
              options={TYPES.map((t) => ({ ...t }))}
              ariaLabel="Notification type"
              className="w-full"
              onChange={(next) => setType(next)}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send"}
            </Button>
            {state === "sent" && <span className="text-success-foreground text-sm">Sent.</span>}
            {state === "failed" && (
              <span className="text-destructive-foreground text-sm">Could not send that one.</span>
            )}
          </div>
        </form>
      </FramePanel>
    </Frame>
  );
}
