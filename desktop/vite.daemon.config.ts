import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["@angel-engine/client-napi", "electron", "libsql", "node-pty"],
      output: {
        entryFileNames: "daemon.js",
      },
    },
  },
});
