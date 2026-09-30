/**
 * @fileoverview `/settings/preferences` — the real `preferences` D1 row,
 * one settings-3 field row per column.
 *
 * Reads `GET /api/settings/preferences` (the API creates the `default` row on
 * first read) and writes the whole draft back with `PUT` when the save bar is
 * used. Every control is bound to a column; nothing on screen is demo data.
 *
 * RESPONSIVE STRATEGY
 * desktop: label + description on the left, control right-aligned at 19.5rem.
 * mobile (390px): `Field orientation="responsive"` stacks the control under
 * its label; toggle groups wrap rather than scroll.
 */
import { useCallback, useState } from "react";

import { SettingField } from "@/components/blocks/settings-3/components/setting-field";
import { ColorPicker } from "@/components/blocks/settings-3/components/color-picker";
import { ErrorState } from "@/components/common";
import { SaveBar } from "@/components/settings/save-bar";
import {
  ACCESSIBILITY_TOGGLES,
  DATE_FORMAT_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LANGUAGE_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  THEME_OPTIONS,
  TIMEZONE_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from "@/components/settings/preferences-options";
import type { Preferences } from "@/components/settings/types";
import { useResource } from "@/components/settings/use-resource";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiGet, apiSend } from "@/lib/api";

/** Columns the PUT body accepts — everything except `id` and `updatedAt`. */
type Draft = Omit<Preferences, "id" | "updatedAt">;

const loadPreferences = () => apiGet<Preferences>("settings/preferences");

/**
 * The preferences screen: a settings-3 `Frame` of field rows over a save bar.
 *
 * @returns The island for `/settings/preferences`.
 */
