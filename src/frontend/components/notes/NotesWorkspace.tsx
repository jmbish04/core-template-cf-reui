/**
 * @fileoverview NotesWorkspace — the `/notes` island: a note index beside an
 * inline PlateJS editor, both in stacked ReUI Frames.
 *
 * Block seams:
 * - Note index = ReUI `list-9` (stacked Frame: header panel, divided `Item`
 *   rows with an icon tile + title + one-line description, footer action),
 *   with `list-10`'s header search (InputGroup + search addon) and the
 *   pinned / project facet selects in the same panel.
 * - Empty workspace = ReUI `empty-state-1` (records illustration + primary
 *   action), used when the team has no notes at all.
 * - Editor = the existing `PlateEditor` (internals untouched), made flush
 *   inside a FramePanel.
 *
 * Data: `GET/POST/PATCH/DELETE /api/team-notes`. Bodies are the versioned Plate
 * JSON envelope (see `plate-value`). Create and metadata edits (author,
 * project) reuse the shared `NoteDialog`; title + body save inline (button or
 * Ctrl/Cmd+S), and a dirty draft is saved before switching notes.
 *
 * Mobile (<768px): the index fills the page; tapping a note opens the editor
 * in a full-width Sheet. Mount with `client:only="react"` (PlateJS is
 * browser-only).
 */

"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  FileTextIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  ArrowLeftIcon,
} from "lucide-react";

import { RecordsEmptyIllustration } from "@/components/blocks/empty-state-1/components/records-empty-illustration";
import { FrontendErrorDialog } from "@/components/FrontendErrorDialog";
import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { FilterSelect } from "@/components/ui/option-select";
import { NoteDialog } from "@/components/notes/NoteDialog";
import type { ListEnvelope, TeamNote } from "@/components/common";
import { useProjects } from "@/components/common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemMedia } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiGet, apiSend } from "@/lib/api";
import { useFrontendErrorHandler } from "@/lib/error-handler";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PlateEditor } from "./PlateEditor";
import { bodyToSnippet } from "./plate-value";

const SOURCE_PAGE = { url: "/notes", file: "src/frontend/pages/notes.astro" };
const FILE = "src/frontend/components/notes/NotesWorkspace.tsx";

const PINNED_OPTIONS = [
  { value: "true", label: "Pinned only" },
  { value: "false", label: "Unpinned" },
];

interface Draft {
  title: string;
  body: string;
}

