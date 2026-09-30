import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { BookOpenIcon, ChevronRightIcon, FileTextIcon } from "lucide-react"

export function LearnMoreGuides() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Row */}
      <Item
        variant="outline"
        render={<a href="#" aria-label="How records work" />}
        className="hover:bg-muted/30 min-w-0 transition-colors"
      >
        <ItemMedia className="text-muted-foreground">
          <BookOpenIcon className="size-4" aria-hidden="true" />
        </ItemMedia>

        <ItemContent className="min-w-0">
          <ItemTitle className="truncate">How records work</ItemTitle>
        </ItemContent>

        <ItemActions className="text-muted-foreground ml-auto">
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </ItemActions>
      </Item>

      <Item
        variant="outline"
        render={<a href="#" aria-label="CSV setup" />}
        className="hover:bg-muted/30 min-w-0 transition-colors"
      >
        <ItemMedia className="text-muted-foreground">
          <FileTextIcon className="size-4" aria-hidden="true" />
        </ItemMedia>

        <ItemContent className="min-w-0">
          <ItemTitle className="truncate">CSV setup</ItemTitle>
        </ItemContent>

        <ItemActions className="text-muted-foreground ml-auto">
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </ItemActions>
      </Item>
    </div>
  )
}