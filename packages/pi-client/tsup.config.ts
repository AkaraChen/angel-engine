import { defineConfig } from "tsup";

const entry = ["src/index.ts", "src/adapter.ts", "src/context.ts"];
const external = [
  "@angel-engine/client-napi",
  "@angel-engine/js-client",
  "@earendil-works/pi-coding-agent",
  "@sindresorhus/is",
  /^@angel-engine\/js-client\//,
  /^@earendil-works\/pi-/,
  /^node:/,
];

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry,
    external,
    format: ["esm"],
    outDir: "dist",
    sourcemap: true,
    target: "node22",
  },
  {
    clean: false,
    dts: false,
    entry,
    external,
    format: ["cjs"],
    outDir: "dist",
    outExtension: () => ({ js: ".cjs" }),
    sourcemap: true,
    target: "node22",
  },
]);
