/**
 * @fileoverview Option lists for the `/settings/preferences` rows.
 *
 * These are the allowed *values* of the `preferences` D1 columns paired with a
 * human label — not demo data. The row values themselves always come from
 * `GET /api/settings/preferences`; this file only decides how each one reads in
 * the control.
 */
import type { Option } from "@/components/ui/option-select";

/** `preferences.theme` — matched to the shell's dark-by-default behaviour. */
export const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

/** `preferences.font_size`. */
export const FONT_SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] as const;

/** `preferences.date_format`. */
export const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const;

/** `preferences.time_format`. */
export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
] as const;

/** `preferences.density`. */
export const DENSITY_OPTIONS: Option<string>[] = [
  { value: "compact", label: "Compact", description: "Tighter rows; more on screen." },
  { value: "comfortable", label: "Comfortable", description: "The default spacing." },
  { value: "spacious", label: "Spacious", description: "Roomier targets for touch." },
];

/** `preferences.language` — BCP 47 codes. */
export const LANGUAGE_OPTIONS: Option<string>[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "ja", label: "日本語" },
];

/** `preferences.number_format` — the locale numbers are formatted with. */
export const NUMBER_FORMAT_OPTIONS: Option<string>[] = [
  { value: "en-US", label: "1,234.56 (en-US)" },
  { value: "en-GB", label: "1,234.56 (en-GB)" },
  { value: "de-DE", label: "1.234,56 (de-DE)" },
  { value: "fr-FR", label: "1 234,56 (fr-FR)" },
  { value: "ja-JP", label: "1,234.56 (ja-JP)" },
];

/** `preferences.timezone` — IANA names. */
export const TIMEZONE_OPTIONS: Option<string>[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

/** The five boolean `preferences` columns, as the settings-3 switch list. */
export const ACCESSIBILITY_TOGGLES = [
  {
    key: "animations",
    label: "Interface animations",
    description: "Play CSS transitions and entrance animations.",
  },
  {
    key: "reducedMotion",
    label: "Honour reduced motion",
    description: "Follow the operating system's reduced-motion setting.",
  },
  {
    key: "highContrast",
    label: "High contrast",
    description: "Raise contrast on borders, text and focus rings.",
  },
  {
    key: "screenReader",
    label: "Screen reader markup",
    description: "Emit the fuller ARIA labelling screen readers benefit from.",
  },
  {
    key: "keyboardShortcuts",
    label: "Keyboard shortcuts",
    description: "Enable the global shortcut bindings, including ⌘K.",
  },
] as const;

/** Keys of the boolean preference columns. */
export type AccessibilityKey = (typeof ACCESSIBILITY_TOGGLES)[number]["key"];

/**
 * Widen a readonly option tuple into the array `OptionSelect` expects.
 *
 * @param options - A `as const` option tuple.
 * @returns The same options as a mutable `Option[]`.
 */
export function toOptions<T extends string>(
  options: readonly { value: T; label: string }[],
): Option<T>[] {
  return options.map((option) => ({ value: option.value, label: option.label }));
}
