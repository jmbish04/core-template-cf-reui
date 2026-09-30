/**
 * @fileoverview Barrel for the shared chat layer.
 *
 * Everything the twelve `/chat/*` surfaces have in common lives here: the
 * thread rail, the composer, the transcript (with its reasoning fold and turn
 * receipt), the routing-profile picker, the canvas document, the drive
 * attachment picker, the selection-to-quote pill and the error banner.
 *
 * These exports are a contract — add to them, do not rename them.
 *
 * `workspace-sources` / `use-scope` / `source-strip` live here rather than in
 * a block because two surfaces need them: /chat/sources scopes a question to
 * the six real collections, and /chat/agentic scopes a run to the same ones.
 * One copy of the fetchers means the receipt and the prompt cannot disagree
 * about what was read.
 */

export { AttachmentChips, AttachmentPicker, describeAttachments, type AttachmentPickerProps, type DriveFile } from "./attachment-picker";
export { CanvasDocument, useChatDocument, type CanvasDocumentProps, type UseChatDocument } from "./canvas-document";
export { ChatComposer, type ChatComposerProps } from "./composer";
export { ChatErrorBanner, type ChatErrorBannerProps } from "./errors";
export { ReplyReceipt, RoutedBadge, RoutingPicker, type ReplyReceiptProps, type RoutingPickerProps } from "./routing-picker";
export { QuotedLine, SelectionQuotePill, quotedPrompt, type SelectionQuotePillProps } from "./selection-quote";
export { ThreadList, useThreads, type ThreadListProps, type UseThreads } from "./thread-list";
export {
  COMPARE_PARAMS,
  THREAD_PARAM,
  useThreadSession,
  writeParam,
  writeThreadParam,
  type ThreadSession,
} from "./thread-url";
export { useBelow } from "./use-viewport";
export {
  ReasoningFold,
  Transcript,
  TurnReceipt,
  type ReasoningFoldProps,
  type RenderBody,
  type TranscriptProps,
  type TurnReceiptProps,
} from "./transcript";
export { SourceStrip, type SourceStripProps } from "./source-strip";
export { useScope, type Scope } from "./use-scope";
export {
  SOURCES,
  buildSourceContext,
  describeRead,
  sourceById,
  type LoadedSource,
  type SourceId,
  type SourceReceipt,
  type SourceSummary,
  type WorkspaceSource,
} from "./workspace-sources";
