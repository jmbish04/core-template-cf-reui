/**
 * @fileoverview Frontend re-export of the isomorphic device-surface core.
 *
 * The logic lives in `@/shared/device` because the Worker needs it too. Import
 * from here in frontend code so the surface boundary stays visible, exactly as
 * `@/lib/data` re-exports `@/shared/data-utils`.
 */
export * from "@/shared/device";
