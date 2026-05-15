import antfu from "@antfu/eslint-config";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

export default antfu(
  {
    type: "app",
    ignores: [".vite/**", "dist/**", "node_modules/**", "out/**"],
    react: true,
    jsx: {
      a11y: true,
    },
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
      "import/core-modules": ["electron"],
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
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
    name: "angel/a11y-migration-warnings",
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "jsx-a11y": jsxA11yPlugin,
    },
    rules: {
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
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
