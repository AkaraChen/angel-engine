import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      ts: tsPlugin,
    },
    rules: {
      "ts/await-thenable": "error",
      "ts/no-floating-promises": "error",
      "ts/no-misused-promises": "error",
      "ts/switch-exhaustiveness-check": "error",
    },
  },
];
