/**
 * @fileoverview SettingsNav — the section rail shared by every `/settings/*`
 * page, rendered by `layouts/SettingsLayout.astro`.
 *
 * RESPONSIVE STRATEGY
 * desktop (>= md): a vertical side-tab rail, one row per section.
 * mobile (< md): the same four entries become a horizontal scroll rail of line
 * tabs, so the page itself never scrolls sideways.
 *
 * Pure markup — no state, no hydration. The active section is decided
 * server-side from `Astro.url.pathname`, which is why the layout renders this
 * without a client directive.
 */
import { cn } from "@/lib/utils";

/** The four settings sections, in rail order. */
export const SETTINGS_SECTIONS = [
  { href: "/settings/preferences", label: "Preferences", description: "Appearance, locale and accessibility." },
  { href: "/settings/notifications", label: "Notifications", description: "Which channels get which events." },
  { href: "/settings/webhooks", label: "Webhooks", description: "Outbound delivery endpoints." },
  { href: "/settings/advanced", label: "Advanced", description: "Maintenance and destructive actions." },
] as const;

/**
 * Render the settings section rail.
 *
 * @param active - Current pathname with any trailing slash already removed.
 * @returns The rail as a `<nav>`; vertical on desktop, a scroll rail below `md`.
 */
export function SettingsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Settings sections" className="min-w-0">
      {/* Below md the rail scrolls horizontally; the negative inline margin lets
          the first/last tab sit flush with the page gutter while still scrolling. */}
      <ul className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
        {SETTINGS_SECTIONS.map((section) => {
          const current = active === section.href;
          return (
            <li key={section.href} className="min-w-0 shrink-0 snap-start md:w-full">
              <a
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  // Mobile: a line tab, underlined when current.
                  "border-b-2 border-transparent md:border-b-0",
                  current
                    ? "border-primary text-foreground md:bg-muted md:font-medium"
                    : "text-muted-foreground hover:text-foreground md:hover:bg-muted/50",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
