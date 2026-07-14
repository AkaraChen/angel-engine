import type { ChildProcess } from "node:child_process";

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect, createServer } from "node:net";
import path from "node:path";
import { app } from "electron";

const START_TIMEOUT_MS = 10_000;

let child: ChildProcess | undefined;
let devServerUrl: string | undefined;

export async function startMobileDevServer(): Promise<void> {
  if (app.isPackaged || child !== undefined) return;

  const port = await findAvailablePort();
  const mobileRoot = path.resolve(app.getAppPath(), "..", "mobile");
  const viteEntry = resolveViteEntry(mobileRoot);
  const executable = process.env.npm_node_execpath ?? process.execPath;
  const nextChild = spawn(executable, [viteEntry], {
    cwd: mobileRoot,
    env: {
      ...process.env,
      ...(executable === process.execPath ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      PORT: String(port),
    },
    stdio: "inherit",
  });
  child = nextChild;
  devServerUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForPort(nextChild, port);
  } catch (error) {
    child = undefined;
    devServerUrl = undefined;
    nextChild.kill();
    throw error;
  }

  nextChild.once("exit", () => {
    if (child !== nextChild) return;
    child = undefined;
    devServerUrl = undefined;
  });
}

export async function stopMobileDevServer(): Promise<void> {
  const active = child;
  child = undefined;
  devServerUrl = undefined;
  if (active === undefined || active.exitCode !== null) return;

  active.kill();
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      active.kill("SIGKILL");
      resolve();
    }, 2_000);
    active.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function getMobileDevServerUrl(): string | undefined {
  return devServerUrl;
}

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate a mobile development port.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}

function resolveViteEntry(mobileRoot: string): string {
  const require = createRequire(path.join(mobileRoot, "package.json"));
  const packageJsonPath = require.resolve("vite/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    bin?: { vite?: string };
  };
  if (packageJson.bin?.vite === undefined) {
    throw new TypeError("The installed Vite package does not expose its CLI.");
  }
  return path.resolve(path.dirname(packageJsonPath), packageJson.bin.vite);
}

async function waitForPort(process: ChildProcess, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + START_TIMEOUT_MS;
    const tryConnect = () => {
      const socket = connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error("Mobile Vite did not start within 10 seconds."));
          return;
        }
        setTimeout(tryConnect, 100);
      });
    };
    process.once("exit", (code) => {
      reject(new Error(`Mobile Vite exited before startup (code ${code}).`));
    });
    tryConnect();
  });
}
