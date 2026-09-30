/**
 * @fileoverview NotificationsFeed — notification inbox backed by the D1 REST
 * API, laid out as a ReUI Timeline (timeline-4 / solution-users-6 grammar:
 * icon indicators, title + badge header, body) inside a ReUI Frame.
 *
 * Data:
 *   - GET  /api/notifications            – full list, newest first
 *   - POST /api/notifications/{id}/read  – mark one read (optimistic)
 *   - POST /api/notifications/read-all   – mark all read (optimistic)
 *
 * Freshness: polls every 15s while the tab is visible, refetches when the tab
 * becomes visible again, and on the `notifications:changed` window event that
 * SendTestNotification / AdvancedPanel fire after they mutate the feed.
 * ponytail: polling, not push — switch to SSE/WebSocket if 15s lag matters.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { NOTIFICATIONS_CHANGED } from "@/lib/events";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, ApiError, apiSend } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

type NotificationType = "info" | "success" | "warning" | "error" | "mention" | "system";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  severity: string;
  read: boolean;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

const POLL_MS = 15_000;

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  NotificationType,
  { icon: LucideIcon; label: string; tone: string; badge: BadgeProps["variant"] }
> = {
  info: { icon: InfoIcon, label: "Info", tone: "text-info", badge: "info-outline" },
  success: { icon: CircleCheckIcon, label: "Success", tone: "text-success", badge: "success-outline" },
  warning: { icon: TriangleAlertIcon, label: "Warning", tone: "text-warning", badge: "warning-outline" },
  error: { icon: CircleAlertIcon, label: "Error", tone: "text-destructive", badge: "destructive-outline" },
  mention: { icon: MessageSquareIcon, label: "Mention", tone: "text-primary", badge: "primary-outline" },
  system: { icon: SettingsIcon, label: "System", tone: "text-muted-foreground", badge: "outline" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsFeed() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiGet<NotificationItem[]>("notifications"));
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn't load notifications. Check your connection; the feed retries every 15 seconds.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onChanged = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [load]);

  const unread = items?.filter((n) => !n.read).length ?? 0;

  const markRead = async (id: string) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? prev);
    try {
      await apiSend("POST", `notifications/${id}/read`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't mark that notification read. Try again.");
      void load();
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    try {
      await apiSend("POST", "notifications/read-all");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't mark notifications read. Try again.");
      void load();
    }
  };

  return (
    <Frame className="min-w-0">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-px">
          <FrameTitle className="flex items-center gap-2">
            Inbox
            {unread > 0 ? <Badge variant="primary-light">{unread} unread</Badge> : null}
          </FrameTitle>
          <FrameDescription>
            {fetchedAt ? `Updated ${relativeTime(fetchedAt)} · refreshes every 15s` : "Loading…"}
          </FrameDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => void markAllRead()} disabled={unread === 0}>
          <CheckCheckIcon aria-hidden="true" />
          Mark all read
        </Button>
      </FrameHeader>

      <FramePanel className="min-h-64">
        {error ? (
          <p role="alert" className="text-destructive mb-4 text-sm">
            {error}
          </p>
        ) : null}

        {items === null ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>You're all caught up</EmptyTitle>
              <EmptyDescription>
                New notifications appear here. Send a test to see one arrive.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Timeline>
            {items.map((item, index) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.info;
              const Icon = meta.icon;
              const isLast = index === items.length - 1;
              return (
                <TimelineItem
                  key={item.id}
                  step={index + 1}
                  className={cn("ms-10", isLast ? "pb-0" : "pb-5", item.read && "opacity-70")}
                >
                  <TimelineHeader className="flex min-w-0 items-start justify-between gap-2.5">
                    <TimelineSeparator className="bg-border! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.5rem)] group-data-[orientation=vertical]/timeline:translate-y-7" />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <TimelineTitle className="min-w-0 truncate text-sm font-semibold">
                        {item.href ? (
                          <a href={item.href} className="hover:underline">
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </TimelineTitle>
                      <Badge variant={meta.badge}>{meta.label}</Badge>
                      {!item.read ? (
                        <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="Unread" />
                      ) : null}
                    </div>
                    {!item.read ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => void markRead(item.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    <TimelineIndicator
                      className={cn(
                        "border-border bg-background flex size-6 items-center justify-center border shadow-xs group-data-[orientation=vertical]/timeline:-left-7 [&_svg]:size-3.5",
                        meta.tone,
                      )}
                    >
                      <Icon aria-hidden="true" />
                    </TimelineIndicator>
                  </TimelineHeader>
                  <TimelineContent className="mt-1 space-y-1">
                    {item.body ? (
                      <p className="text-muted-foreground line-clamp-2 text-sm">{item.body}</p>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                      {relativeTime(item.createdAt)}
                      {item.actor ? ` · ${item.actor}` : ""}
                    </p>
                  </TimelineContent>
                </TimelineItem>
              );
            })}
          </Timeline>
        )}
      </FramePanel>
    </Frame>
  );
}
