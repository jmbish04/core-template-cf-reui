/**
 * @fileoverview Small date/number formatting helpers shared across feature
 * pages. Timestamps from the API are epoch milliseconds (or ISO strings).
 */

/**
 * A timestamp as the API actually serialises it.
 *
 * The Worker stores Drizzle `mode: "timestamp"` columns as integers but
 * serialises them to JSON as ISO STRINGS. Typing a wire field as `number`
 * therefore lies, and the lie only bites when someone does arithmetic on it
 * (`a.createdAt - b.createdAt` silently yields NaN and the sort becomes a
 * no-op). Type wire timestamps as this, and put them through `toMs` before
 * comparing or subtracting.
 */
export type Timestamp = Date | number | string;

/**
 * Coerce a `Timestamp` into epoch milliseconds.
 *
 * @param value An ISO string, epoch ms, or Date — whatever the wire gave you.
 * @returns Epoch ms, or null when the value is absent or unparseable.
 * @example
 * rows.sort((a, b) => (toMs(a.createdAt) ?? 0) - (toMs(b.createdAt) ?? 0));
 */
export function toMs(value: Timestamp | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Human relative time, e.g. "just now", "5m ago", "3d ago", "in 2h". */
export function relativeTime(value: Date | number | string | null | undefined): string {
  const ms = toMs(value);
  if (ms === null) return "";
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  if (abs < 45000) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, unitMs] of units) {
    if (abs >= unitMs || unit === "second") {
      return rtf.format(Math.round(diff / unitMs), unit);
    }
  }
  return "just now";
}

/** Short absolute date, e.g. "Nov 28" or "Nov 28, 2026" if a different year. */
export function shortDate(value: Date | number | string | null | undefined): string {
  const ms = toMs(value);
  if (ms === null) return "";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Compact number, e.g. 1.2k, 3.4M. */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Human-readable byte size, e.g. "0 B", "1.4 KB", "3.2 MB". */
export function humanSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || value % 1 === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
