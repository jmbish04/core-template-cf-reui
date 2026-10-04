/**
 * @fileoverview The developer-links rail at the foot of the sidebar.
 *
 * Shell contract from the design system: `/docs`, `/openapi.json`, `/scalar`
 * and `/swagger` are always reachable from the rail, never hidden behind a
 * footer. The spec links leave the SPA, so they are plain anchors.
 *
 * The repository link is appended from the deploy-set `GITHUB_REPO` var rather
 * than the static route table, because it is the one entry that differs per
 * Worker. When there is no remote the var is "" and the link is OMITTED — a
 * template that shipped its own repo link would send every fork's operator to
 * the wrong repository.
 */
import { GitBranchIcon } from "lucide-react";

import { devLinks, isActiveHref } from "@/lib/config";
import type { WorkerIdentity } from "@/shared/worker-identity";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({ path, identity }: { path: string; identity: WorkerIdentity }) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {devLinks.map((item) => {
          const Icon = item.icon;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                size="sm"
                tooltip={item.label}
                isActive={isActiveHref(path, item.href)}
                render={<a href={item.href} />}
                className="h-8! in-data-[state=collapsed]:h-8! [&_svg]:size-3.5"
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}

        {identity.repoSlug ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              tooltip={identity.repoSlug}
              render={<a href={identity.repoUrl} target="_blank" rel="noreferrer noopener" />}
              className="h-8! in-data-[state=collapsed]:h-8! [&_svg]:size-3.5"
            >
              <GitBranchIcon aria-hidden="true" />
              <span className="truncate">{identity.repoSlug}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
      </SidebarMenu>
    </SidebarGroup>
  );
}
