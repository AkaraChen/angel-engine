import path from "node:path";
import { defineConfig } from "tsup";

const entry = ["src/index.ts", "src/adapter.ts", "src/context.ts"];
const external = [
  "@angel-engine/agent-session",
  "effect",
  "@agentclientprotocol/sdk",
  "@angel-engine/client-napi",
  "@angel-engine/js-client",
  "@sindresorhus/is",
  /^@angel-engine\/js-client\//,
  /^node:/,
];

const cjsSdkLoaderAlias = {
  name: "claude-sdk-cjs-loader",
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: {
        importer: string;
        path: string;
      }) => { path: string } | undefined,
    ) => void;
  }) {
    build.onResolve({ filter: /^\.\/sdk-loader\.js$/ }, (args) => {
      if (!args.importer.endsWith(`${path.sep}runtime.ts`)) return undefined;
      return { path: path.resolve("src/sdk-loader.cjs.ts") };
    });
  },
};

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry,
    external: [
      ...external,
      "./claude-sdk-bundle.js",
      /^@anthropic-ai\/claude-agent-sdk\//,
    ],
    format: ["esm"],
    outDir: "dist",
    sourcemap: true,
    target: "node20",
  },
  {
    clean: false,
    dts: false,
    entry,
    esbuildPlugins: [cjsSdkLoaderAlias],
    external: [
      ...external,
      "./claude-sdk-bundle.js",
      /^@anthropic-ai\/claude-agent-sdk\//,
    ],
    format: ["cjs"],
    outDir: "dist",
    outExtension: () => ({ js: ".cjs" }),
    sourcemap: true,
    target: "node20",
  },
  {
    clean: false,
    dts: false,
    entry: ["src/claude-sdk-bundle.ts"],
    external: [/^node:/],
    format: ["esm"],
    outDir: "dist",
    sourcemap: true,
    target: "node20",
  },
]);
