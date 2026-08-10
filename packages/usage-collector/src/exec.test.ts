import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runCcusageJson } from "./exec.js";

describe("ccusage process boundary", () => {
  it("reports schema drift explicitly", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "usage-collector-"));
    const executable = path.join(directory, "ccusage");
    await writeFile(executable, "#!/bin/sh\nprintf '{\"changed\":true}'\n");
    await chmod(executable, 0o755);

    await expect(
      runCcusageJson(
        executable,
        ["session"],
        z.object({ session: z.array(z.string()) }),
      ),
    ).rejects.toMatchObject({ reason: "schema-mismatch" });
  });
});
