/**
 * @fileoverview The app shell's page header.
 *
 * Adapted from ReUI block `app-shell-2`. The stock block's workspace
 * breadcrumb (Workspace → @user → Page, with avatar chips) is removed: it was
 * a decorative tenant trail this single-tenant template has nothing to put in.
 * What is left is the mobile sidebar trigger, the current page's title derived
 * from the route table, and the real actions — notifications and the theme
 * toggle.
 */
import { findNavTrail } from "@/lib/config";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

import { NotificationsMenu } from "./notifications-menu";

export function AppHeader({ path }: { path: string }) {
  const trail = findNavTrail(path);
  const title = trail.child?.label ?? trail.item?.label ?? "";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 pt-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 pl-2">
        <SidebarTrigger className="-ml-1 flex opacity-60 hover:opacity-100 md:hidden" />
        <span className="truncate text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-1 pr-4">
        <NotificationsMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
