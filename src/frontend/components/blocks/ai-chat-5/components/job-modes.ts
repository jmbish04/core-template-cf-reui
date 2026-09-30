/**
 * @fileoverview The four jobs `/chat/sources` does, and how each one rewrites
 * the question.
 *
 * The stock block's modes swap a placeholder and a canned answer. These do the
 * one thing a mode can honestly do without a backend of its own: they rewrite
 * the outgoing prompt, so the model is genuinely asked for a digest rather
 * than a draft. What comes back is whatever the router produced.
 */
import { FileTextIcon, ListChecksIcon, SearchIcon, SparklesIcon, type LucideIcon } from "lucide-react";

export type ModeId = "digest" | "draft" | "audit" | "ask";

export interface JobMode {
  id: ModeId;
  label: string;
  icon: LucideIcon;
  /** Shown in the empty composer, so a mode arrives with a real question. */
  placeholder: string;
  /** Prepended to the message actually sent. "" leaves the question alone. */
  instruction: string;
}

export const MODES: JobMode[] = [
  {
    id: "ask",
    label: "Ask",
    icon: SparklesIcon,
    placeholder: "Ask anything about the sources below…",
    instruction: "",
  },
  {
    id: "digest",
    label: "Digest",
    icon: ListChecksIcon,
    placeholder: "Catch me up on what changed…",
    instruction:
      "Summarise the workspace data as a short bulleted digest. Lead with what changed or needs attention.",
  },
  {
    id: "draft",
    label: "Draft",
    icon: FileTextIcon,
    placeholder: "Draft an update from what you can read…",
    instruction:
      "Write a short draft document from the workspace data. Use headings and prose, not bullet fragments.",
  },
  {
    id: "audit",
    label: "Audit",
    icon: SearchIcon,
    placeholder: "Find the gaps and risks…",
    instruction:
      "Audit the workspace data. Name what is missing, stale, unassigned or contradictory, and cite the rows you based each finding on.",
  },
];

/**
 * The message actually sent for a mode.
 *
 * @param mode The chosen job mode.
 * @param text What the reader typed.
 * @returns The rewritten prompt, or the text unchanged for plain Ask.
 */
export function modePrompt(mode: JobMode, text: string): string {
  return mode.instruction ? `${mode.instruction}\n\n${text}` : text;
}
