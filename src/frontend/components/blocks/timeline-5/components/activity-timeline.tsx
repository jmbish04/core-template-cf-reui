/**
 * @fileoverview ActivityTimeline — ReUI Pro block `timeline-5`, re-content-ed
 * from a release changelog to the real activity log.
 *
 * Keeps the block's grammar exactly: the ReUI `Timeline` primitive, the left
 * date rail that breaks out of the item on `sm`, and the colour-coded badge row
 * under each entry. Presentation only — the caller owns fetching and filtering.
 */

import { Badge, type BadgeProps } from "@/components/reui/badge";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import type { ActivityEntry } from "@/components/activity/types";
import { relativeTime, shortDate } from "@/lib/format";

/**
 * Action verb → badge variant. The verbs are free text on the server (the
 * `logActivity` helper takes any string), so anything unrecognised falls back
 * to the neutral `invert-light`.
 */
const ACTION_VARIANT: Record<string, BadgeProps["variant"]> = {
  created: "success-light",
  updated: "info-light",
  deleted: "destructive-light",
  commented: "primary-light",
  completed: "success-light",
  archived: "warning-light",
};

/** Resolve an action verb's badge variant, defaulting to neutral. */
function actionVariant(action: string): BadgeProps["variant"] {
  return ACTION_VARIANT[action.toLowerCase()] ?? "invert-light";
}

/** ISO-ish `datetime` attribute for the `<time>` element on the rail. */
function isoDate(value: string | number): string {
  const d = new Date(typeof value === "number" ? value : value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Render the activity log as a vertical timeline.
 *
 * @param entries Rows from `GET /api/activity`, newest first.
 */
export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Timeline defaultValue={1} className="w-full">
      {entries.map((entry, index) => (
        <TimelineItem
          key={entry.id}
          step={index + 1}
          className="group-data-[orientation=vertical]/timeline:not-last:pb-8 sm:group-data-[orientation=vertical]/timeline:ms-32"
        >
          <TimelineHeader>
            <TimelineSeparator className="!bg-primary/10" />
            <TimelineDate
              dateTime={isoDate(entry.createdAt)}
              className="sm:group-data-[orientation=vertical]/timeline:absolute sm:group-data-[orientation=vertical]/timeline:-left-32 sm:group-data-[orientation=vertical]/timeline:w-20 sm:group-data-[orientation=vertical]/timeline:text-right"
            >
              {shortDate(entry.createdAt)}
            </TimelineDate>
            <TimelineTitle className="sm:-mt-0.5">{entry.summary}</TimelineTitle>
            <TimelineIndicator />
          </TimelineHeader>
          <TimelineContent className="space-y-2.5">
            <p className="leading-5">
              {entry.actor} · {relativeTime(entry.createdAt)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
              <Badge variant="secondary">{entry.entityType}</Badge>
            </div>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
