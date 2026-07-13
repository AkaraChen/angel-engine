import antfu from "@antfu/eslint-config";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";

export default antfu(
  {
    type: "app",
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/components/ui/**",
      "src/hooks/**",
    ],
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
    name: "angel-mobile/tailwind",
    files: ["src/**/*.{ts,tsx}"],
    settings: {
      "better-tailwindcss": {
        cwd: ".",
        entryPoint: "src/index.css",
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
          entryPoint: "src/index.css",
        },
      ],
    },
  },
  {
    name: "angel-mobile/project-overrides",
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "antfu/no-top-level-await": "off",
      "node/prefer-global/process": "off",
      "react-refresh/only-export-components": "warn",
      "ts/no-floating-promises": "error",
      "ts/no-misused-promises": "error",
      "ts/switch-exhaustiveness-check": "error",
    },
  },
);
