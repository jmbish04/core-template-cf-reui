import { MoonIcon, SunIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

/** Dark is the default; only an explicit "light" choice is stored. */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(true);

  React.useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      if (next) localStorage.removeItem("theme");
      else localStorage.setItem("theme", "light");
    } catch {}
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      {dark ? <MoonIcon className="size-4.5" aria-hidden="true" /> : <SunIcon className="size-4.5" aria-hidden="true" />}
    </Button>
  );
}
