import { defineConfig } from "vite";

// https://vitejs.dev/config
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
        entryFileNames: "main.js",
      },
    },
  },
});
