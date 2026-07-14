import path from "node:path";
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

const cjsEntryPathAlias = {
  name: "pi-agent-entry-path-cjs",
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: {
        importer: string;
        path: string;
      }) => { path: string } | undefined,
    ) => void;
  }) {
    build.onResolve({ filter: /^\.\/pi-agent-entry-path\.js$/ }, (args) => {
      if (!args.importer.endsWith(`${path.sep}rpc-client.ts`)) return undefined;
      return { path: path.resolve("src/pi-agent-entry-path.cjs.ts") };
    });
  },
};

export default defineConfig([
  {
    clean: true,
    dts: false,
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
    esbuildPlugins: [cjsEntryPathAlias],
    external,
    format: ["cjs"],
    outDir: "dist",
    outExtension: () => ({ js: ".cjs" }),
    sourcemap: true,
    target: "node22",
  },
  {
    clean: false,
    dts: false,
    entry: ["src/pi-agent-entry.ts"],
    external,
    format: ["esm"],
    outDir: "dist",
    sourcemap: true,
    target: "node22",
  },
]);
