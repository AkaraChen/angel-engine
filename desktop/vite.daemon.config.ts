import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "@angel-engine/client-napi",
        "better-sqlite3",
        "electron",
        "node-pty",
      ],
      output: {
        entryFileNames: "daemon.js",
      },
    },
  },
});
