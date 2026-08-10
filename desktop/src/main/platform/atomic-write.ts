import { open, close, fsync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import writeFileAtomicLib from "write-file-atomic";

const openAsync = promisify(open);
const closeAsync = promisify(close);
const fsyncAsync = promisify(fsync);

const writeFileAtomicImpl =
  typeof writeFileAtomicLib === "function"
    ? writeFileAtomicLib
    : (writeFileAtomicLib as { default: typeof writeFileAtomicLib }).default;

/**
 * Atomic file replace for keybindings persistence (KIT-797 revision B′).
 *
 * 1. `write-file-atomic`: tmp → fsync(tmp) → rename over target (never unlink first).
 * 2. On POSIX only: wrapper explicitly fsyncs the parent directory after success.
 *    Directory fsync failure is soft-fail (log-friendly Error property); content is already replaced.
 * 3. On failure of step 1: original file is left intact; error propagates.
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
): Promise<void> {
  await writeFileAtomicImpl(filePath, contents, { encoding: "utf8" });

  if (process.platform === "win32") {
    return;
  }

  try {
    const dirFd = await openAsync(dirname(filePath), "r");
    try {
      await fsyncAsync(dirFd);
    } finally {
      await closeAsync(dirFd);
    }
  } catch (error) {
    // Soft-fail: rename already succeeded; directory entry may not be durable.
    console.warn(
      "[atomic-write] parent directory fsync failed (content already replaced)",
      error,
    );
  }
}