export function PreferencesForm() {
  const { data, loading, error, reload, setData } = useResource<Preferences>(loadPreferences);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The draft only exists once something has been edited; until then the
  // loaded row *is* the form value, which is what makes `dirty` trivial.
  const value: Draft | null = draft ?? (data ? stripMeta(data) : null);
  const dirty = draft !== null && data !== undefined && !same(draft, stripMeta(data));

  const set = useCallback(<K extends keyof Draft>(key: K, next: Draft[K]) => {
    setSaved(false);
    setSaveError(null);
    setDraft((prev) => (prev ? { ...prev, [key]: next } : prev));
  }, []);

  // A control edited before any other edit needs the baseline copied in first.
  const edit = <K extends keyof Draft>(key: K, next: Draft[K]) => {
    if (!draft && data) setDraft({ ...stripMeta(data), [key]: next });
    else set(key, next);
  };

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const row = await apiSend<Preferences>("PUT", "settings/preferences", draft);
      setData(row);
      setDraft(null);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save those preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (loading || !value) return <Skeleton className="h-[34rem] w-full rounded-lg" />;

  return (
    <Frame className="w-full">
      <FrameHeader className="px-2! py-2.5!">
        <FrameTitle>Preferences</FrameTitle>
        <FrameDescription>
          Appearance, locale and accessibility, stored in the `preferences` table.
        </FrameDescription>
      </FrameHeader>

      <FramePanel className="p-0">
        <FieldGroup className="gap-0">
          <SettingField
            title="Theme"
            description="Colour scheme the app starts in. The shell is dark by default."
          >
            <ToggleGroup
              multiple={false}
              value={[value.theme]}
              onValueChange={(next) => next.length > 0 && edit("theme", next[0]!)}
              variant="outline"
              size="sm"
              aria-label="Theme"
              className="flex-wrap"
            >
              {THEME_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingField>

          <SettingField
            title="Accent colour"
            description="Stored as a hex string and used for brand accents."
            badge={{ label: "Required", variant: "destructive-light" }}
          >
            <ColorPicker value={value.accentColor} onChange={(next) => edit("accentColor", next)} />
          </SettingField>

          <SettingField
            title="Base font size"
            description="Scales the type ramp across every page."
          >
            <ToggleGroup
              multiple={false}
              value={[value.fontSize]}
              onValueChange={(next) => next.length > 0 && edit("fontSize", next[0]!)}
              variant="outline"
              size="sm"
              aria-label="Base font size"
              className="flex-wrap"
            >
              {FONT_SIZE_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingField>

          <SettingField
            title="Density"
            description="How much breathing room rows, cards and toolbars get."
          >
            <OptionSelect
              value={value.density}
              options={DENSITY_OPTIONS}
              ariaLabel="Density"
              size="default"
              className="w-full"
              contentClassName="max-w-80"
              onChange={(next) => edit("density", next)}
            />
          </SettingField>

          <SettingField
            title="Language & timezone"
            description="Locale for copy, and the timezone timestamps render in."
            contentClassName="@md/field-group:w-[22rem]"
          >
            <FieldSet className="w-full gap-3">
              <FieldLegend className="sr-only">Language and timezone</FieldLegend>
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel>Language</FieldLabel>
                  <OptionSelect
                    value={value.language}
                    options={LANGUAGE_OPTIONS}
                    ariaLabel="Language"
                    size="default"
                    className="w-full"
                    onChange={(next) => edit("language", next)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Timezone</FieldLabel>
                  <OptionSelect
                    value={value.timezone}
                    options={TIMEZONE_OPTIONS}
                    ariaLabel="Timezone"
                    size="default"
                    className="w-full"
                    onChange={(next) => edit("timezone", next)}
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
          </SettingField>

          <SettingField title="Date format" description="How dates are written out.">
            <ToggleGroup
              multiple={false}
              value={[value.dateFormat]}
              onValueChange={(next) => next.length > 0 && edit("dateFormat", next[0]!)}
              variant="outline"
              size="sm"
              aria-label="Date format"
              className="flex-wrap"
            >
              {DATE_FORMAT_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingField>

          <SettingField title="Clock" description="12- or 24-hour times.">
            <ToggleGroup
              multiple={false}
              value={[value.timeFormat]}
              onValueChange={(next) => next.length > 0 && edit("timeFormat", next[0]!)}
              variant="outline"
              size="sm"
              aria-label="Clock format"
              className="flex-wrap"
            >
              {TIME_FORMAT_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingField>

          <SettingField
            title="Number format"
            description="Locale used for grouping and decimal separators."
          >
            <OptionSelect
              value={value.numberFormat}
              options={NUMBER_FORMAT_OPTIONS}
              ariaLabel="Number format"
              size="default"
              className="w-full"
              onChange={(next) => edit("numberFormat", next)}
            />
          </SettingField>

          <SettingField
            title="Motion & accessibility"
            description="The five boolean preference columns."
            last
            contentClassName="@md/field-group:w-[22rem]"
          >
            <FieldSet className="w-full gap-3">
              <FieldLegend className="sr-only">Motion and accessibility</FieldLegend>
              <FieldGroup className="gap-3">
                {ACCESSIBILITY_TOGGLES.map((toggle) => (
                  <Field key={toggle.key} orientation="horizontal" className="gap-3">
                    <Switch
                      id={`prefs-${toggle.key}`}
                      checked={value[toggle.key]}
                      onCheckedChange={(next) => edit(toggle.key, next)}
                      className="mt-0.5"
                    />
                    <FieldContent className="gap-0.5">
                      <FieldLabel htmlFor={`prefs-${toggle.key}`}>{toggle.label}</FieldLabel>
                      <FieldDescription className="text-xs">{toggle.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
          </SettingField>
        </FieldGroup>
      </FramePanel>

      <FrameFooter>
        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          error={saveError}
          onSave={() => void save()}
          onDiscard={() => {
            setDraft(null);
            setSaveError(null);
            setSaved(false);
          }}
        />
      </FrameFooter>
    </Frame>
  );
}

/**
 * Drop the server-owned columns so the rest can be PUT back verbatim.
 *
 * @param row - A loaded preferences row.
 * @returns The editable subset.
 */
function stripMeta(row: Preferences): Draft {
  const { id: _id, updatedAt: _updatedAt, ...rest } = row;
  return rest;
}

/**
 * Shallow-compare two drafts; every column is a primitive.
 *
 * @param a - First draft.
 * @param b - Second draft.
 * @returns True when no column differs.
 */
function same(a: Draft, b: Draft): boolean {
  return (Object.keys(a) as Array<keyof Draft>).every((key) => a[key] === b[key]);
}
