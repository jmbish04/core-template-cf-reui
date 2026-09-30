/**
 * @fileoverview The brief: what the agent may read before it plans anything.
 *
 * The stock block asks a three-question brief with invented answers. This asks
 * the one question that changes the run: which of the workspace's own
 * collections, and which real drive files, go into the plan and every step
 * prompt. Both controls are the shared, already-wired ones — the source strip
 * from `/chat/sources` and the drive `AttachmentPicker`.
 */
import { AttachmentChips, AttachmentPicker, type DriveFile } from "@/components/chat";
import { SourceStrip } from "@/components/chat/source-strip";
import type { LoadedSource, SourceId } from "@/components/chat/workspace-sources";

export interface ScopeCardProps {
  loaded: LoadedSource[];
  onToggle: (id: SourceId, on: boolean) => void;
  files: DriveFile[];
  onAttach: (file: DriveFile) => void;
  onDetach: (id: string) => void;
  /** Locked once a plan exists: changing the scope mid-run would leave the
      transcript describing work done against a different brief. */
  locked: boolean;
}

/**
 * Render the readable scope for the run.
 *
 * @param props The scope state plus the file attach/detach handlers.
 * @returns The brief card.
 */
export function ScopeCard({ loaded, onToggle, files, onAttach, onDetach, locked }: ScopeCardProps) {
  return (
    <section aria-label="What the agent may read" className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-medium">What the agent may read</h2>

      <div className={locked ? "pointer-events-none opacity-60" : undefined} aria-disabled={locked || undefined}>
        <SourceStrip loaded={loaded} onToggle={onToggle} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!locked && <AttachmentPicker attached={files} onAttach={onAttach} onDetach={onDetach} />}
        {files.length === 0 ? (
          <p className="text-muted-foreground text-xs">No drive files attached.</p>
        ) : (
          <AttachmentChips files={files} onDetach={onDetach} />
        )}
      </div>
    </section>
  );
}
