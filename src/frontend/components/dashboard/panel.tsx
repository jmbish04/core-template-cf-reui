/**
 * @fileoverview The two pieces `/dashboard` and `/analytics` both need: a
 * titled frame panel that owns its own loading / error state, and the range
 * picker that drives every dashboard request.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { OptionSelect } from "@/components/ui/option-select";
import { ErrorState } from "@/components/common";
import { RANGE_OPTIONS, type DashboardRange } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A titled panel that renders a skeleton while loading and an inline
 * `ErrorState` on failure, so no caller repeats that branch.
 *
 * @param title Panel heading.
 * @param description Optional one-line subheading.
 * @param loading Whether the panel's data is still in flight.
 * @param error Message from a failed request, if any.
 * @param onRetry Re-issues the failed request.
 * @param children Panel body, rendered only once data has arrived.
 */
export function ChartPanel({
  title,
  description,
  loading,
  error,
  onRetry,
  className,
  children,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FramePanel className={cn("flex min-w-0 flex-col", className)}>
      <FrameHeader className="px-0 pt-0 pb-3">
        <FrameTitle>{title}</FrameTitle>
        {description ? <FrameDescription>{description}</FrameDescription> : null}
      </FrameHeader>
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : (
        children
      )}
    </FramePanel>
  );
}

/**
 * The 7d / 30d / 90d window picker.
 *
 * Uses `OptionSelect`, which passes Base UI's `items` map so the trigger shows
 * the resolved label rather than the raw `30d` value.
 *
 * @param value Current window.
 * @param onChange Called with the newly chosen window.
 */
export function RangeSelect({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
}) {
  return (
    <OptionSelect
      value={value}
      options={RANGE_OPTIONS}
      ariaLabel="Time window"
      className="w-[150px]"
      onChange={onChange}
    />
  );
}
