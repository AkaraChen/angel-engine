const quote = (file) => JSON.stringify(file);

export default {
  "*.rs": (files) => `rustfmt ${files.map(quote).join(" ")}`,
  "*.{js,jsx,ts,tsx,mjs,cjs,json,css,md,html,yml,yaml}": (files) =>
    `pnpm exec prettier --write --ignore-unknown ${files.map(quote).join(" ")}`,
};
