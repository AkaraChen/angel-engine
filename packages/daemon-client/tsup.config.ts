import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts"],
  external: [/^@angel-engine\//],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "es2022",
});
