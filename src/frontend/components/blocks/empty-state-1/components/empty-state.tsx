import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { LearnMoreGuides } from "./learn-more-guides"
import { RecordsEmptyIllustration } from "./records-empty-illustration"
import { PlugZapIcon, UploadIcon } from "lucide-react"

export function EmptyState() {
  return (
    <div className="flex min-h-[820px] w-full max-w-3xl flex-col items-center justify-center gap-24 py-8 sm:gap-32 md:py-12">
      {/* Empty State */}
      <Empty className="flex-none gap-7 rounded-none border-0 p-0 md:p-0">
        <EmptyHeader className="max-w-[27rem] gap-4">
          <EmptyMedia className="mb-0">
            <RecordsEmptyIllustration />
          </EmptyMedia>

          <div className="flex flex-col items-center gap-2">
            <EmptyTitle className="text-2xl font-semibold tracking-tight">
              Your record space is empty
            </EmptyTitle>
            <EmptyDescription className="max-w-[24rem] text-sm/relaxed">
              Connect a live source or upload a CSV to start organizing people,
              teams, and attributes in one place.
            </EmptyDescription>
          </div>
        </EmptyHeader>

        <EmptyContent className="max-w-none gap-0">
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <Button type="button">
              <PlugZapIcon data-icon="inline-start" aria-hidden="true" />
              Connect source
            </Button>

            <Button type="button" variant="outline">
              <UploadIcon data-icon="inline-start" aria-hidden="true" />
              Upload CSV
            </Button>
          </div>
        </EmptyContent>
      </Empty>

      <div className="w-full max-w-md space-y-3 sm:max-w-[34rem]">
        <p className="text-muted-foreground text-sm">Quick guides</p>
        <LearnMoreGuides />
      </div>
    </div>
  )
}