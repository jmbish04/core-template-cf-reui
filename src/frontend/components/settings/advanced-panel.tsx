/**
 * @fileoverview `/settings/advanced` — the maintenance corner.
 *
 * Three real actions plus one readout:
 *   POST   /api/seed          – demo projects, tasks, notes, webhooks, activity
 *   POST   /api/inbox/seed    – demo mail for the Email Routing inbox
 *   DELETE /api/notifications – clear the notification feed
 *   GET    /api/health        – the last persisted health run
 *
 * Everything that removes or writes rows is behind an `AlertDialog`, and each
 * row reports the API's own answer rather than a generic "done".
 *
 * RESPONSIVE STRATEGY
 * desktop: settings-3 rows, action button right-aligned.
 * mobile (390px): the button drops under its description, full width targets.
 */
import { useState } from "react";

import { SettingField } from "@/components/blocks/settings-3/components/setting-field";
import { MOBILE_SHEET_DIALOG } from "@/components/common";
import { HealthReadout } from "@/components/settings/health-readout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FieldGroup } from "@/components/ui/field";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { apiSend } from "@/lib/api";
import { NOTIFICATIONS_CHANGED, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

/** One confirmable maintenance action. */
interface MaintenanceAction {
  id: string;
  title: string;
  description: string;
  /** Button copy, and the confirm button's copy. */
  cta: string;
  /** Heading and body of the confirmation dialog. */
  confirmTitle: string;
  confirmBody: string;
  /** Destructive actions get the alert-dialog treatment AND destructive copy. */
  destructive?: boolean;
  /** Runs the request and returns the line to show on the row afterwards. */
  run: () => Promise<string>;
}

const ACTIONS: MaintenanceAction[] = [
  {
    id: "seed",
    title: "Seed demo data",
    description: "Projects, tasks, notes, webhooks and activity. Idempotent — a no-op once present.",
    cta: "Seed data",
    confirmTitle: "Seed demo data?",
    confirmBody:
      "This writes demo projects, tasks, notes, webhooks and activity rows into D1. It is skipped if demo data is already there.",
    run: async () => {
      const res = await apiSend<{ seeded: boolean; message: string; counts?: Record<string, number> }>(
        "POST",
        "seed",
      );
      if (!res.seeded) return res.message;
      const counts = res.counts
        ? Object.entries(res.counts)
            .map(([table, n]) => `${n} ${table}`)
            .join(", ")
        : "";
      return counts ? `Seeded ${counts}.` : res.message;
    },
  },
  {
    id: "inbox-seed",
    title: "Seed demo mail",
    description:
      "Fills the Email Routing inbox with labelled demo messages so /inbox has content before real mail arrives.",
    cta: "Seed inbox",
    confirmTitle: "Seed the demo inbox?",
    confirmBody:
      "Writes about a dozen clearly-labelled demo emails into email_messages. Skipped if the inbox already has messages.",
    run: async () => {
      const res = await apiSend<{ seeded: boolean; message: string; count?: number }>(
        "POST",
        "inbox/seed",
      );
      return res.seeded ? `Seeded ${res.count ?? 0} demo messages.` : res.message;
    },
  },
  {
    id: "clear-notifications",
    title: "Clear notifications",
    description: "Empties the notification feed for everyone. There is no undo.",
    cta: "Clear all",
    confirmTitle: "Clear every notification?",
    confirmBody:
      "Every row in the notifications table is deleted immediately. Read and unread alike, and nothing restores them.",
    destructive: true,
    run: async () => {
      await apiSend("DELETE", "notifications");
      emit(NOTIFICATIONS_CHANGED);
      return "Notification feed cleared.";
    },
  },
];

/**
 * The advanced/maintenance screen.
 *
 * @returns The island for `/settings/advanced`.
 */
export function AdvancedPanel() {
  const [pending, setPending] = useState<MaintenanceAction | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function run(action: MaintenanceAction) {
    setPending(null);
    setRunning(action.id);
    setErrors((prev) => ({ ...prev, [action.id]: "" }));
    try {
      const message = await action.run();
      setResults((prev) => ({ ...prev, [action.id]: message }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [action.id]: err instanceof Error ? err.message : "That action failed.",
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Frame className="w-full">
        <FrameHeader className="px-2! py-2.5!">
          <FrameTitle>Maintenance</FrameTitle>
          <FrameDescription>
            Actions that write or remove rows. Each one asks first and reports what the API said.
          </FrameDescription>
        </FrameHeader>

        <FramePanel className="p-0">
          <FieldGroup className="gap-0">
            {ACTIONS.map((action, index) => (
              <SettingField
                key={action.id}
                title={action.title}
                description={action.description}
                badge={action.destructive ? { label: "Destructive", variant: "destructive-light" } : undefined}
                last={index === ACTIONS.length - 1}
              >
                <div className="flex w-full flex-col items-stretch gap-2 sm:items-end">
                  <Button
                    variant={action.destructive ? "outline" : "default"}
                    className={cn("w-full sm:w-auto", action.destructive && "text-destructive-foreground")}
                    disabled={running === action.id}
                    onClick={() => setPending(action)}
                  >
                    {running === action.id ? "Working…" : action.cta}
                  </Button>
                  {errors[action.id] ? (
                    <p className="text-destructive-foreground text-sm sm:text-right" role="status">
                      {errors[action.id]}
                    </p>
                  ) : results[action.id] ? (
                    <p className="text-muted-foreground text-sm sm:text-right" role="status">
                      {results[action.id]}
                    </p>
                  ) : null}
                </div>
              </SettingField>
            ))}
          </FieldGroup>
        </FramePanel>
      </Frame>

      <HealthReadout />

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className={cn(MOBILE_SHEET_DIALOG)}>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void run(pending)}>
              {pending?.cta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
