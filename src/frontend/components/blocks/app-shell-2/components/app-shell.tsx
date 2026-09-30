/**
 * @fileoverview The app shell — one React island wrapping every page.
 *
 * Adapted from ReUI block `app-shell-2`: the block's placeholder dashboard
 * grid is replaced by a `children` slot (the Astro page renders into it), and
 * the shell takes the request's pathname so nav highlighting and the header
 * title are correct server-side, with no hydration flash.
 *
 * `defaultOpen` comes from the `sidebar_state` cookie read in `BaseLayout`,
 * so a collapsed rail stays collapsed across navigations.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export interface AppShellProps {
  /** The request pathname, e.g. "/tasks/board". */
  activePath: string;
  /** Initial rail state, restored from the `sidebar_state` cookie. */
  defaultOpen?: boolean;
  children?: ReactNode;
}

export function AppShell({ activePath, defaultOpen = true, children }: AppShellProps) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className={cn(
        "[--sidebar-width:260px]",
        "[--sidebar-border:transparent]",
        "[&_[data-slot=sidebar-inner]]:border-border/80 [&_[data-slot=sidebar-inner]]:border",
        "[&_[data-slot=sidebar-inner]]:shadow-xs [&_[data-slot=sidebar-inner]]:shadow-black/5",
        "[&_[data-slot=sidebar-menu-button][data-active]]:border-border/60! [&_[data-slot=sidebar-menu-button][data-active]]:border",
        "[&_[data-slot=sidebar-menu-button][data-active]]:shadow-xs! [&_[data-slot=sidebar-menu-button][data-active]]:shadow-black/5!",
        "[&_[data-slot=sidebar-menu-button][data-active]]:bg-background! [&_[data-slot=sidebar-menu-button][data-active]]:hover:bg-background! **:data-[slot=sidebar-menu-button]:hover:bg-transparent!",
        "[&_[data-slot=sidebar-menu-button][data-active]]:text-foreground [&_[data-slot=sidebar-menu-button][data-active]>svg]:text-primary [&_[data-slot=sidebar-menu-button][data-active]>svg]:opacity-100",
        "**:data-[slot=sidebar-menu-button]:text-accent-foreground/80 **:data-[slot=sidebar-menu-button]:hover:text-foreground",
        "[&_[data-collapsible=icon]_[data-slot=sidebar-menu-button][data-active]>svg]:-ml-px",
        "[&_[data-slot=sidebar-menu-button]:hover>svg]:opacity-100 [&_[data-slot=sidebar-menu-button]>svg]:opacity-60",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:border-border/60! [&_[data-slot=sidebar-menu-sub-button][data-active]]:border",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:shadow-xs! [&_[data-slot=sidebar-menu-sub-button][data-active]]:shadow-black/5!",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:bg-background! [&_[data-slot=sidebar-menu-sub-button][data-active]]:hover:bg-background! **:data-[slot=sidebar-menu-sub-button]:hover:bg-transparent!",
        "[&_[data-slot=sidebar-menu-sub-button][data-active]]:text-foreground [&_[data-slot=sidebar-menu-sub-button][data-active]>svg]:text-primary [&_[data-slot=sidebar-menu-sub-button][data-active]>svg]:opacity-100",
        "**:data-[slot=sidebar-menu-sub-button]:text-accent-foreground/80 **:data-[slot=sidebar-menu-sub-button]:hover:text-foreground",
        "[&_[data-slot=sidebar-menu-sub-button]:hover>svg]:opacity-100 [&_[data-slot=sidebar-menu-sub-button]>svg]:opacity-60",
      )}
    >
      <AppSidebar path={activePath} />
      <SidebarInset className="min-w-0">
        <AppHeader path={activePath} />
        <div className="flex min-w-0 flex-1 flex-col py-2 pr-4 pl-2">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
