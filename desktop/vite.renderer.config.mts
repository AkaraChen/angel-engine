import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));
const srcRoot = fileURLToPath(new URL("./src", import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rendererRoot),
      "@shared": path.resolve(srcRoot, "shared"),
      "@renderer": path.resolve(rendererRoot),
    },
  },
});
