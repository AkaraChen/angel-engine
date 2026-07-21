import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts"],
  external: ["effect", /^node:/],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "node22",
});
