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

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
