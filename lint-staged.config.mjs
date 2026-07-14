const quote = (file) => JSON.stringify(file);

export default {
  "*.rs": () => "cargo fmt --all",
  "*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,css}": (files) =>
    `bunx biome format --write --no-errors-on-unmatched ${files.map(quote).join(" ")}`,
};
