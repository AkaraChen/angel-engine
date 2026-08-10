import { defineConfig } from "tsup";

export default defineConfig({
  banner: {
    js: "#!/usr/bin/env node",
  },
  clean: true,
  dts: false,
  entry: {
    angelctl: "src/main.ts",
  },
  format: ["esm"],
  // Bundle workspace client so the packaged resource only needs Node on PATH.
  noExternal: [/^@angel-engine\//],
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node22",
});
