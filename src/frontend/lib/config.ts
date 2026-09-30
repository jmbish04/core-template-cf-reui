/**
 * @fileoverview Site identity + the app-shell navigation (ReUI app-shell-2).
 *
 * Single source of truth for the sidebar rail, the ⌘K search palette and the
 * page header title. Nav is at most two levels — a third level is a page, not
 * a nav item. The API & docs links are the shell contract and always render at
 * the foot of the rail.
 *
 * Adding a page = adding an entry here. Nothing else reads the route table.
 */
import {
  BellIcon,
  BookOpenIcon,
  BotIcon,
  BracesIcon,
  ChartColumnIcon,
  FilesIcon,
  FlaskConicalIcon,
  FolderKanbanIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SettingsIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

export type NavChild = { href: string; label: string; description?: string };

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second level. The parent href is the section landing page. */
  children?: NavChild[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const siteConfig = {
  name: "Cloudflare Edge Showcase",
  shortName: "Edge Showcase",
  description:
    "Cloudflare Worker template: Astro + React on ReUI Pro blocks, D1 via Hono, AI chat through the core-guardian service binding",
  url: "https://example.com",
  links: { github: "https://github.com/jmbish04/core-template-cfw-assets-astro-shadcn" },
};

/**
 * The twelve AI chat surfaces, each a real ReUI Pro `ai-chat-*` block wired to
 * core-guardian and the D1 thread store. Exported on its own because the
 * `/chat` gallery page renders the same list as cards.
 */
export const chatSurfaces: Array<NavChild & { block: string }> = [
  { href: "/chat/copilot", label: "Copilot", block: "ai-chat-1", description: "Streaming transcript with a recent-chats rail." },
  { href: "/chat/docked", label: "Docked draft", block: "ai-chat-2", description: "Assistant beside a live PlateJS document; insert replies into the draft." },
  { href: "/chat/welcome", label: "Welcome", block: "ai-chat-3", description: "Zero state with prompt starters and a docked composer." },
  { href: "/chat/sidebar", label: "Quoted reply", block: "ai-chat-4", description: "Floating panel that answers a sentence you select." },
  { href: "/chat/sources", label: "Scoped sources", block: "ai-chat-5", description: "Connected workspace data sets the answer scope." },
  { href: "/chat/agentic", label: "Agentic run", block: "ai-chat-6", description: "An editable plan the assistant executes step by step." },
  { href: "/chat/compare", label: "Compare", block: "ai-chat-7", description: "One prompt against two routing profiles, side by side." },
  { href: "/chat/voice", label: "Voice", block: "ai-chat-8", description: "Speak the question; the answer picks its own shape." },
  { href: "/chat/branching", label: "Branching", block: "ai-chat-9", description: "Regenerate forks the turn instead of overwriting it." },
  { href: "/chat/scoped", label: "Structured", block: "ai-chat-10", description: "Source-grounded replies as tables, code and comparisons." },
  { href: "/chat/stage", label: "Stage", block: "ai-chat-11", description: "Framed answer receipts carrying model, latency and cost." },
  { href: "/chat/support", label: "Docs support", block: "ai-chat-12", description: "Answers only from the knowledge base, showing what it read." },
];

export const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: HouseIcon },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
      { href: "/analytics", label: "Analytics", icon: ChartColumnIcon },
      {
        href: "/projects",
        label: "Projects",
        icon: FolderKanbanIcon,
        children: [
          { href: "/projects", label: "All projects" },
          { href: "/projects/new", label: "New project" },
        ],
      },
      {
        href: "/tasks",
        label: "Tasks",
        icon: ListChecksIcon,
        children: [
          { href: "/tasks", label: "Tree grid" },
          { href: "/tasks/board", label: "Board" },
        ],
      },
      { href: "/files", label: "Files", icon: FilesIcon },
      { href: "/notes", label: "Notes", icon: NotebookPenIcon },
      { href: "/inbox", label: "Inbox", icon: InboxIcon },
    ],
  },
  {
    label: "AI",
    items: [
      {
        href: "/chat",
        label: "Chat",
        icon: BotIcon,
        children: [{ href: "/chat", label: "All surfaces" }, ...chatSurfaces.map(({ href, label }) => ({ href, label }))],
      },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/activity", label: "Activity", icon: HistoryIcon },
      { href: "/notifications", label: "Notifications", icon: BellIcon },
      {
        href: "/settings",
        label: "Settings",
        icon: SettingsIcon,
        children: [
          { href: "/settings/preferences", label: "Preferences" },
          { href: "/settings/notifications", label: "Notifications" },
          { href: "/settings/webhooks", label: "Webhooks" },
          { href: "/settings/advanced", label: "Advanced" },
        ],
      },
      { href: "/showcase/utilities", label: "Data utilities", icon: FlaskConicalIcon },
      { href: "/playbook", label: "Playbook", icon: WrenchIcon },
    ],
  },
];

/** Shell contract: always at the foot of the rail, never behind a footer. */
export const devLinks: NavItem[] = [
  { href: "/docs", label: "Docs", icon: BookOpenIcon },
  { href: "/openapi.json", label: "openapi.json", icon: BracesIcon },
  { href: "/scalar", label: "Scalar", icon: BracesIcon },
  { href: "/swagger", label: "Swagger", icon: BracesIcon },
];

const clean = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

/** Exact match, or a section prefix match ("/tasks/abc" lights "/tasks"). "/" is exact only. */
export function isActiveHref(path: string, href: string): boolean {
  const p = clean(path);
  if (href === "/") return p === "/";
  return p === href || p.startsWith(`${href}/`);
}

/**
 * Most specific nav entry for a path — used for the header title.
 * Returns the owning group, section item and (when matched) child.
 */
export function findNavTrail(path: string): { group?: string; item?: NavItem; child?: NavChild } {
  let best: { group?: string; item?: NavItem; child?: NavChild; len: number } = { len: -1 };
  for (const g of navGroups) {
    for (const item of g.items) {
      for (const c of item.children ?? []) {
        if (isActiveHref(path, c.href) && c.href.length > best.len) {
          best = { group: g.label, item, child: c, len: c.href.length };
        }
      }
      if (isActiveHref(path, item.href) && item.href.length > best.len) {
        best = { group: g.label, item, len: item.href.length };
      }
    }
  }
  return best;
}

/** Every navigable entry, flattened — the ⌘K palette's corpus. */
export function allNavEntries(): Array<{ href: string; label: string; section?: string }> {
  const out: Array<{ href: string; label: string; section?: string }> = [];
  for (const g of navGroups) {
    for (const item of g.items) {
      out.push({ href: item.href, label: item.label, section: g.label });
      for (const c of item.children ?? []) {
        if (c.href !== item.href) out.push({ href: c.href, label: c.label, section: item.label });
      }
    }
  }
  for (const d of devLinks) out.push({ href: d.href, label: d.label, section: "Developer" });
  return out;
}
