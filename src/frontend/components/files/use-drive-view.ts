/**
 * @fileoverview `useDriveView` — the browse preferences for `/files`: type
 * filter, list/grid mode, density, sorting and which optional columns show.
 *
 * None of this touches the server; it is the part of the explorer's state that
 * decides how the fetched rows are presented. Kept out of the explorer so that
 * file is about composition.
 */
import { useEffect, useMemo, useState } from "react";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";

import type { FileKind } from "@/components/blocks/solution-files-1/components/data";
import type {
  DriveDensity,
  DriveProperty,
  DriveSortKey,
} from "@/components/blocks/solution-files-1/components/view-settings";
import type { DriveViewMode } from "@/components/files/drive-toolbar";

/** The sorting state each named preset maps to. */
export const SORT_STATES: Record<DriveSortKey, SortingState> = {
  "name-asc": [{ id: "name", desc: false }],
  "name-desc": [{ id: "name", desc: true }],
  "size-desc": [{ id: "size", desc: true }],
  "modified-desc": [{ id: "modified", desc: true }],
  "type-asc": [{ id: "type", desc: false }],
};

/**
 * Name the current sorting state.
 *
 * Sorting is the single truth and the Sort select reads back out of it, so a
 * header click can land somewhere no preset names — that reports "custom"
 * rather than silently showing the wrong preset.
 *
 * @param sorting - The table's sorting state.
 * @returns The matching preset key, or "custom".
 */
export function sortKeyFromSorting(sorting: SortingState): DriveSortKey | "custom" {
  const match = Object.entries(SORT_STATES).find(
    ([, state]) => state[0]!.id === sorting?.[0]?.id && state[0]!.desc === sorting?.[0]?.desc,
  );
  return (match?.[0] as DriveSortKey) ?? "custom";
}

/**
 * True below `sm`, where the list view's seven columns cannot fit without a
 * sideways scroll.
 *
 * @returns Whether the viewport is narrow.
 */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return narrow;
}

/**
 * Hold the browse preferences and derive the table's column visibility.
 *
 * @returns Every preference with its setter, plus `columnVisibility`.
 */
export function useDriveView() {
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [density, setDensity] = useState<DriveDensity>("comfortable");
  const [sorting, setSorting] = useState<SortingState>(SORT_STATES["name-asc"]);
  const [visibleProperties, setVisibleProperties] = useState<Record<DriveProperty, boolean>>({
    owner: true,
    type: true,
    size: true,
    modified: true,
  });
  const isNarrow = useIsNarrow();

  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => ({
      // On a phone only Name and its actions survive. The user's own choices
      // are preserved and reapply as soon as there is room for them.
      owner: !isNarrow && visibleProperties.owner,
      type: !isNarrow && visibleProperties.type,
      size: !isNarrow && visibleProperties.size,
      modified: !isNarrow && visibleProperties.modified,
    }),
    [visibleProperties, isNarrow],
  );

  return {
    kindFilter,
    setKindFilter,
    viewMode,
    setViewMode,
    density,
    setDensity,
    sorting,
    setSorting,
    visibleProperties,
    toggleProperty: (property: DriveProperty) =>
      setVisibleProperties((prev) => ({ ...prev, [property]: !prev[property] })),
    columnVisibility,
  };
}
