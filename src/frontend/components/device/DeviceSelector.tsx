/**
 * @fileoverview The app shell's mobile / tablet / desktop selector.
 *
 * The surface is resolved server-side from the User-Agent, so this starts on
 * whatever the request already rendered. Clicking writes the `device_surface`
 * cookie and reloads, because the choice has to be made on the SERVER — the
 * other two variants were never sent and cannot be swapped in on the client.
 *
 * The cookie lasts 400 days, the ceiling a browser will honour, so the choice
 * outlives the session exactly as the operator expects.
 */
import { MonitorIcon, RotateCcwIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_SURFACES,
  type DeviceSurface,
  type ResolvedDevice,
} from "@/lib/device";

const ICONS: Record<DeviceSurface, typeof MonitorIcon> = {
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
  desktop: MonitorIcon,
};

const LABELS: Record<DeviceSurface, string> = {
  mobile: "Mobile layout",
  tablet: "Tablet layout (Tesla)",
  desktop: "Desktop layout",
};

/**
 * Write the choice and reload so the server re-renders the right variant.
 *
 * @param surface The surface to switch to, or null to clear the override and
 *   fall back to User-Agent detection.
 */
function choose(surface: DeviceSurface | null): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    surface === null
      ? `${DEVICE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${DEVICE_COOKIE}=${surface}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  location.reload();
}

export function DeviceSelector({ device }: { device: ResolvedDevice }) {
  const [pending, setPending] = React.useState<DeviceSurface | null>(null);

  const pick = (surface: DeviceSurface) => {
    if (surface === device.surface) return;
    setPending(surface);
    choose(surface);
  };

  return (
    <div className="flex items-center" role="group" aria-label="Layout">
      {DEVICE_SURFACES.map((surface) => {
        const Icon = ICONS[surface];
        const active = surface === device.surface;
        return (
          <Tooltip key={surface}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={active}
                  disabled={pending !== null}
                  onClick={() => pick(surface)}
                  aria-label={LABELS[surface]}
                  className={active ? "text-primary" : "opacity-60 hover:opacity-100"}
                />
              }
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              {LABELS[surface]}
              {surface === device.detected ? " — detected" : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/*
        Only shown when the operator has overridden detection. Without it an
        override is invisible and indistinguishable from a detection bug —
        someone on a phone seeing the desktop layout has no way to tell whether
        they chose it months ago or the detector is broken.
      */}
      {device.isOverride ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                disabled={pending !== null}
                onClick={() => {
                  setPending(device.detected);
                  choose(null);
                }}
                aria-label="Clear the layout override"
                className="opacity-60 hover:opacity-100"
              />
            }
          >
            <RotateCcwIcon className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Overriding {device.detected} — click to clear</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
