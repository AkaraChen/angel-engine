const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const BRUSH_VERSION = "0.4.0";
const stageRoot = path.resolve(__dirname, "..", ".runtime", "brush");

if (process.platform !== "win32") process.exit(0);

const binary = path.join(stageRoot, "bin", "brush.exe");
if (!fs.existsSync(binary)) {
  fs.mkdirSync(stageRoot, { recursive: true });
  execFileSync(
    "cargo",
    [
      "install",
      "brush-shell",
      "--version",
      BRUSH_VERSION,
      "--locked",
      "--root",
      stageRoot,
    ],
    { stdio: "inherit" },
  );
}

if (!fs.existsSync(binary)) {
  throw new Error(`brush ${BRUSH_VERSION} did not produce ${binary}`);
}
