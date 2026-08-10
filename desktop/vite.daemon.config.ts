import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.url": "__daemonImportMetaUrl",
  },
  build: {
    rollupOptions: {
      external: ["@angel-engine/client-napi", "electron", "libsql", "node-pty"],
      output: {
        entryFileNames: "daemon.js",
        intro:
          "const __daemonImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
      },
    },
  },
});
