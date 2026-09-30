import { type ReactNode } from "react"

// ── Types ──

export type SelectOption = {
  value: string
  label: string
}

export type Preference = {
  id: string
  label: string
  description: string
  defaultChecked: boolean
}

export type AccentColorOption = {
  name: string
  value: string
}

export type SettingBadgeVariant =
  | "primary-light"
  | "destructive-light"
  | "info-light"

export type SettingFieldProps = {
  title: string
  description: string
  badge?: { label: string; variant: SettingBadgeVariant }
  children: ReactNode
  last?: boolean
}

export type DateFormatOption = {
  value: string
  label: string
}

// ── Data ──

export const DAYS: SelectOption[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
]

export const CURRENCIES: SelectOption[] = [
  { value: "usd", label: "USD · US Dollar" },
  { value: "eur", label: "EUR · Euro" },
  { value: "gbp", label: "GBP · British Pound" },
  { value: "jpy", label: "JPY · Japanese Yen" },
]

export const REGIONS: SelectOption[] = [
  { value: "us", label: "United States" },
  { value: "eu", label: "European Union" },
  { value: "uk", label: "United Kingdom" },
  { value: "jp", label: "Japan" },
  { value: "au", label: "Australia" },
]

export const ACCENT_COLORS: AccentColorOption[] = [
  { name: "Slate", value: "#64748b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Orange", value: "#f97316" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Sky", value: "#0ea5e9" },
]

export const PREFERENCES: Preference[] = [
  {
    id: "keyboard-shortcuts",
    label: "Enable keyboard shortcuts.",
    description: "Use shortcuts to speed up your workflow.",
    defaultChecked: true,
  },
  {
    id: "spellcheck",
    label: "Auto spell-check.",
    description: "Highlight spelling errors in text fields.",
    defaultChecked: true,
  },
  {
    id: "compact-mode",
    label: "Compact Mode.",
    description: "Reduce spacing for a denser interface layout.",
    defaultChecked: false,
  },
  {
    id: "animations",
    label: "Reduce animations.",
    description: "Minimize motion effects throughout the UI.",
    defaultChecked: false,
  },
]

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  { value: "mdy", label: "MM/DD/YYYY" },
  { value: "dmy", label: "DD/MM/YYYY" },
  { value: "ymd", label: "YYYY/MM/DD" },
]