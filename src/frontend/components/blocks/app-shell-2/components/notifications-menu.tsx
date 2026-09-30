/**
 * Notifications popover — the block's panel layout, wired to the real
 * notifications feed (`GET /api/notifications`, `POST /read-all`).
 * The full realtime feed lives at /notifications.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  AtSignIcon,
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  SettingsIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { apiGet, apiSend } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

type Notif = {
  id: string
  type: "info" | "success" | "warning" | "error" | "mention" | "system"
  title: string
  body: string | null
  read: boolean
  href: string | null
  createdAt: number
}

const ICON: Record<Notif["type"], ReactNode> = {
  info: <InfoIcon />,
  success: <CircleCheckIcon />,
  warning: <TriangleAlertIcon />,
  error: <CircleAlertIcon />,
  mention: <AtSignIcon />,
  system: <SettingsIcon />,
}

const TONE: Record<Notif["type"], string> = {
  info: "text-info-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  error: "text-destructive-foreground",
  mention: "text-foreground",
  system: "text-muted-foreground",
}

export function NotificationsMenu() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    apiGet<Notif[]>("notifications")
      .then((d) => {
        setItems(d)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(load, [load])

  const unread = items?.filter((n) => !n.read).length ?? 0

  const markAll = async () => {
    await apiSend("POST", "notifications/read-all").catch(() => setFailed(true))
    load()
  }

  return (
    <Popover onOpenChange={(o) => o && load()}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} />}
      >
        <span className="relative inline-flex">
          <BellIcon className="size-4.5 transition-colors" aria-hidden="true" />
          {unread > 0 && (
            <span className="bg-primary ring-background absolute -top-1 -right-1 size-1.5 rounded-full ring-2" aria-hidden="true" />
          )}
        </span>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="end" sideOffset={8} className="!bg-background w-80 gap-0 p-0">
        <div className="border-border/40 flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">Notifications</span>
            {unread > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[11px] tabular-nums">{unread}</Badge>}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-60 hover:opacity-100"
            aria-label="Mark all as read"
            disabled={unread === 0}
            onClick={markAll}
          >
            <CheckCheckIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        <ScrollArea className="max-h-80">
          {failed && <p className="text-muted-foreground px-4 py-6 text-center text-sm">Couldn’t load notifications. Open the feed to retry.</p>}
          {!failed && items === null && <p className="text-muted-foreground px-4 py-6 text-center text-sm">Loading…</p>}
          {!failed && items?.length === 0 && (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">You’re all caught up.</p>
          )}
          {items?.slice(0, 20).map((n, i, arr) => (
            <div key={n.id} className="relative">
              {!n.read && (
                <span className="bg-primary pointer-events-none absolute top-3 right-3 size-1.5 rounded-full" aria-hidden="true" />
              )}
              <a
                href={n.href ?? "/notifications"}
                className="hover:bg-accent focus-visible:bg-accent flex items-start gap-2 p-2 pr-6 outline-none"
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center [&_svg]:size-4", TONE[n.type])}>
                  {ICON[n.type]}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-sm", !n.read && "font-medium")}>{n.title}</span>
                  {n.body && <span className="text-muted-foreground line-clamp-2 text-xs">{n.body}</span>}
                  <span className="text-muted-foreground text-xs">{relativeTime(n.createdAt)}</span>
                </span>
              </a>
              {i < arr.length - 1 && <Separator className="opacity-60" />}
            </div>
          ))}
        </ScrollArea>

        <div className="border-border/60 border-t px-2 py-1">
          <Button variant="ghost" size="sm" className="w-full text-xs" render={<a href="/notifications" />}>
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
