/**
 * @fileoverview `/settings/notifications` — the channel × category matrix from
 * the `notification_prefs` D1 table.
 *
 * `GET /api/settings/notification-prefs` seeds every combination on first read,
 * so the grid is always complete. Saving sends the whole matrix back through
 * the bulk `PUT`, which upserts row by row.
 *
 * RESPONSIVE STRATEGY
 * desktop: one settings-3 row per category, its four channel switches in a
 * 2-up grid on the right.
 * mobile (390px): the switches stack one per line under the category copy.
 */
import { useCallback, useMemo, useState } from "react";

import { SettingField } from "@/components/blocks/settings-3/components/setting-field";
import { ErrorState } from "@/components/common";
import { SaveBar } from "@/components/settings/save-bar";
import {
  CATEGORY_COPY,
  CHANNEL_LABELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPref,
} from "@/components/settings/types";
import { useResource } from "@/components/settings/use-resource";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";

/** `"<category>:<channel>"` → enabled. Flat so comparison is a string compare. */
type Matrix = Record<string, boolean>;

const key = (category: NotificationCategory, channel: NotificationChannel) => `${category}:${channel}`;

const loadPrefs = () => apiGet<NotificationPref[]>("settings/notification-prefs");

/**
 * The notification-preferences screen.
 *
 * @returns The island for `/settings/notifications`.
 */
export function NotificationPrefsForm() {
  const { data, loading, error, reload, setData } = useResource<NotificationPref[]>(loadPrefs);
  const [draft, setDraft] = useState<Matrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loaded = useMemo<Matrix | null>(() => (data ? toMatrix(data) : null), [data]);
  const value = draft ?? loaded;
  const dirty = Boolean(draft && loaded && !sameMatrix(draft, loaded));

  const toggle = useCallback(
    (category: NotificationCategory, channel: NotificationChannel, next: boolean) => {
      setSaved(false);
      setSaveError(null);
      setDraft((prev) => {
        const base = prev ?? loaded;
        if (!base) return prev;
        return { ...base, [key(category, channel)]: next };
      });
    },
    [loaded],
  );

  async function save() {
    if (!value) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = NOTIFICATION_CATEGORIES.flatMap((category) =>
        NOTIFICATION_CHANNELS.map((channel) => ({
          category,
          channel,
          enabled: value[key(category, channel)] ?? false,
        })),
      );
      const rows = await apiSend<NotificationPref[]>("PUT", "settings/notification-prefs", body);
      setData(rows);
      setDraft(null);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save those preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (loading || !value) return <Skeleton className="h-[30rem] w-full rounded-lg" />;

  return (
    <Frame className="w-full">
      <FrameHeader className="px-2! py-2.5!">
        <FrameTitle>Notifications</FrameTitle>
        <FrameDescription>
          Which channels carry which events. Every combination is a row in `notification_prefs`.
        </FrameDescription>
      </FrameHeader>

      <FramePanel className="p-0">
        <FieldGroup className="gap-0">
          {NOTIFICATION_CATEGORIES.map((category, index) => (
            <SettingField
              key={category}
              title={CATEGORY_COPY[category].label}
              description={CATEGORY_COPY[category].description}
              last={index === NOTIFICATION_CATEGORIES.length - 1}
              contentClassName="@md/field-group:w-[22rem]"
            >
              <FieldSet className="w-full gap-3">
                <FieldLegend className="sr-only">
                  {CATEGORY_COPY[category].label} channels
                </FieldLegend>
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  {NOTIFICATION_CHANNELS.map((channel) => {
                    const id = `notif-${category}-${channel}`;
                    return (
                      <Field key={channel} orientation="horizontal" className="gap-3">
                        <Switch
                          id={id}
                          checked={value[key(category, channel)] ?? false}
                          onCheckedChange={(next) => toggle(category, channel, next)}
                        />
                        <FieldContent className="gap-0">
                          <FieldLabel htmlFor={id}>{CHANNEL_LABELS[channel]}</FieldLabel>
                        </FieldContent>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </SettingField>
          ))}
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
 * Flatten the API rows into the `"category:channel"` map the grid renders.
 *
 * @param rows - Rows from `GET /api/settings/notification-prefs`.
 * @returns One boolean per combination; missing rows read as disabled.
 */
function toMatrix(rows: NotificationPref[]): Matrix {
  const matrix: Matrix = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    for (const channel of NOTIFICATION_CHANNELS) matrix[key(category, channel)] = false;
  }
  for (const row of rows) matrix[key(row.category, row.channel)] = row.enabled;
  return matrix;
}

/**
 * Compare two matrices over the full key set.
 *
 * @param a - First matrix.
 * @param b - Second matrix.
 * @returns True when every combination matches.
 */
function sameMatrix(a: Matrix, b: Matrix): boolean {
  return NOTIFICATION_CATEGORIES.every((category) =>
    NOTIFICATION_CHANNELS.every((channel) => a[key(category, channel)] === b[key(category, channel)]),
  );
}
