import { parseArgs } from "node:util";
import { createDaemon } from "./server";

const { values } = parseArgs({
  options: {
    "data-dir": { type: "string" },
    host: { default: "127.0.0.1", type: "string" },
    "mobile-dir": { type: "string" },
    "migrations-dir": { type: "string" },
    packaged: { default: false, type: "boolean" },
    port: { default: "0", type: "string" },
    "print-handshake": { default: false, type: "boolean" },
    "serve-mobile": { default: false, type: "boolean" },
    version: { default: "0.1.0", type: "string" },
  },
  strict: true,
});

if (values["data-dir"] === undefined) {
  throw new TypeError("--data-dir is required.");
}

const port = Number.parseInt(values.port, 10);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new TypeError("--port must be an integer from 0 through 65535.");
}

async function main() {
  const daemon = await createDaemon({
    dataDir: values["data-dir"] as string,
    migrationsDir: values["migrations-dir"],
    packaged: values.packaged,
    host: values.host,
    mobileDir: values["mobile-dir"],
    // The password is passed via the environment, not argv, so it does not leak
    // into process listings or logs.
    mobilePassword: process.env.ANGEL_MOBILE_PASSWORD,
    port,
    serveMobile: values["serve-mobile"],
    version: values.version,
    onShutdown: () => process.exit(0),
  });

  const utilityParentPort = (
    process as NodeJS.Process & {
      parentPort?: { postMessage: (message: unknown) => void };
    }
  ).parentPort;
  if (utilityParentPort !== undefined) {
    utilityParentPort.postMessage(daemon.info);
  } else if (values["print-handshake"]) {
    process.stdout.write(`${JSON.stringify(daemon.info)}\n`);
  }

  const shutdown = () => void daemon.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