export function NotesWorkspace() {
  const isMobile = useIsMobile();
  const { options: projectOptions, nameById } = useProjects();
  const { activeError, copyState, clearError, copyErrorPrompt, handleError } =
    useFrontendErrorHandler();

  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [pinned, setPinned] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const report = useCallback(
    (functionName: string, description: string, friendlyError: string, serverError: unknown) =>
      handleError({
        sourcePage: SOURCE_PAGE,
        codeSource: { file: FILE, functionName, description },
        errorDetails: { friendlyError, serverError },
      }),
    [handleError],
  );

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await apiGet<ListEnvelope<TeamNote>>("team-notes", {
        q: debouncedQ || undefined,
        pinned,
        projectId,
        limit: 100,
      });
      if (id !== reqId.current) return;
      setNotes(res.data);
      setLoadFailed(false);
    } catch (e) {
      if (id !== reqId.current) return;
      setLoadFailed(true);
      report("load", "Fetches notes from GET /api/team-notes.", "Couldn't load notes. Check your connection and retry.", e);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [debouncedQ, pinned, projectId, report]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const dirty = Boolean(selected && draft && (draft.title !== selected.title || draft.body !== selected.body));

  // Desktop: keep a note open — default to the first one once loaded.
  useEffect(() => {
    if (isMobile || selectedId || notes.length === 0) return;
    const first = notes[0]!;
    setSelectedId(first.id);
    setDraft({ title: first.title, body: first.body });
  }, [isMobile, notes, selectedId]);

  const upsert = useCallback((saved: TeamNote) => {
    setNotes((prev) =>
      prev.some((n) => n.id === saved.id) ? prev.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...prev],
    );
  }, []);

  /** Persist the inline title/body draft. Returns false when it couldn't save. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!selected || !draft || !dirty) return true;
    const problem = !draft.title.trim()
      ? "Add a title before saving."
      : !bodyToSnippet(draft.body).trim()
        ? "Write something in the note before saving."
        : null;
    setInvalid(problem);
    if (problem) return false;
    setSaving(true);
    try {
      upsert(
        await apiSend<TeamNote>("PATCH", `team-notes/${selected.id}`, {
          title: draft.title.trim(),
          body: draft.body,
        }),
      );
      return true;
    } catch (e) {
      report("save", "Saves a note via PATCH /api/team-notes/{id}.", "Couldn't save this note. Your edits are still here — retry.", e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [selected, draft, dirty, upsert, report]);

  const open = useCallback(
    async (note: TeamNote) => {
      if (note.id !== selectedId && !(await save())) return;
      setInvalid(null);
      setSelectedId(note.id);
      setDraft({ title: note.title, body: note.body });
      if (isMobile) setSheetOpen(true);
    },
    [selectedId, save, isMobile],
  );

  const handleCreated = useCallback(
    (saved: TeamNote) => {
      upsert(saved);
      setSelectedId(saved.id);
      setDraft({ title: saved.title, body: saved.body });
      if (isMobile) setSheetOpen(true);
    },
    [upsert, isMobile],
  );

  /** Metadata edits from NoteDialog: keep the inline draft in sync. */
  const handleDetailsSaved = useCallback(
    (saved: TeamNote) => {
      upsert(saved);
      setDraft({ title: saved.title, body: saved.body });
    },
    [upsert],
  );

  const togglePin = useCallback(
    async (note: TeamNote) => {
      const set = (p: boolean) => setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: p } : n)));
      set(!note.pinned);
      try {
        upsert(await apiSend<TeamNote>("PATCH", `team-notes/${note.id}`, { pinned: !note.pinned }));
      } catch (e) {
        set(note.pinned);
        report("togglePin", "Pins or unpins a note via PATCH /api/team-notes/{id}.", "Couldn't update the pin. Retry in a moment.", e);
      }
    },
    [upsert, report],
  );

  const remove = useCallback(
    async (note: TeamNote) => {
      try {
        await apiSend<{ ok: boolean }>("DELETE", `team-notes/${note.id}`);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        setSelectedId(null);
        setDraft(null);
        setSheetOpen(false);
      } catch (e) {
        report("remove", "Deletes a note via DELETE /api/team-notes/{id}.", "Couldn't delete this note. Retry in a moment.", e);
      }
    },
    [report],
  );

  /** Mobile: leaving the editor Sheet saves first, like switching notes. */
  const closeSheet = () => void save().then((ok) => ok && setSheetOpen(false));

  const onEditorKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  };

  const hasFilters = Boolean(debouncedQ || pinned || projectId);
  const activeFacets = (pinned ? 1 : 0) + (projectId ? 1 : 0);
  const noNotesAtAll = !loading && !loadFailed && !hasFilters && notes.length === 0;

  const newNoteButton = (variant: "default" | "outline", label = "New note") => (
    <NoteDialog
      onSaved={handleCreated}
      trigger={
        <Button variant={variant} size="sm">
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {label}
        </Button>
      }
    />
  );

  // ── Empty workspace (empty-state-1) ──
  if (noNotesAtAll) {
    return (
      <>
        <Frame>
          <FramePanel>
            <Empty className="border-0 py-16">
              <EmptyHeader className="gap-4">
                <EmptyMedia>
                  <RecordsEmptyIllustration />
                </EmptyMedia>
                <EmptyTitle className="text-lg font-semibold">No notes yet</EmptyTitle>
                <EmptyDescription>
                  Capture decisions, meeting notes and context the team needs at hand. Notes can be pinned and
                  linked to a project.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{newNoteButton("default", "Write the first note")}</EmptyContent>
            </Empty>
          </FramePanel>
        </Frame>
        <FrontendErrorDialog
          error={activeError}
          copyState={copyState}
          onCopyPrompt={copyErrorPrompt}
          onOpenChange={(o) => !o && clearError()}
        />
      </>
    );
  }

  // ── Note index (list-9 + list-10 search) ──
  const index = (
    <Frame stacked className="min-h-0 md:h-[calc(100svh-10rem)]">
      <FramePanel fit className="flex items-center justify-between gap-2 px-3.5! py-3!">
        <div className="flex items-center gap-2">
          <h2 className="text-foreground text-sm font-medium">All notes</h2>
          {!loading && (
            <Badge variant="secondary" size="sm" radius="full">
              {notes.length}
            </Badge>
          )}
        </div>
        {newNoteButton("default")}
      </FramePanel>

      <FramePanel fit className="flex items-center gap-2 p-2.5!">
        <InputGroup className="flex-1">
          <InputGroupAddon align="inline-start">
            <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
          />
        </InputGroup>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="icon" aria-label="Filter notes" className="relative shrink-0">
                <SlidersHorizontalIcon aria-hidden="true" />
                {activeFacets > 0 && (
                  <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
                    {activeFacets}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="end" className="flex w-60 flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium">Filter notes</p>
            <FilterSelect
              value={pinned}
              onChange={setPinned}
              options={PINNED_OPTIONS}
              allLabel="All notes"
              ariaLabel="Filter by pinned"
              className="w-full"
            />
            <FilterSelect
              value={projectId}
              onChange={setProjectId}
              options={projectOptions}
              allLabel="All projects"
              ariaLabel="Filter by project"
              className="w-full"
            />
          </PopoverContent>
        </Popover>
      </FramePanel>

      <FramePanel className="min-h-0 p-0!">
        <ScrollArea className="h-full max-md:max-h-none">
          {loading && notes.length === 0 ? (
            <div className="flex flex-col gap-3 p-3.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <Empty className="border-0 py-10">
              <EmptyHeader>
                <EmptyMedia>
                  <RecordsEmptyIllustration variant="compact" />
                </EmptyMedia>
                <EmptyTitle>{loadFailed ? "Notes didn't load" : "No notes match"}</EmptyTitle>
                <EmptyDescription>
                  {loadFailed ? "The notes API didn't respond. Retry to fetch them." : "Clear the search or filters to see more notes."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {loadFailed ? (
                  <Button variant="outline" size="sm" onClick={load}>
                    Retry
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQ("");
                      setPinned(undefined);
                      setProjectId(undefined);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="flex flex-col p-1.5" aria-label="Notes">
              {notes.map((note) => {
                const active = note.id === selectedId;
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => void open(note)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
                        active ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <Item className="border-background bg-muted flex size-9 shrink-0 items-center justify-center border-2 p-0 shadow-xs dark:border [&_svg]:size-4 [&_svg]:opacity-70">
                        <ItemMedia variant="icon" className="size-auto">
                          {note.pinned ? (
                            <PinIcon aria-hidden="true" className="fill-warning text-warning opacity-100!" />
                          ) : (
                            <FileTextIcon aria-hidden="true" />
                          )}
                        </ItemMedia>
                      </Item>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-foreground truncate text-sm font-medium">{note.title}</p>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {relativeTime(note.updatedAt)}
                          </span>
                        </div>
                        <p className="text-muted-foreground truncate text-xs">
                          {bodyToSnippet(note.body) || "—"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </FramePanel>
    </Frame>
  );

  // ── Editor (stacked Frame: header / editor / footer) ──
  const editor =
    selected && draft ? (
      <Frame stacked className="h-full min-h-0 md:h-[calc(100svh-10rem)]" onKeyDown={onEditorKeyDown}>
        <FramePanel fit className="flex items-center gap-1.5 px-3! py-2!">
          {isMobile && (
            <Button variant="ghost" size="icon-sm" aria-label="Back to notes" onClick={closeSheet}>
              <ArrowLeftIcon aria-hidden="true" />
            </Button>
          )}
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label="Note title"
            placeholder="Note title"
            className="h-8 flex-1 border-transparent bg-transparent text-base font-semibold shadow-none focus-visible:border-input dark:bg-transparent"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={selected.pinned ? "Unpin note" : "Pin note"}
            aria-pressed={selected.pinned}
            onClick={() => void togglePin(selected)}
          >
            <PinIcon
              aria-hidden="true"
              className={cn(selected.pinned ? "fill-warning text-warning" : "text-muted-foreground")}
            />
          </Button>
          <NoteDialog
            note={selected}
            onSaved={handleDetailsSaved}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit note details" className="text-muted-foreground">
                <PencilIcon aria-hidden="true" />
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Delete note" className="text-muted-foreground hover:text-destructive">
                  <Trash2Icon aria-hidden="true" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                <AlertDialogDescription>“{selected.title}” will be permanently removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void remove(selected)}>
                  Delete note
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </FramePanel>

        <FramePanel className="flex min-h-0 flex-col p-0!">
          <PlateEditor
            key={selected.id}
            id="note-body"
            value={draft.body}
            onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))}
            placeholder="Write the note…"
            className="flex min-h-0 flex-1 flex-col rounded-none bg-transparent ring-0 focus-within:ring-0"
            contentClassName="max-h-none min-h-0 flex-1 px-4 py-3"
          />
        </FramePanel>

        <FramePanel fit className="flex flex-wrap items-center justify-between gap-2 px-3.5! py-2!">
          <span className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
            {invalid ??
              `${selected.author}${selected.projectId ? ` · ${nameById.get(selected.projectId) ?? "Project"}` : ""} · ${
                dirty ? "Unsaved changes" : `Saved ${relativeTime(selected.updatedAt)}`
              }`}
          </span>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </FramePanel>
      </Frame>
    ) : (
      <Frame className="md:h-[calc(100svh-10rem)]">
        <FramePanel className="flex items-center justify-center">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No note open</EmptyTitle>
              <EmptyDescription>Pick a note from the list, or start a new one.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newNoteButton("outline")}</EmptyContent>
          </Empty>
        </FramePanel>
      </Frame>
    );

  return (
    <>
      <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
        {index}
        {!isMobile && editor}
      </div>

      <Sheet
        open={isMobile && sheetOpen && selected !== null}
        onOpenChange={(o) => !o && closeSheet()}
      >
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-2 sm:max-w-none">
          <SheetTitle className="sr-only">{selected?.title ?? "Note"}</SheetTitle>
          {editor}
        </SheetContent>
      </Sheet>

      <FrontendErrorDialog
        error={activeError}
        copyState={copyState}
        onCopyPrompt={copyErrorPrompt}
        onOpenChange={(o) => !o && clearError()}
      />
    </>
  );
}
