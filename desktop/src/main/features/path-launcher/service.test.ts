import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { executeProcessInvocation, PathLauncherService } from "./service";
import type {
  DiscoveryProbe,
  PathLauncherExecution,
  PlatformPathLauncherAdapter,
  SpawnProcess,
} from "./types";

function childProcess(): ChildProcess & { unref: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as ChildProcess & {
    unref: ReturnType<typeof vi.fn>;
  };
  child.unref = vi.fn(() => child);
  return child;
}

describe("process invocation", () => {
  it("spawns with shell disabled and detaches a GUI process", async () => {
    const child = childProcess();
    const spawn = vi.fn<SpawnProcess>(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
    const target = "/tmp/项目 $HOME && echo nope";

    await executeProcessInvocation(
      {
        args: [target],
        awaitExit: false,
        executable: "/opt/Cursor",
      },
      spawn,
    );

    expect(spawn).toHaveBeenCalledWith("/opt/Cursor", [target], {
      cwd: undefined,
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("reports a non-zero trampoline exit", async () => {
    const child = childProcess();
    const spawn = vi.fn<SpawnProcess>(() => {
      queueMicrotask(() => {
        child.emit("spawn");
        child.emit("close", 1, null);
      });
      return child;
    });

    await expect(
      executeProcessInvocation(
        {
          args: ["-b", "com.microsoft.VSCode", "/repo"],
          awaitExit: true,
          executable: "/usr/bin/open",
        },
        spawn,
      ),
    ).rejects.toThrow("exit code 1");
    expect(child.unref).not.toHaveBeenCalled();
  });
});

describe("path launcher service", () => {
  const adapter: PlatformPathLauncherAdapter = {
    discoverEditors: async () => [],
    discoverTerminal: async () => undefined,
  };
  const probe = {
    env: {},
    executableExists: async () => false,
    pathExists: async () => false,
    run: async () => ({ stdout: "" }),
  } satisfies DiscoveryProbe;

  it("honors Electron openPath's empty-string success contract", async () => {
    const openPath = vi
      .fn<PathLauncherExecution["openPath"]>()
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("The directory could not be opened");
    const service = new PathLauncherService({
      adapter,
      execution: {
        copyText: vi.fn(),
        openPath,
        spawn: vi.fn(),
      },
      probe,
    });

    await expect(service.launchFileManager("/repo")).resolves.toBeUndefined();
    await expect(service.launchFileManager("/missing")).rejects.toThrow(
      "The directory could not be opened",
    );
  });
});
