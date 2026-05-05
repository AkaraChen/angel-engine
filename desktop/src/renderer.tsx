import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";
import { applyDesktopPlatform, syncSystemColorScheme } from "./lib/theme";

applyDesktopPlatform();
const stopSystemColorSchemeSync = syncSystemColorScheme();

if (import.meta.hot) {
  import.meta.hot.dispose(stopSystemColorSchemeSync);
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
