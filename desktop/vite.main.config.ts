import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "@angel-engine/client-napi",
        "@angel-engine/pi-client",
        "@earendil-works/pi-coding-agent",
        /^@earendil-works\/pi-/,
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
