import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcRoot = fileURLToPath(new URL("./src", import.meta.url));
const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rendererRoot),
      "@assets": path.resolve(
        fileURLToPath(new URL("./assets", import.meta.url)),
      ),
      "@renderer": path.resolve(rendererRoot),
      "@shared": path.resolve(srcRoot, "shared"),
      "@main": path.resolve(srcRoot, "main"),
      "@preload": path.resolve(srcRoot, "preload"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
