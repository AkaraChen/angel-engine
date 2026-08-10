import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.join(root, "..", "angel-host");
const skillMd = path.join(skillDir, "SKILL.md");

test("angel-host skill package exists with required frontmatter", () => {
  assert.equal(existsSync(skillMd), true);
  const body = readFileSync(skillMd, "utf8");
  assert.match(body, /^---\nname:\s*angel-host\n/m);
  assert.match(body, /angelctl/);
  assert.match(body, /ANGEL_DAEMON_/);
  assert.match(body, /MCP/);
  assert.match(body, /Never.*token/i);
});

test("angel-host progressive references document CLI and security", () => {
  const cliRef = path.join(skillDir, "references", "cli-commands.md");
  const securityRef = path.join(skillDir, "references", "security.md");
  assert.equal(existsSync(cliRef), true);
  assert.equal(existsSync(securityRef), true);
  assert.match(readFileSync(cliRef, "utf8"), /health/);
  assert.match(readFileSync(securityRef, "utf8"), /token/i);
});
