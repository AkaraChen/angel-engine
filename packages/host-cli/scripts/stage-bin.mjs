import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "dist", "angelctl.js");
const binDir = path.join(root, "dist", "bin");
const target = path.join(binDir, "angelctl");

mkdirSync(binDir, { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
