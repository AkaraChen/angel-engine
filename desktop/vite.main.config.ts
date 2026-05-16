import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "@angel-engine/client-napi",
        "@angel-engine/js-client",
        /^@angel-engine\/js-client\//,
        "@anthropic-ai/claude-agent-sdk",
        "better-sqlite3",
      ],
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
