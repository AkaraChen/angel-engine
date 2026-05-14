import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./i18n";
import "./index.css";
import { applyDesktopPlatform, syncDesktopColorScheme } from "./platform/theme";

applyDesktopPlatform();
const stopDesktopColorSchemeSync = syncDesktopColorScheme();

if (import.meta.hot) {
  import.meta.hot.dispose(stopDesktopColorSchemeSync);
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
