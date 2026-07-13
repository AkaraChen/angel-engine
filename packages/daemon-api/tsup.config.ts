import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/agents.ts",
    "src/client.ts",
    "src/daemon.ts",
    "src/events.ts",
    "src/chat/index.ts",
    "src/mime.ts",
    "src/projects.ts",
    "src/terminal.ts",
    "src/workspace-tools.ts",
  ],
  external: [/^@angel-engine\/js-client/],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  target: "node22",
});
