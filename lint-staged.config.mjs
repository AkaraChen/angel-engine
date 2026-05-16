const quote = (file) => JSON.stringify(file);

export default {
  "*.rs": () => "cargo fmt --all",
  "*.{js,jsx,ts,tsx,mjs,cjs,json,css,md,html,yml,yaml}": (files) =>
    `pnpm exec prettier --write --ignore-unknown ${files.map(quote).join(" ")}`,
};
