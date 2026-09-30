/**
 * @fileoverview The rename / new-folder dialog and the delete confirmation from
 * ReUI block `solution-files-1`.
 */
import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export type NamePrompt =
  | { mode: "create"; parentId: string; parentLabel: string }
  | { mode: "rename"; targetId: string; currentName: string }

export function NameDialog({
  prompt,
  onSubmit,
  onOpenChange,
}: {
  prompt: NamePrompt | null
  onSubmit: (name: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const seed = prompt?.mode === "rename" ? prompt.currentName : ""
  const [name, setName] = useState(seed)

  // Re-seed whenever a different target opens the dialog.
  useEffect(() => setName(seed), [seed, prompt])

  const trimmed = name.trim()
  const isRename = prompt?.mode === "rename"

  function submit() {
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={prompt !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRename ? "Rename" : "New Folder"}</DialogTitle>
          <DialogDescription>
            {prompt?.mode === "create"
              ? `Creates a folder inside ${prompt.parentLabel}.`
              : "Choose a new name for this item."}
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="drive-name">Name</FieldLabel>
          <Input
            id="drive-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
            placeholder="Untitled folder"
            autoComplete="off"
          />
        </Field>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!trimmed} onClick={submit}>
            {isRename ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDialog({
  targetLabel,
  detail,
  open,
  onConfirm,
  onOpenChange,
}: {
  targetLabel: string
  /** What exactly goes, e.g. "3 entries, including everything inside them". */
  detail?: string
  open: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* There is no trash: DELETE /api/files/{id} cascades through D1 and
              removes the R2 objects. Say that, rather than promising 30 days. */}
          <AlertDialogTitle>Delete Permanently</AlertDialogTitle>
          <AlertDialogDescription>
            {targetLabel} and everything inside it is deleted immediately, in
            D1 and in R2. This cannot be undone.
            {detail ? ` ${detail}` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}