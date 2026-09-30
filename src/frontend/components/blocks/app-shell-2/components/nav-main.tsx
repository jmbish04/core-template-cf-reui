/**
 * @fileoverview Primary sidebar navigation for the app shell.
 *
 * Adapted from ReUI block `app-shell-2`: the demo's static `NAV_MAIN` array is
 * replaced by the real route table in `lib/config.ts`, and every button is a
 * real anchor. Active state is derived from the page's pathname (passed down
 * from the Astro layout), so the rail is correct on first paint with no
 * hydration flash.
 *
 * Two levels only. A collapsed (icon) rail opens a section's children in a
 * side dropdown instead of pushing the rail open, which is the block's own
 * behaviour — kept deliberately.
 */
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { isActiveHref, navGroups, type NavChild, type NavItem } from "@/lib/config";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

function NavSubMenu({ id, children, path }: { id: string; children: NavChild[]; path: string }) {
  return (
    <SidebarMenuSub id={`subnav-${id}`}>
      {children.map((child) => (
        <SidebarMenuSubItem key={child.href}>
          <SidebarMenuSubButton
            render={<a href={child.href} />}
            isActive={isActiveHref(path, child.href)}
          >
            <span>{child.label}</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

/**
 * Collapsed (icon) rail: an inline submenu would push the next item down, so
 * the children open in a side dropdown anchored to the icon button instead.
 */
function CollapsedNavItem({ item, path }: { item: NavItem & { children: NavChild[] }; path: string }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              tooltip={item.label}
              isActive={isActiveHref(path, item.href)}
              aria-label={item.label}
            />
          }
        >
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
            {item.children.map((child) => (
              <DropdownMenuItem key={child.href} render={<a href={child.href} />}>
                {child.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/** Expanded rail: the submenu expands inline under its parent button. */
function ExpandedNavItem({
  item,
  path,
  open,
  onToggle,
}: {
  item: NavItem & { children: NavChild[] };
  path: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.label}
        isActive={isActiveHref(path, item.href)}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`subnav-${item.href}`}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto size-4 shrink-0 opacity-60 transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      </SidebarMenuButton>
      {open && <NavSubMenu id={item.href} children={item.children} path={path} />}
    </SidebarMenuItem>
  );
}

function CollapsibleNavItem({ item, path }: { item: NavItem & { children: NavChild[] }; path: string }) {
  const { state } = useSidebar();
  // Kept on the always-mounted parent so the expanded open state survives a
  // collapse/expand cycle instead of resetting when the branch swaps.
  const [open, setOpen] = useState(() => isActiveHref(path, item.href));

  return state === "collapsed" ? (
    <CollapsedNavItem item={item} path={path} />
  ) : (
    <ExpandedNavItem item={item} path={path} open={open} onToggle={() => setOpen((prev) => !prev)} />
  );
}

function LeafNavItem({ item, path }: { item: NavItem; path: string }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.label}
        isActive={isActiveHref(path, item.href)}
        render={<a href={item.href} />}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NavMain({ path }: { path: string }) {
  return (
    <>
      {navGroups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="in-data-[state=collapsed]:hidden">{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) =>
                item.children ? (
                  <CollapsibleNavItem
                    key={item.href}
                    item={item as NavItem & { children: NavChild[] }}
                    path={path}
                  />
                ) : (
                  <LeafNavItem key={item.href} item={item} path={path} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
