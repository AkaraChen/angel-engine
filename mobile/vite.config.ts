import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  // Served by the desktop app from an arbitrary path, so use relative asset URLs.
  base: "./",
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
