#!/usr/bin/env node
// One-command mobile dev: builds workspace deps if needed, then starts the
// daemon (serving/proxying the mobile shell) and the mobile Vite dev server.
//
// Usage:
//   bun run mobile:dev
//
// Env overrides:
//   DAEMON_PORT           daemon listen port (default 4377)
//   PORT                  mobile Vite dev-server port (default 4378)
//   ANGEL_MOBILE_PASSWORD pairing password (default "angel-dev")

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);

const daemonPort = Number(process.env.DAEMON_PORT ?? 4377);
const vitePort = Number(process.env.PORT ?? 4378);
const mobilePassword = process.env.ANGEL_MOBILE_PASSWORD ?? "angel-dev";
const dataDir = path.join(repoRoot, ".data", "mobile-dev");
const migrationsDir = path.join(repoRoot, "desktop", "drizzle");
const viteOrigin = `http://127.0.0.1:${vitePort}`;

for (const [name, port] of [
  ["DAEMON_PORT", daemonPort],
  ["PORT", vitePort],
]) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(
      `${name} must be an integer from 1 through 65535, got ${port}.`,
    );
    process.exit(1);
  }
}

// --- 1. Build workspace dependencies when their artifacts are missing -------

const napiArtifacts = fs
  .readdirSync(path.join(repoRoot, "crates", "angel-engine-client-napi"))
  .filter((file) => file.endsWith(".node"));

const missingBuilds = [
  ["crates/angel-engine-client-napi", napiArtifacts.length === 0],
  [
    "packages/js-client",
    !fs.existsSync(path.join(repoRoot, "packages/js-client/dist/index.js")),
  ],
  [
    "packages/daemon-api",
    !fs.existsSync(path.join(repoRoot, "packages/daemon-api/dist/index.js")),
  ],
  [
    "packages/claude-client",
    !fs.existsSync(
      path.join(repoRoot, "packages/claude-client/dist/index.cjs"),
    ),
  ],
  [
    "packages/pi-client",
    !fs.existsSync(path.join(repoRoot, "packages/pi-client/dist/index.cjs")),
  ],
].filter(([, missing]) => missing);

if (missingBuilds.length > 0) {
  console.log(
    `[mobile-dev] Building workspace dependencies (${missingBuilds
      .map(([name]) => name)
      .join(", ")})…`,
  );
  const steps = [];
  if (missingBuilds.some(([dir]) => dir.startsWith("crates/"))) {
    // Use the debug N-API build: the release profile produces a corrupt Mach-O
    // (mis-aligned LINKEDIT) with the current nightly Rust toolchain.
    steps.push(["bun", ["run", "napi:build:debug"], repoRoot]);
  }
  // Build each package with its own build script in dependency order instead
  // of `turbo run build`, whose `^build` edge would pull the (broken) release
  // N-API build back in.
  for (const dir of [
    "packages/js-client",
    "packages/daemon-api",
    "packages/claude-client",
    "packages/pi-client",
  ]) {
    if (missingBuilds.some(([missing]) => missing === dir)) {
      steps.push(["bun", ["run", "build"], path.join(repoRoot, dir)]);
    }
  }
  for (const [command, args, cwd] of steps) {
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(
        `[mobile-dev] Build step failed: ${command} ${args.join(" ")}`,
      );
      process.exit(result.status ?? 1);
    }
  }
}

// --- 2. Start daemon + mobile Vite dev server --------------------------------

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    // Children are spawned detached, so signal the whole process group —
    // otherwise grandchildren (e.g. Vite under `bun run dev`) survive as
    // orphans and keep holding the dev ports.
    try {
      if (process.platform === "win32") child.kill("SIGINT");
      else process.kill(-child.pid, "SIGINT");
    } catch {
      child.kill("SIGINT");
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

function start(label, command, args, options) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => `[${label}] ${line}\n`)
      .join("");
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  child.on("error", (error) => {
    if (!shuttingDown) {
      console.error(`[mobile-dev] Failed to start ${label}: ${error.message}`);
      shutdown(1);
    }
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(
        `[mobile-dev] ${label} exited (code ${code}); shutting down.`,
      );
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

const daemonDir = path.join(repoRoot, "packages", "daemon");
const tsxBin = path.join(
  daemonDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

start(
  "daemon",
  tsxBin,
  [
    "src/main.ts",
    "--data-dir",
    dataDir,
    "--migrations-dir",
    migrationsDir,
    "--host",
    "0.0.0.0",
    "--port",
    String(daemonPort),
    "--serve-mobile",
    "--mobile-dev-server-url",
    viteOrigin,
    "--print-handshake",
  ],
  {
    cwd: daemonDir,
    env: { ...process.env, ANGEL_MOBILE_PASSWORD: mobilePassword },
  },
);

start("mobile", "bun", ["run", "dev"], {
  cwd: path.join(repoRoot, "mobile"),
  env: { ...process.env, PORT: String(vitePort) },
});

// --- 3. Print the phone entry point ------------------------------------------

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === "IPv4" && !info.internal)
    .map((info) => info.address);
}

setTimeout(() => {
  const urls = lanAddresses().map((ip) => `http://${ip}:${daemonPort}`);
  console.log("");
  console.log("[mobile-dev] Ready. On your phone (same Wi-Fi):");
  for (const url of urls) console.log(`[mobile-dev]   ${url}`);
  console.log(`[mobile-dev]   pairing password: ${mobilePassword}`);
  console.log(
    `[mobile-dev] (API + mobile shell both go through the daemon port.)`,
  );
  console.log("");
}, 2000).unref();
