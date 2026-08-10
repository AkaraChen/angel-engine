#!/usr/bin/env node
/**
 * Compares shared semantic CSS variables between desktop and mobile foundations
 * against docs/design/shared-semantic-tokens.json. Platform-only tokens listed
 * in allowlist_platform_only may diverge.
 *
 * Exit 0 on match; exit 1 with a drift report otherwise.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs/design/shared-semantic-tokens.json");

/**
 * @param {string} css
 * @param {string} marker
 * @returns {Record<string, string>}
 */
function parseBlock(css, marker) {
  const idx = css.indexOf(marker);
  if (idx < 0) return {};
  const brace = css.indexOf("{", idx);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(brace + 1, end);
  /** @type {Record<string, string>} */
  const out = {};
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]] = match[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

/**
 * @param {string} value
 */
function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const desktopCss = readFileSync(
  path.join(root, "desktop/src/renderer/index-foundation.css"),
  "utf8",
);
const mobileCss = readFileSync(path.join(root, "mobile/src/index.css"), "utf8");

const desktopLight = parseBlock(desktopCss, ":root {\n  color-scheme: light");
const desktopDark = parseBlock(desktopCss, ".dark {\n  color-scheme: dark");
const mobileLight = parseBlock(mobileCss, ":root {\n  color-scheme: light");
const mobileDark = parseBlock(mobileCss, ".dark {\n  color-scheme: dark");

/** @type {string[]} */
const problems = [];

for (const key of contract.shared_keys) {
  const expectedLight = contract.light[key];
  const expectedDark = contract.dark[key];

  if (expectedLight !== undefined) {
    for (const [label, values] of [
      ["desktop light", desktopLight],
      ["mobile light", mobileLight],
    ]) {
      const actual = values[key];
      if (actual === undefined) {
        problems.push(`missing --${key} in ${label}`);
      } else if (normalize(actual) !== normalize(expectedLight)) {
        problems.push(
          `drift --${key} in ${label}: expected ${expectedLight}, got ${actual}`,
        );
      }
    }
  }

  if (expectedDark !== undefined) {
    for (const [label, values] of [
      ["desktop dark", desktopDark],
      ["mobile dark", mobileDark],
    ]) {
      const actual = values[key];
      if (actual === undefined) {
        problems.push(`missing --${key} in ${label}`);
      } else if (normalize(actual) !== normalize(expectedDark)) {
        problems.push(
          `drift --${key} in ${label}: expected ${expectedDark}, got ${actual}`,
        );
      }
    }
  }
}

// Mobile must keep touch-target; desktop must keep grass primary as product accent.
if (mobileLight["touch-target"] !== "2.75rem") {
  problems.push(
    `mobile light --touch-target must remain 2.75rem (got ${mobileLight["touch-target"]})`,
  );
}
if (normalize(desktopLight.primary ?? "") !== "#59802c") {
  problems.push(
    `desktop light --primary must remain grass #59802c (got ${desktopLight.primary})`,
  );
}
if (normalize(mobileLight.primary ?? "") !== "#59802c") {
  problems.push(
    `mobile light --primary must match grass #59802c (got ${mobileLight.primary})`,
  );
}
if (normalize(mobileLight.primary ?? "") === "#3784ff") {
  problems.push("mobile still uses Azure #3784ff as product primary");
}

if (problems.length > 0) {
  console.error("Design token parity failed:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Design token parity OK (${contract.shared_keys.length} shared keys; platform allow-list ${contract.allowlist_platform_only.length}).`,
);
