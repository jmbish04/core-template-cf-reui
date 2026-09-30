/**
 * @fileoverview AttachmentPicker — attach a REAL file from the workspace drive
 * to a prompt.
 *
 * The ReUI chat blocks ship a decorative paperclip over an invented file list.
 * This one searches `/api/files` (the D1 index behind `/files`, whose bytes
 * live in R2) and attaches what is actually there. What the model receives is
 * the file's name, type and size as a context line — see `describeAttachments`,
 * which is the only place that wording lives, so the chip and the prompt can
 * never disagree about what was attached.
 *
 * The Worker has no document-extraction step, so this does NOT claim the model
 * read the file's contents. It says which file was referenced, which is true.
 */
import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { humanSize } from "@/lib/format";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, FileIcon, PaperclipIcon, XIcon } from "lucide-react";

export interface DriveFile {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType: string | null;
  size: number | null;
}

/**
 * The context line prepended to a prompt that carries attachments.
 *
 * @param files Attached drive files.
 * @returns A sentence naming them, or "" when nothing is attached.
 */
export function describeAttachments(files: DriveFile[]): string {
  if (files.length === 0) return "";
  const list = files
    .map((file) => `${file.name} (${file.mimeType ?? "unknown type"}, ${humanSize(file.size)})`)
    .join("; ");
  return `Files referenced from the workspace drive: ${list}.`;
}

export interface AttachmentPickerProps {
  attached: DriveFile[];
  onAttach: (file: DriveFile) => void;
  onDetach: (id: string) => void;
}

/**
 * The paperclip button: searches the drive and attaches a real file.
 *
 * @param props Currently attached files and the attach/detach handlers.
 * @returns A popover trigger holding a live search over `/api/files`.
 */
export function AttachmentPicker({ attached, onAttach, onDetach }: AttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void apiGet<{ data: DriveFile[] }>("files", query ? { q: query } : undefined)
        .then((res) => {
          if (cancelled) return;
          setResults(res.data.filter((entry) => entry.kind === "file").slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Attach a file from the drive" />}
      >
        <PaperclipIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input
          autoFocus
          value={query}
          aria-label="Search the drive"
          placeholder="Search files…"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8"
        />
        <div className="mt-2 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-xs">
              <Spinner className="size-3" />
              Searching the drive
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">
              No files matched. Upload one on the Files page first.
            </p>
          ) : (
            results.map((file) => {
              // An attached row TOGGLES rather than sitting disabled: a dead
              // row with no explanation is a dead end, and the only other way
              // to detach is the chip, which is not visible from in here.
              const isAttached = attached.some((entry) => entry.id === file.id);
              return (
                <Button
                  key={file.id}
                  variant="ghost"
                  aria-pressed={isAttached}
                  aria-label={isAttached ? `Detach ${file.name}` : `Attach ${file.name}`}
                  onClick={() => {
                    if (isAttached) {
                      onDetach(file.id);
                      return;
                    }
                    onAttach(file);
                    setOpen(false);
                  }}
                  className="[&_svg]:text-muted-foreground h-8 w-full justify-start gap-2 px-2 font-normal [&_svg]:size-3.5"
                >
                  {isAttached ? <CheckIcon aria-hidden="true" /> : <FileIcon aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate text-start">{file.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {humanSize(file.size)}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Chips for the files already attached to the draft prompt.
 *
 * @param props The attached files and a detach handler.
 * @returns A chip group, or null when nothing is attached.
 */
export function AttachmentChips({
  files,
  onDetach,
}: {
  files: DriveFile[];
  onDetach: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <AttachmentGroup aria-label="Attached files">
      {files.map((file) => (
        <Attachment key={file.id} size="xs" className="max-w-56">
          <span aria-hidden="true" className="text-muted-foreground shrink-0 [&>svg]:size-3.5">
            <FileIcon aria-hidden="true" />
          </span>
          <AttachmentContent>
            <AttachmentTitle>{file.name}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={`Remove ${file.name}`}
              onClick={() => onDetach(file.id)}
            >
              <XIcon aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}
