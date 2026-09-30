/**
 * @fileoverview OptionSelect / FilterSelect — the two select wrappers every
 * page in this template uses.
 *
 * Promoted out of the ReUI block `solution-files-1`, which is where the
 * correct composition lives, so every surface inherits it.
 *
 * THE TRAP THIS EXISTS TO AVOID: Base UI's `Select.Value` renders the RAW
 * VALUE, not the chosen item's label, unless `Select.Root` is given an
 * `items` map. A select written the Radix way — `<SelectValue placeholder=…/>`
 * with no `items` — therefore shows `__all__` or `in_progress` in the trigger
 * on load instead of "All statuses" or "In progress". Both wrappers below pass
 * `items` and render the resolved label, so the bug cannot come back through
 * a call site.
 *
 * @example
 * <OptionSelect value={status} onChange={setStatus} ariaLabel="Status"
 *   options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }]} />
 *
 * @example A filter that starts on "All" and yields `undefined` for it:
 * <FilterSelect value={status} onChange={setStatus} allLabel="All statuses"
 *   options={STATUS_OPTIONS} ariaLabel="Filter by status" />
 */
import { Fragment } from "react"
import { cn } from "@/lib/utils"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface Option<T extends string> {
  value: T
  label: string
  /** One muted line under the label, popup only. */
  description?: string
  /** Reads as a removal rather than a grant, and is ruled off from the grants. */
  destructive?: boolean
  /** Shown as the current value but not choosable. */
  disabled?: boolean
}

export function OptionSelect<T extends string>({
  value,
  options,
  ariaLabel,
  size = "sm",
  className,
  contentClassName,
  onChange,
}: {
  value: T
  options: Option<T>[]
  ariaLabel: string
  size?: "sm" | "default"
  className?: string
  /** Widen the popup past the trigger when the options carry descriptions. */
  contentClassName?: string
  onChange: (next: T) => void
}) {
  const selected = options.find((option) => option.value === value)
  const rich = options.some((option) => option.description)

  return (
    <Select
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      items={options}
    >
      <SelectTrigger
        size={size}
        aria-label={ariaLabel}
        className={cn("w-[132px] shrink-0", className)}
      >
        <SelectValue>{selected?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        // The select popup ships a floor of its own (min-w-36, min-w-32 in
        // mira), which would overhang a narrower trigger, so the anchor width
        // governs both.
        className={cn("min-w-(--anchor-width)!", contentClassName)}
      >
        <SelectGroup>
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {/* One rule between the grants and the taking-away */}
              {option.destructive && !options[index - 1]?.destructive ? (
                <SelectSeparator />
              ) : null}
              <SelectItem
                value={option.value}
                disabled={option.disabled}
                // The select item repaints every descendant to
                // accent-foreground on focus, guarded by
                // not-data-[variant=destructive], so the marker is what keeps a
                // destructive row red while hovered.
                data-variant={option.destructive ? "destructive" : undefined}
                className={cn(rich && "items-start")}
              >
                {/* SelectItem wraps children in an ItemText that is nowrap, and
                  the popup clips overflow-x, so the body sets its own wrap.
                  pe-6 keeps the description clear of the absolute check. */}
                <span
                  className={cn(
                    "flex min-w-0 flex-col gap-px pe-6 text-start",
                    option.destructive && "text-destructive"
                  )}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.description ? (
                    <small
                      className={cn(
                        "text-xs whitespace-normal",
                        option.destructive
                          ? "text-destructive/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {option.description}
                    </small>
                  ) : null}
                </span>
              </SelectItem>
            </Fragment>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}


// ---------------------------------------------------------------------------
// FilterSelect
// ---------------------------------------------------------------------------

/** Sentinel used internally for "no filter". Never leaves this module. */
const ALL = "__all__";

export interface FilterSelectProps<T extends string> {
  /** Current value, or undefined for "All". */
  value: T | undefined;
  /** Called with the new value, or undefined when "All" is chosen. */
  onChange: (value: T | undefined) => void;
  options: Option<T>[];
  /** Label rendered for the "All" row, e.g. "All statuses". */
  allLabel: string;
  ariaLabel: string;
  size?: "sm" | "default";
  className?: string;
}

/**
 * A single-select filter dropdown with a built-in "All" row that maps to
 * `undefined`, so the value can be fed straight into `qs()` (which drops
 * undefined keys) without a sentinel leaking into the query string.
 */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
  size = "sm",
  className,
}: FilterSelectProps<T>) {
  const withAll = [{ value: ALL as T, label: allLabel }, ...options];
  return (
    <OptionSelect
      value={value ?? (ALL as T)}
      options={withAll}
      ariaLabel={ariaLabel}
      size={size}
      className={className}
      onChange={(next) => onChange(next === (ALL as T) ? undefined : next)}
    />
  );
}
