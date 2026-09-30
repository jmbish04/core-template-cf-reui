/**
 * @fileoverview The four job modes, as one radio row under the composer.
 *
 * A mode is a setting, not a button: picking one changes the placeholder and
 * the instruction prepended to the next message, so the radio semantics the
 * block ships are the right ones. Kept from ReUI `ai-chat-5`; the four jobs
 * behind it are this template's own.
 */
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { MODES, type ModeId } from "./job-modes";

const MODE_FIELD_ID = "chat-sources-mode";

export interface ModeChipsProps {
  mode: ModeId;
  onModeChange: (id: ModeId) => void;
}

/**
 * Render the mode row.
 *
 * @param props The current mode and its setter.
 * @returns A radio group styled as chips.
 */
export function ModeChips({ mode, onModeChange }: ModeChipsProps) {
  return (
    <RadioGroup
      value={mode}
      onValueChange={(next: ModeId) => next && onModeChange(next)}
      aria-label="What to do"
      render={<FieldGroup className="flex-row flex-wrap justify-center gap-x-2 gap-y-3" />}
    >
      {MODES.map((item) => {
        const fieldId = `${MODE_FIELD_ID}-${item.id}`;
        const Icon = item.icon;
        return (
          <FieldLabel
            key={item.id}
            htmlFor={fieldId}
            className="has-data-checked:border-primary/50 has-data-checked:bg-primary/5 dark:has-data-checked:bg-primary/10 has-[:focus-visible]:ring-ring/50 relative w-auto! cursor-pointer p-0 transition-colors has-[:focus-visible]:ring-[3px]"
          >
            {/* The card's padding varies across styles, so the chip pins its own box. */}
            <Field orientation="horizontal" className="h-8 px-3 py-0">
              {/* Undrawn, not removed: it still takes focus and arrow keys. */}
              <RadioGroupItem id={fieldId} value={item.id} className="sr-only" />
              <FieldTitle className="gap-1.5">
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </FieldTitle>
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}
