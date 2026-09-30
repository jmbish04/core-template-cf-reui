import { cn } from "@/lib/utils"

export function RecordsEmptyIllustration({
  variant = "hero",
}: {
  variant?: "hero" | "compact"
}) {
  const isCompact = variant === "compact"

  return (
    <div
      aria-hidden="true"
      className={cn("relative isolate", isCompact ? "h-9 w-16" : "h-24 w-52")}
    >
      <div
        className={cn(
          "bg-muted/60 border-border/50 dark:bg-muted/30 absolute rounded-t-lg border",
          isCompact ? "inset-x-2 top-0 h-2.5" : "inset-x-6 top-0 h-6"
        )}
      />

      <div
        className={cn(
          "bg-muted/80 border-border/60 dark:bg-muted/50 absolute rounded-t-lg border",
          isCompact ? "inset-x-1 top-1.5 h-2.5" : "inset-x-3 top-3 h-6"
        )}
      />

      <div
        className={cn(
          "bg-background border-border absolute flex items-center rounded-lg border shadow-sm",
          isCompact
            ? "inset-x-0 top-3 gap-1 px-2 py-1.5"
            : "inset-x-0 top-6 h-16 gap-3 px-4"
        )}
      >
        <div
          className={cn(
            "bg-muted shrink-0 rounded",
            isCompact ? "size-3" : "size-8"
          )}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "bg-muted rounded",
              isCompact ? "h-1.5 w-8" : "h-2.5 w-3/4"
            )}
          />
          <div
            className={cn(
              "bg-muted/60 rounded",
              isCompact ? "h-1 w-5" : "h-2 w-1/2"
            )}
          />
        </div>
      </div>

      {!isCompact ? (
        <div className="from-background/0 via-background/60 to-background pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b" />
      ) : null}
    </div>
  )
}