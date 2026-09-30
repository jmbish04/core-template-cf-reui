/**
 * @fileoverview `/` — the Overview landing island.
 *
 * Three things: what this template is, the live metric row from
 * `GET /api/dashboard/stats`, and a link grid to every app area.
 *
 * The link grid is rendered from `navGroups` / `chatSurfaces` / `devLinks` in
 * `@/lib/config`, which is the single source of truth for the route table —
 * there is deliberately no second copy of the routes here, so adding a nav
 * entry adds a card.
 */

import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { IconTile } from "@/components/reui/icon-tile";
import { FrameGrid } from "@/components/dashboard/frame-grid";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { MetricRow } from "@/components/dashboard/metric-row";
import { useDashboardStats } from "@/components/dashboard/use-dashboard";
import { chatSurfaces, devLinks, navGroups, siteConfig, type NavItem } from "@/lib/config";

/**
 * One line of supporting copy for a nav item.
 *
 * Only derived facts are used: a section's own child count, or the number of
 * chat surfaces. Nothing here is invented marketing text about a page.
 *
 * @param item The nav entry being described.
 * @returns A short caption, or undefined when there is nothing true to say.
 */
function caption(item: NavItem): string | undefined {
  if (item.href === "/chat") return `${chatSurfaces.length} chat surfaces`;
  const children = item.children?.filter((c) => c.href !== item.href) ?? [];
  if (children.length > 0) return children.map((c) => c.label).join(" · ");
  return undefined;
}

/** A single linked card in the area grid. */
function AreaCard({ item }: { item: NavItem }) {
  const text = caption(item);
  return (
    <FramePanel className="hover:bg-muted/40 transition-colors">
      <Item render={<a href={item.href} />} className="p-0">
        <ItemMedia>
          <IconTile variant="soft">
            <item.icon aria-hidden="true" />
          </IconTile>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{item.label}</ItemTitle>
          {text ? <ItemDescription className="truncate">{text}</ItemDescription> : null}
        </ItemContent>
      </Item>
    </FramePanel>
  );
}

/** The `/` island: one screen, one surface (`frame`). */
export function OverviewView() {
  const stats = useDashboardStats();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0 pb-2">
            <FrameTitle className="text-base">{siteConfig.name}</FrameTitle>
          </FrameHeader>
          <p className="text-muted-foreground max-w-3xl text-sm leading-6">
            {siteConfig.description}. Every page below is a React island inside the ReUI app shell,
            reading real rows from D1 through the Hono API — there is no mock data anywhere in the
            template.
          </p>
        </FramePanel>
      </Frame>

      <MetricRow
        stats={stats.data}
        loading={stats.loading}
        error={stats.error}
        onRetry={stats.reload}
      />

      {navGroups.map((group) => {
        const items = group.items.filter((item) => item.href !== "/");
        if (items.length === 0) return null;
        return (
          <section key={group.label} className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {group.label}
            </h2>
            <FrameGrid cols="sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <AreaCard key={item.href} item={item} />
              ))}
            </FrameGrid>
          </section>
        );
      })}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          API &amp; docs
        </h2>
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0 pb-2">
              <FrameDescription>
                The OpenAPI 3.1 document and both readers are served by the Worker itself.
              </FrameDescription>
            </FrameHeader>
            <div className="flex flex-wrap gap-2">
              {devLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="border-border bg-background hover:bg-muted text-foreground inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
                >
                  <link.icon className="size-4" aria-hidden="true" />
                  {link.label}
                </a>
              ))}
            </div>
          </FramePanel>
        </Frame>
      </section>
    </div>
  );
}
