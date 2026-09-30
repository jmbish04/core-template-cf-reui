/**
 * @fileoverview ColorPicker — the accent-colour swatch row from ReUI block
 * `settings-3`, made controlled so it can carry the persisted
 * `preferences.accent_color` value instead of local demo state.
 *
 * The hex values here are DATA, not design tokens: they are what gets written
 * to D1 and read back, which is why they are inline `style` rather than
 * classes. A value outside the preset row (set through the API, or by an older
 * build) still renders, as a seventh swatch marked "Current".
 */
"use client"

import { cn } from "@/lib/utils"

import { FieldLegend, FieldSet } from "@/components/ui/field"
import { ACCENT_COLORS } from "./data"
import { CheckIcon } from "lucide-react"

/**
 * Render the accent-colour swatches.
 *
 * @param value - Currently selected colour as a hex string.
 * @param onChange - Called with the newly picked hex string.
 * @returns A radio-style row of colour buttons.
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const normalized = value.toLowerCase()
  const known = ACCENT_COLORS.some((color) => color.value.toLowerCase() === normalized)
  const swatches = known
    ? ACCENT_COLORS
    : [...ACCENT_COLORS, { name: `Current (${value})`, value }]

  return (
    <FieldSet className="gap-0">
      <FieldLegend className="sr-only">Accent color</FieldLegend>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {swatches.map((color) => {
          const selected = color.value.toLowerCase() === normalized
          return (
            <button
              key={color.value}
              type="button"
              aria-label={color.name}
              aria-pressed={selected}
              onClick={() => onChange(color.value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-shadow",
                selected && "ring-ring ring-offset-background ring-2 ring-offset-2"
              )}
              style={{ backgroundColor: color.value }}
            >
              {selected ? (
                <CheckIcon className="size-3 text-white" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>
    </FieldSet>
  )
}
