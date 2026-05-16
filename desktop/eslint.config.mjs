import antfu from "@antfu/eslint-config";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import importPlugin from "eslint-plugin-import-x";

export default antfu(
  {
    type: "app",
    ignores: [".vite/**", "dist/**", "node_modules/**", "out/**"],
    react: true,
    typescript: {
      tsconfigPath: "tsconfig.json",
      overridesTypeAware: {
        "ts/no-floating-promises": "error",
        "ts/no-misused-promises": "error",
      },
    },
    stylistic: false,
    formatters: false,
    markdown: false,
    yaml: false,
  },
  betterTailwindcss.configs.recommended,
  {
    name: "angel/electron-imports",
    files: ["**/*.{ts,tsx,mts}"],
    plugins: {
      "electron-import": importPlugin,
    },
    settings: {
      "import-x/core-modules": ["electron"],
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: "./tsconfig.json",
        }),
      ],
    },
    rules: {
      "electron-import/no-unresolved": "error",
      "electron-import/no-duplicates": "error",
    },
  },
  {
    name: "angel/tailwind",
    files: ["src/**/*.{ts,tsx}"],
    settings: {
      "better-tailwindcss": {
        cwd: ".",
        entryPoint: "src/renderer/index.css",
      },
    },
    rules: {
      "better-tailwindcss/enforce-shorthand-classes": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unknown-classes": [
        "error",
        {
          cwd: ".",
          entryPoint: "src/renderer/index.css",
          ignore: ["^aui-", "^chat-restore-"],
        },
      ],
    },
  },
  {
    name: "angel/project-overrides",
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "antfu/no-top-level-await": "off",
      "node/prefer-global/process": "off",
      "regexp/no-super-linear-backtracking": "warn",
      "react/unsupported-syntax": "warn",
      "react-refresh/only-export-components": "warn",
      "ts/await-thenable": "warn",
      "ts/no-misused-promises": "warn",
      "ts/no-floating-promises": "warn",
      "ts/no-unsafe-return": "warn",
      "ts/no-unsafe-argument": "warn",
      "ts/no-unsafe-assignment": "warn",
      "ts/no-use-before-define": "warn",
      "ts/return-await": "warn",
      "ts/strict-boolean-expressions": "warn",
      "ts/switch-exhaustiveness-check": "warn",
      "ts/unbound-method": "warn",
    },
  },
  {
    name: "angel/layer-boundaries",
    files: ["src/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../main/*", "../../main/*", "../../../main/*"],
              message:
                "Renderer/preload code must not import main-process modules.",
            },
            {
              group: ["@renderer/*", "../renderer/*", "../../renderer/*"],
              message:
                "Main/preload/shared code must not import renderer modules.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "angel/node-main-process",
    files: ["src/main/**/*.{ts,tsx}", "src/main.ts", "src/preload.ts"],
    rules: {
      "node/prefer-global/buffer": "off",
    },
  },
);
