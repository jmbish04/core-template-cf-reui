/**
 * @fileoverview `/settings/webhooks` — outbound delivery endpoints from the
 * `webhooks` D1 table.
 *
 * Every action is a real request: list `GET /api/webhooks`, create `POST`,
 * edit `PATCH /api/webhooks/{id}`, remove `DELETE /api/webhooks/{id}`, and
 * `POST /api/webhooks/{id}/test`, whose response is shown inline on the row it
 * came from.
 *
 * RESPONSIVE STRATEGY
 * desktop: one settings-3 row per webhook — name, URL and status on the left,
 * the secret and actions right.
 * mobile (390px): the actions wrap under the secret; the URL truncates rather
 * than widening the page.
 */
import { useState } from "react";

import { SettingField } from "@/components/blocks/settings-3/components/setting-field";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState, ErrorState, MOBILE_SHEET_DIALOG } from "@/components/common";
import { WebhookDialog } from "@/components/settings/webhook-dialog";
import type { Webhook } from "@/components/settings/types";
import { useResource } from "@/components/settings/use-resource";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
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
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface WebhookListResponse {
  data: Webhook[];
  total: number;
}

const loadWebhooks = () => apiGet<WebhookListResponse>("webhooks");

/** Result of the most recent test fire, keyed by webhook id. */
type TestState = Record<string, { status: "running" | "ok" | "failed"; message: string }>;

/**
 * The webhooks screen.
 *
 * @returns The island for `/settings/webhooks`.
 */
export function WebhooksManager() {
  const { data, loading, error, reload } = useResource<WebhookListResponse>(loadWebhooks);
  const [dialog, setDialog] = useState<{ open: boolean; webhook?: Webhook }>({ open: false });
  const [pendingDelete, setPendingDelete] = useState<Webhook | null>(null);
  const [tests, setTests] = useState<TestState>({});
  const [actionError, setActionError] = useState<string | null>(null);

  async function fireTest(webhook: Webhook) {
    setTests((prev) => ({ ...prev, [webhook.id]: { status: "running", message: "Sending…" } }));
    try {
      const res = await apiSend<{ ok: boolean; lastStatus: string; lastTriggeredAt: number | null }>(
        "POST",
        `webhooks/${webhook.id}/test`,
      );
      setTests((prev) => ({
        ...prev,
        [webhook.id]: { status: "ok", message: `Test delivery recorded — ${res.lastStatus}.` },
      }));
      await reload();
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [webhook.id]: {
          status: "failed",
          message: err instanceof Error ? err.message : "The test delivery failed.",
        },
      }));
    }
  }

  async function remove(webhook: Webhook) {
    setActionError(null);
    try {
      await apiSend("DELETE", `webhooks/${webhook.id}`);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete that webhook.");
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (loading || !data) return <Skeleton className="h-96 w-full rounded-lg" />;

  const rows = data.data;

  return (
    <>
      <Frame className="w-full">
        <FrameHeader className="flex flex-wrap items-center justify-between gap-2 px-2! py-2.5!">
          <div className="min-w-0">
            <FrameTitle>Webhooks</FrameTitle>
            <FrameDescription>
              {data.total === 0
                ? "No endpoints registered."
                : `${data.total} endpoint${data.total === 1 ? "" : "s"} registered.`}
            </FrameDescription>
          </div>
          <Button size="sm" onClick={() => setDialog({ open: true })}>
            New webhook
          </Button>
        </FrameHeader>

        <FramePanel className="p-0">
          {actionError ? <ErrorState message={actionError} className="m-4" /> : null}

          {rows.length === 0 ? (
            <EmptyState
              className="m-4"
              title="No webhooks yet"
              description="Register an endpoint and every subscribed event will be POSTed to it."
              action={<Button onClick={() => setDialog({ open: true })}>Add the first one</Button>}
            />
          ) : (
            <FieldGroup className="gap-0">
              {rows.map((webhook, index) => (
                <SettingField
                  key={webhook.id}
                  title={webhook.name}
                  description={webhook.url}
                  badge={
                    webhook.active
                      ? { label: "Active", variant: "success-light" }
                      : { label: "Paused", variant: "warning-light" }
                  }
                  last={index === rows.length - 1}
                  contentClassName="@md/field-group:w-[22rem]"
                >
                  <div className="flex w-full min-w-0 flex-col gap-3">
                    <WebhookStatus webhook={webhook} test={tests[webhook.id]} />

                    {webhook.secret ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <code className="bg-muted text-muted-foreground min-w-0 flex-1 truncate rounded px-2 py-1 font-mono text-xs">
                          {maskSecret(webhook.secret)}
                        </code>
                        <CopyButton text={webhook.secret} label="Copy secret" />
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={tests[webhook.id]?.status === "running"}
                        onClick={() => void fireTest(webhook)}
                      >
                        {tests[webhook.id]?.status === "running" ? "Testing…" : "Send test"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, webhook })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPendingDelete(webhook)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </SettingField>
              ))}
            </FieldGroup>
          )}
        </FramePanel>
      </Frame>

      {/* Remounted per target so the form never shows the previous row's values. */}
      {dialog.open ? (
        <WebhookDialog
          key={dialog.webhook?.id ?? "new"}
          open
          webhook={dialog.webhook}
          onOpenChange={(open) => !open && setDialog({ open: false })}
          onSaved={() => void reload()}
        />
      ) : null}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className={cn(MOBILE_SHEET_DIALOG)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The registration and its signing secret are removed immediately. Anything pointing at{" "}
              {pendingDelete?.url} stops receiving deliveries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && void remove(pendingDelete)}>
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The last-delivery line for one row: the stored status, or the live result of
 * a test just fired from this page.
 *
 * @param webhook - The row being described.
 * @param test - In-session test result for this row, if any.
 * @returns A status line, or a "never delivered" note.
 */
function WebhookStatus({
  webhook,
  test,
}: {
  webhook: Webhook;
  test?: { status: "running" | "ok" | "failed"; message: string };
}) {
  if (test && test.status !== "running") {
    return (
      <p
        className={cn(
          "text-sm",
          test.status === "ok" ? "text-success-foreground" : "text-destructive-foreground",
        )}
        role="status"
      >
        {test.message}
      </p>
    );
  }

  if (!webhook.lastStatus) {
    return <p className="text-muted-foreground text-sm">Never delivered.</p>;
  }

  const ok = webhook.lastStatus.trim().startsWith("2");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={ok ? "success-light" : "destructive-light"} size="sm">
        {webhook.lastStatus}
      </Badge>
      <span className="text-muted-foreground">{relativeTime(webhook.lastTriggeredAt)}</span>
    </div>
  );
}

/**
 * Show only the ends of a signing secret; the full value stays copyable.
 *
 * @param secret - The stored HMAC secret.
 * @returns A masked rendering safe to leave on screen.
 */
function maskSecret(secret: string): string {
  if (secret.length <= 12) return "•".repeat(secret.length);
  return `${secret.slice(0, 6)}${"•".repeat(12)}${secret.slice(-4)}`;
}
