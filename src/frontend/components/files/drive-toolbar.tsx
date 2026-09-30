/**
 * @fileoverview The browse toolbar for `/files`: breadcrumb, search, type
 * filter, starred toggle, list/grid switch and the View settings popover.
 *
 * Split out of the explorer so each file stays readable. The breadcrumb is the
 * API's `path` array, so it is correct without a client-side tree walk; while a
 * search is running the API returns an empty path and the breadcrumb says
 * "Search results" instead of pretending the hits live in one folder.
 *
 * SELECTS: `OptionSelect` from `@/components/ui/option-select`, never a raw
 * `Select` + `SelectValue placeholder`. Base UI renders the raw value unless
 * `Select.Root` gets `items`, so a Radix-shaped filter would show `__all__` in
 * the trigger on load.
 */
import { Fragment } from "react";
import { LayoutGridIcon, ListIcon, MenuIcon, SearchIcon, StarIcon } from "lucide-react";

import {
  FILE_KIND_OPTIONS,
  type FileKind,
} from "@/components/blocks/solution-files-1/components/data";
import {
  ViewSettings,
  type DriveDensity,
  type DriveProperty,
  type DriveSortKey,
} from "@/components/blocks/solution-files-1/components/view-settings";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { OptionSelect } from "@/components/ui/option-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type DriveViewMode = "list" | "grid";

export interface DriveToolbarProps {
  /** Root → current folder from `GET /api/files`; empty at the root. */
  path: Array<{ id: string; name: string }>;
  searching: boolean;
  query: string;
  kindFilter: FileKind | "all";
  starredOnly: boolean;
  viewMode: DriveViewMode;
  density: DriveDensity;
  sortKey: DriveSortKey | "custom";
  visibleProperties: Record<DriveProperty, boolean>;
  onNavigate: (folderId: string | null) => void;
  onQueryChange: (query: string) => void;
  onKindFilterChange: (kind: FileKind | "all") => void;
  onStarredOnlyChange: (starredOnly: boolean) => void;
  onViewModeChange: (mode: DriveViewMode) => void;
  onDensityChange: (density: DriveDensity) => void;
  onSortChange: (sort: DriveSortKey) => void;
  onToggleProperty: (property: DriveProperty) => void;
  /** Opens the folder rail in a sheet below `lg`. */
  onOpenRail: () => void;
}

/**
 * Render the browse toolbar.
 *
 * @param props - Controlled toolbar state and its handlers.
 * @returns The toolbar row.
 */
export function DriveToolbar({
  path,
  searching,
  query,
  kindFilter,
  starredOnly,
  viewMode,
  density,
  sortKey,
  visibleProperties,
  onNavigate,
  onQueryChange,
  onKindFilterChange,
  onStarredOnlyChange,
  onViewModeChange,
  onDensityChange,
  onSortChange,
  onToggleProperty,
  onOpenRail,
}: DriveToolbarProps) {
  const crumbs = [{ id: "", name: "My Drive" }, ...path];

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-2 px-4 py-2.5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-2 lg:me-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label="Open folder rail"
          onClick={onOpenRail}
        >
          <MenuIcon aria-hidden="true" />
        </Button>

        {searching ? (
          <p className="text-muted-foreground truncate text-sm">
            Search results across the whole drive
          </p>
        ) : (
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                // The separator is a sibling <li>: an <li> inside an <li> is
                // invalid and hydrates differently on the client.
                return (
                  <Fragment key={crumb.id || "root"}>
                    <BreadcrumbItem className="min-w-0">
                      {last ? (
                        <BreadcrumbPage className="truncate">{crumb.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          render={
                            <button
                              type="button"
                              className="truncate"
                              onClick={() => onNavigate(crumb.id || null)}
                            >
                              {crumb.name}
                            </button>
                          }
                        />
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
        <InputGroup className="w-full lg:w-56">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search the drive"
            aria-label="Search files"
          />
        </InputGroup>

        <OptionSelect
          value={kindFilter}
          options={[{ value: "all" as const, label: "All types" }, ...FILE_KIND_OPTIONS]}
          ariaLabel="Filter by type"
          size="default"
          className="flex-1 lg:w-[132px] lg:flex-none"
          onChange={(next) => onKindFilterChange(next)}
        />

        {/* The API scopes `scope=starred` to the folder being listed, and widens
            it to the whole drive once a search term is present. The title says
            so rather than leaving the user to guess which they got. */}
        <Button
          type="button"
          variant={starredOnly ? "secondary" : "outline"}
          aria-pressed={starredOnly}
          className="shrink-0"
          title={
            searching
              ? "Show only starred entries among the search results"
              : "Show only starred entries in this folder"
          }
          onClick={() => onStarredOnlyChange(!starredOnly)}
        >
          <StarIcon
            className={starredOnly ? "text-warning size-4 fill-current" : "size-4"}
            aria-hidden="true"
          />
          <span className="max-sm:sr-only">Starred</span>
        </Button>

        <ToggleGroup
          multiple={false}
          spacing={0}
          value={[viewMode]}
          onValueChange={(next: string[]) => {
            // Deselecting the active item yields [], which would leave the
            // browse surface with no view at all.
            const mode = next[0] as DriveViewMode | undefined;
            if (mode) onViewModeChange(mode);
          }}
          variant="outline"
          size="default"
          aria-label="Browse view"
          className="shrink-0"
        >
          <ToggleGroupItem value="list" aria-label="List view">
            <ListIcon className="size-4" aria-hidden="true" />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGridIcon className="size-4" aria-hidden="true" />
          </ToggleGroupItem>
        </ToggleGroup>

        <ViewSettings
          density={density}
          sortKey={sortKey}
          visibleProperties={visibleProperties}
          onDensityChange={onDensityChange}
          onSortChange={onSortChange}
          onToggleProperty={onToggleProperty}
        />
      </div>
    </div>
  );
}
