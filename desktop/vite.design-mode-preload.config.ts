import { defineConfig } from "vite";

// Guest-page preload for workspace-browser WebContentsView only.
// Kept as a separate entry so the host-window preload never ships into guest pages.
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "design-mode-preload.js",
      },
    },
  },
});
