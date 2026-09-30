/**
 * @fileoverview ProjectCard — one project inside the `/projects` frame grid.
 *
 * Built from the ReUI `FramePanel` + `IconTile` + `Badge` grammar and the
 * shadcn `Item` row, so it inherits the page's single `frame` surface rather
 * than introducing a second card surface.
 */

import { FolderKanbanIcon, StarIcon } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { FramePanel } from "@/components/reui/frame";
import { IconTile } from "@/components/reui/icon-tile";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ProjectStatusBadge } from "@/components/common/status-badge";
import type { Project } from "@/components/common";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Render one project as a frame panel.
 *
 * @param project The project row from `GET /api/projects`.
 * @param onToggleStar Called with the project id when the star is pressed.
 * @param starPending True while this project's star request is in flight.
 */
export function ProjectCard({
  project,
  onToggleStar,
  starPending,
}: {
  project: Project;
  onToggleStar: (id: string) => void;
  starPending: boolean;
}) {
  return (
    <FramePanel className="flex min-w-0 flex-col gap-3">
      <Item className="p-0">
        <ItemMedia>
          {/* The tile is tinted with the project's own stored accent colour,
              which is data from the `projects.color` column, not a style
              decision made here. */}
          <IconTile variant="soft" style={{ color: project.color }}>
            <FolderKanbanIcon aria-hidden="true" />
          </IconTile>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="truncate">{project.name}</ItemTitle>
          <ItemDescription className="truncate font-mono text-xs">{project.slug}</ItemDescription>
        </ItemContent>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={project.starred ? `Unstar ${project.name}` : `Star ${project.name}`}
          aria-pressed={project.starred}
          disabled={starPending}
          onClick={() => onToggleStar(project.id)}
        >
          <StarIcon
            className={cn("size-4", project.starred && "fill-warning text-warning")}
            aria-hidden="true"
          />
        </Button>
      </Item>

      <p className="text-muted-foreground line-clamp-2 min-h-[2.5rem] text-sm">
        {project.description || "No description."}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <ProjectStatusBadge status={project.status} />
        <Badge variant="secondary">
          {project.taskCount} {project.taskCount === 1 ? "task" : "tasks"}
        </Badge>
        <span className="text-muted-foreground ms-auto text-xs">
          Updated {relativeTime(project.updatedAt)}
        </span>
      </div>
    </FramePanel>
  );
}
