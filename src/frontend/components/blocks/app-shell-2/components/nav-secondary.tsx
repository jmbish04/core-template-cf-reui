/**
 * @fileoverview The developer-links rail at the foot of the sidebar.
 *
 * Shell contract from the design system: `/docs`, `/openapi.json`, `/scalar`
 * and `/swagger` are always reachable from the rail, never hidden behind a
 * footer. The spec links leave the SPA, so they are plain anchors.
 */
import { devLinks, isActiveHref } from "@/lib/config";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({ path }: { path: string }) {
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
      </SidebarMenu>
    </SidebarGroup>
  );
}
