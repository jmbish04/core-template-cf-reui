/**
 * @fileoverview The app shell's sidebar rail.
 *
 * Adapted from ReUI block `app-shell-2`. Two deliberate removals from the
 * stock block: the workspace switcher that sat in the footer (this template is
 * single-tenant, so a tenant picker would be a control that does nothing), and
 * the `SidebarFooter` it lived in. Everything below the nav is now the
 * developer-links rail.
 */
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar";

import { siteConfig } from "@/lib/config";

import { Logo } from "./logo";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { SearchForm } from "./search-form";

export function AppSidebar({ path }: { path: string }) {
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="flex flex-row items-center justify-between in-data-[state=collapsed]:flex-col in-data-[state=collapsed]:items-start in-data-[state=collapsed]:justify-center">
        <a
          href="/"
          className="inline-flex min-h-10 items-center gap-2 px-0.5 transition-all duration-200 ease-linear"
        >
          <Logo />
          <span className="text-sm font-medium in-data-[state=collapsed]:hidden">
            {siteConfig.shortName}
          </span>
        </a>

        <SidebarTrigger className="opacity-60 hover:opacity-100 [&_svg]:transition-transform [&_svg]:duration-200 in-data-[state=collapsed]:[&_svg]:rotate-180" />
      </SidebarHeader>

      <SidebarContent>
        <div className="py-2 pt-2">
          <SearchForm />
        </div>

        <NavMain path={path} />

        <div className="mt-auto">
          <NavSecondary path={path} />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
