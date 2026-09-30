/**
 * @fileoverview `/files` — the drive explorer from ReUI block
 * `solution-files-1`, wired to the real `/api/files` backend.
 *
 * The block shipped an in-memory demo drive; every row here is a `files` D1
 * row whose bytes live in R2. Endpoints used: `GET /api/files` (list or
 * search), `GET /api/files/tree` (the rail), `GET /api/files/storage` (the
 * meter), `POST /api/files/folders`, `POST /api/files/upload`,
 * `PATCH /api/files/{id}` (rename / move / star), `DELETE /api/files/{id}`
 * (cascading) and `GET /api/files/{id}/content` (download).
 *
 * What the block offered and the API cannot back — sharing, version history
 * and a restorable bin — is gone rather than mocked.
 *
 * RESPONSIVE STRATEGY
 * desktop: 16rem folder rail beside the browse panel; list view shows all
 * seven columns.
 * mobile (390px): the rail moves into a sheet behind the menu button, the list
 * keeps only Name and its actions (the rest would force a sideways scroll),
 * and the card view stays available for the full picture.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderPlusIcon, UploadIcon } from "lucide-react";
import { useTable, type RowSelectionState } from "@tanstack/react-table";

import { DataGrid, dataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { createDriveColumns } from "@/components/blocks/solution-files-1/components/columns";
import type { NamePrompt } from "@/components/blocks/solution-files-1/components/crud-dialogs";
import {
  DRIVE_NAME,
  DRIVE_ROOT_ID,
  collectAllRows,
  findRow,
  formatCount,
  getFolderPath,
  type DriveRow,
} from "@/components/blocks/solution-files-1/components/data";
import { DriveEmptyState } from "@/components/blocks/solution-files-1/components/empty-state";
import { FileCardGrid } from "@/components/blocks/solution-files-1/components/file-card-grid";
import { FolderBand } from "@/components/blocks/solution-files-1/components/folder-band";
import { DriveSelectionBar } from "@/components/blocks/solution-files-1/components/selection-bar";
import { UploadPanel } from "@/components/blocks/solution-files-1/components/upload-panel";
import { ErrorState } from "@/components/common";
import { copyDownloadLink, downloadFile } from "@/components/files/download";
import { DriveDialogs } from "@/components/files/drive-dialogs";
import { DriveRail } from "@/components/files/drive-rail";
import { DriveToolbar } from "@/components/files/drive-toolbar";
import { SORT_STATES, sortKeyFromSorting, useDriveView } from "@/components/files/use-drive-view";
import { useDrive } from "@/components/files/use-drive";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * The drive explorer island.
 *
 * @returns The rail, toolbar and browse surface as one card-surface module.
 */
