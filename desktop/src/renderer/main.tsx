import { IconContext } from "@phosphor-icons/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App, SettingsApp } from "./App";
import { applyDesktopPlatform, syncDesktopColorScheme } from "./platform/theme";
import "./i18n";
import "./index.css";

applyDesktopPlatform();
const stopDesktopColorSchemeSync = syncDesktopColorScheme();

if (import.meta.hot) {
  import.meta.hot.dispose(stopDesktopColorSchemeSync);
}

if (import.meta.env.DEV) {
  void import("react-grab");
}

const iconContextValue = { weight: "regular" } as const;

// The settings window is its own page: it is loaded with the `/settings` hash
// (see main/windows/settings-window.ts) and never mounts the main app router.
const isSettingsWindow = window.location.hash
  .replace(/^#/, "")
  .startsWith("/settings");

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <IconContext value={iconContextValue}>
      {isSettingsWindow ? <SettingsApp /> : <App />}
    </IconContext>
  </StrictMode>,
);
