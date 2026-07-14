import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts", "src/main.ts"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  target: "node22",
});
