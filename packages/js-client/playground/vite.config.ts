import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.join(packageRoot, "playground"),
  resolve: {
    alias: {
      "@angel-engine/js-client/assistant-ui": path.join(
        packageRoot,
        "src/assistant-ui.ts",
      ),
      "@angel-engine/js-client/claude": path.join(
        packageRoot,
        "src/claude/index.ts",
      ),
      "@angel-engine/js-client/mock": path.join(packageRoot, "src/mock.ts"),
      "@angel-engine/js-client/projection": path.join(
        packageRoot,
        "src/projection.ts",
      ),
      "@angel-engine/js-client/utils": path.join(
        packageRoot,
        "src/utils/index.ts",
      ),
      "@angel-engine/js-client": path.join(packageRoot, "src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
});