export function DriveExplorer() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const drive = useDrive(debounced, starredOnly);

  const view = useDriveView();
  const {
    kindFilter,
    viewMode,
    density,
    sorting,
    setSorting,
    visibleProperties,
    columnVisibility,
  } = view;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<string[]>([DRIVE_ROOT_ID]);
  const [railOpen, setRailOpen] = useState(false);

  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<DriveRow | null>(null);
  const [moveDest, setMoveDest] = useState<string>(DRIVE_ROOT_ID);
  const [uploadsClosed, setUploadsClosed] = useState(false);
  const [uploadsCollapsed, setUploadsCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { folderId, setFolderId, rows, folderRows, storage, loading, error, setError } = drive;
  const searching = debounced.length > 0;

  const navigate = useCallback(
    (next: string | null) => {
      setFolderId(next);
      setRowSelection({});
      setRailOpen(false);
    },
    [setFolderId],
  );

  const filteredRows = useMemo(
    () => (kindFilter === "all" ? rows : rows.filter((row) => row.node.kind === kindFilter)),
    [rows, kindFilter],
  );

  const columns = useMemo(
    () =>
      createDriveColumns({
        onOpen: (row) => (row.node.kind === "folder" ? navigate(row.id) : void downloadFile(row, setError)),
        onToggleStar: (row) => void drive.setStarred(row.id, !row.node.starred),
        onAction: (action, row) => {
          if (action === "rename") setNamePrompt({ mode: "rename", targetId: row.id, currentName: row.node.name });
          else if (action === "star") void drive.setStarred(row.id, !row.node.starred);
          else if (action === "move") {
            setMoveTarget(row);
            setMoveDest(row.node.parentId ?? DRIVE_ROOT_ID);
          } else if (action === "link") void copyDownloadLink(row.id, setError);
          else if (action === "download") void downloadFile(row, setError);
          else if (action === "remove") setDeleteTarget({ ids: [row.id], label: `“${row.node.name}”` });
        },
      }),
    [drive, navigate, setError],
  );

  // No pager: the surface scrolls, so one page always holds the whole listing.
  const pagination = useMemo(
    () => ({ pageIndex: 0, pageSize: Math.max(filteredRows.length, 1) }),
    [filteredRows],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: filteredRows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, pagination, rowSelection, columnVisibility },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
  });

  const pageRows = table.getRowModel().rows.map((row) => row.original);
  const selectedIds = useMemo(
    () => new Set(Object.keys(rowSelection).filter((id) => rowSelection[id])),
    [rowSelection],
  );
  const selectedBytes = useMemo(
    () => filteredRows.filter((row) => selectedIds.has(row.id)).reduce((sum, row) => sum + row.sizeBytes, 0),
    [filteredRows, selectedIds],
  );

  const subfolders = useMemo(
    () => pageRows.filter((row) => row.node.kind === "folder").slice(0, 4),
    [pageRows],
  );
  const hasFilters = searching || kindFilter !== "all" || starredOnly;

  /** Ids a move may not target: the row itself and everything under it. */
  const blockedIds = useMemo(() => {
    if (!moveTarget) return new Set<string>();
    const row = findRow(folderRows, moveTarget.id);
    const subtree = row ? collectAllRows([row]).map((entry) => entry.id) : [moveTarget.id];
    return new Set(subtree);
  }, [moveTarget, folderRows]);

  const pathOf = useCallback(
    (id: string) =>
      getFolderPath(folderRows, id).map((entry) =>
        entry === DRIVE_ROOT_ID ? "My Drive" : (findRow(folderRows, entry)?.node.name ?? entry),
      ),
    [folderRows],
  );

  async function submitName(name: string) {
    if (!namePrompt) return;
    if (namePrompt.mode === "create") {
      await drive.createFolder(name, namePrompt.parentId === DRIVE_ROOT_ID ? null : namePrompt.parentId);
    } else {
      await drive.rename(namePrompt.targetId, name);
    }
    setNamePrompt(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await drive.remove(deleteTarget.ids);
    setRowSelection({});
    setDeleteTarget(null);
  }

  async function confirmMove() {
    if (!moveTarget) return;
    await drive.move(moveTarget.id, moveDest === DRIVE_ROOT_ID ? null : moveDest);
    setMoveTarget(null);
  }

  /**
   * Toggle one card's selection.
   *
   * @param row - The tile that was checked or unchecked.
   * @param next - The new checked state.
   */
  function selectCard(row: DriveRow, next: boolean) {
    setRowSelection((prev) => {
      const draft = { ...prev };
      if (next) draft[row.id] = true;
      else delete draft[row.id];
      return draft;
    });
  }

  function pickFiles() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      setUploadsClosed(false);
      void drive.upload(files, folderId);
    });
    input.click();
  }

  const rail = (
    <DriveRail
      folderRows={folderRows}
      folderId={folderId}
      storage={storage}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onNavigate={navigate}
      onRefreshStorage={() => void drive.loadStorage()}
      onFolderAction={(action, id, folder) => {
        if (action === "new")
          setNamePrompt({ mode: "create", parentId: id, parentLabel: folder?.node.name ?? "My Drive" });
        else if (!folder) return;
        else if (action === "rename")
          setNamePrompt({ mode: "rename", targetId: folder.id, currentName: folder.node.name });
        else if (action === "move") {
          setMoveTarget(folder);
          setMoveDest(folder.node.parentId ?? DRIVE_ROOT_ID);
        } else if (action === "delete")
          setDeleteTarget({ ids: [folder.id], label: `“${folder.node.name}”` });
      }}
    />
  );

  return (
    <DataGrid
      table={table}
      recordCount={filteredRows.length}
      tableLayout={{ dense: density === "compact", columnsResizable: false, columnsVisibility: false, rowBorder: true }}
      tableClassNames={{ bodyRow: "group/row", edgeCell: "first:ps-4 last:pe-4" }}
    >
      <Card className="relative h-full min-h-0 w-full gap-0! overflow-hidden p-0!">
        {drive.uploads.length > 0 && !uploadsClosed ? (
          <UploadPanel
            entries={drive.uploads}
            collapsed={uploadsCollapsed}
            onToggleCollapsed={() => setUploadsCollapsed((open) => !open)}
            onClose={() => {
              setUploadsClosed(true);
              drive.setUploads([]);
            }}
            onCancel={(id) => drive.setUploads((prev) => prev.filter((entry) => entry.id !== id))}
            onRetry={(id) => drive.setUploads((prev) => prev.filter((entry) => entry.id !== id))}
          />
        ) : null}

        <CardContent className="flex min-h-0 flex-1 flex-col p-0!">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-foreground text-base leading-none font-semibold">{DRIVE_NAME}</h2>
              <p className="text-muted-foreground truncate text-xs max-sm:hidden">
                Metadata in D1, bytes in R2. Uploads are capped at 25MB each.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setNamePrompt({
                    mode: "create",
                    parentId: folderId ?? DRIVE_ROOT_ID,
                    parentLabel: drive.path.at(-1)?.name ?? "My Drive",
                  })
                }
              >
                <FolderPlusIcon data-icon="inline-start" aria-hidden="true" />
                <span className="max-sm:sr-only">New Folder</span>
              </Button>
              <Button type="button" onClick={pickFiles}>
                <UploadIcon data-icon="inline-start" aria-hidden="true" />
                <span className="max-sm:sr-only">Upload</span>
              </Button>
            </div>
          </div>

          {error ? <ErrorState className="m-4" message={error} onRetry={() => void drive.reload()} /> : null}

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="border-border hidden w-64 shrink-0 border-e lg:flex lg:flex-col">{rail}</aside>

            <Sheet open={railOpen} onOpenChange={setRailOpen}>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b">
                  <SheetTitle>{DRIVE_NAME}</SheetTitle>
                  <SheetDescription>Pick a folder</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1">{rail}</div>
              </SheetContent>
            </Sheet>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <DriveToolbar
                path={drive.path}
                searching={searching}
                query={query}
                kindFilter={kindFilter}
                starredOnly={starredOnly}
                viewMode={viewMode}
                density={density}
                sortKey={sortKeyFromSorting(sorting)}
                visibleProperties={visibleProperties}
                onNavigate={navigate}
                onQueryChange={setQuery}
                onKindFilterChange={view.setKindFilter}
                onStarredOnlyChange={setStarredOnly}
                onViewModeChange={view.setViewMode}
                onDensityChange={view.setDensity}
                onSortChange={(next) => setSorting(SORT_STATES[next])}
                onToggleProperty={view.toggleProperty}
                onOpenRail={() => setRailOpen(true)}
              />

              <Separator />

              {selectedIds.size > 0 ? (
                <DriveSelectionBar
                  selectedCount={selectedIds.size}
                  selectedBytes={selectedBytes}
                  onDownload={() =>
                    void Promise.all(
                      filteredRows
                        .filter((row) => selectedIds.has(row.id) && row.node.kind !== "folder")
                        .map((row) => downloadFile(row, setError)),
                    )
                  }
                  onRemove={() =>
                    setDeleteTarget({
                      ids: [...selectedIds],
                      label: `${formatCount(selectedIds.size)} selected entries`,
                    })
                  }
                  onClear={() => setRowSelection({})}
                />
              ) : null}

              <ScrollArea className="min-h-0 flex-1">
                {loading && rows.length === 0 ? (
                  <p className="text-muted-foreground p-8 text-center text-sm">Loading the drive…</p>
                ) : filteredRows.length === 0 ? (
                  <DriveEmptyState
                    filtered={hasFilters}
                    onClearFilters={() => {
                      setQuery("");
                      view.setKindFilter("all");
                      setStarredOnly(false);
                    }}
                    onUpload={pickFiles}
                  />
                ) : (
                  <div className="flex flex-col gap-5 pt-3 pb-4">
                    {searching ? null : (
                      <FolderBand folders={subfolders} onOpen={(row) => navigate(row.id)} />
                    )}
                    {viewMode === "grid" ? (
                      <FileCardGrid
                        rows={pageRows}
                        visibleProperties={visibleProperties}
                        selectedIds={selectedIds}
                        onOpen={(row) => (row.node.kind === "folder" ? navigate(row.id) : void downloadFile(row, setError))}
                        onSelectChange={selectCard}
                        onToggleStar={(row) => void drive.setStarred(row.id, !row.node.starred)}
                      />
                    ) : (
                      <DataGridScrollArea>
                        <DataGridTable />
                      </DataGridScrollArea>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      <DriveDialogs
        namePrompt={namePrompt}
        onSubmitName={(name) => void submitName(name)}
        onCloseName={() => setNamePrompt(null)}
        deleteTarget={deleteTarget}
        onConfirmDelete={() => void confirmDelete()}
        onCloseDelete={() => setDeleteTarget(null)}
        moveTarget={moveTarget}
        folderRows={folderRows}
        moveDest={moveDest}
        blockedIds={blockedIds}
        onMoveDest={setMoveDest}
        onConfirmMove={() => void confirmMove()}
        onCloseMove={() => setMoveTarget(null)}
        pathOf={pathOf}
      />
    </DataGrid>
  );
}
