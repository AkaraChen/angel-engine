import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["@angel-engine/client-napi", "electron"],
      output: {
        entryFileNames: "daemon.js",
      },
    },
  },
});
