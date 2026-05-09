import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "@angel-engine/client-napi",
        "@anthropic-ai/claude-agent-sdk",
        "better-sqlite3",
      ],
    },
  },
});
