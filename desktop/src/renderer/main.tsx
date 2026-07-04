import { IconContext } from "@phosphor-icons/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
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

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <IconContext value={iconContextValue}>
      <App />
    </IconContext>
  </StrictMode>,
);
