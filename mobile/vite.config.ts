import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  // Served from the daemon origin root with client-side (history) routing, so
  // assets must use absolute URLs — otherwise `/chat/:id` deep links would
  // resolve `./assets/*` against the wrong path and 404.
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(srcRoot),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
  },
});
