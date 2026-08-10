import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts", "src/correlate.ts", "src/types.ts"],
  external: [/^@ccusage\//, "ccusage"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  target: "node22",
});
