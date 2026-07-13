import { IconContext } from "@phosphor-icons/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

const iconContextValue = { weight: "regular" } as const;

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <IconContext value={iconContextValue}>
      <App />
    </IconContext>
  </StrictMode>,
);
