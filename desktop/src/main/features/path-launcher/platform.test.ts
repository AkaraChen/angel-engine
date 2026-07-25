import { describe, expect, it, vi } from "vitest";
import { discoverDarwinEditors } from "./darwin";
import { linuxPathLauncherAdapter } from "./linux";
import type { DiscoveryProbe } from "./types";
import { discoverWindowsEditors, parseWindowsRegistryEntries } from "./win32";

function createProbe(overrides: Partial<DiscoveryProbe> = {}): DiscoveryProbe {
  return {
    env: {},
    executableExists: vi.fn(async () => false),
    pathExists: vi.fn(async () => false),
    run: vi.fn(async () => ({ stdout: "" })),
    ...overrides,
  };
}

describe("macOS path launcher", () => {
  it("discovers a verified bundle and passes the target as one argv value", async () => {
    const cursorPath = "/Applications/Cursor.app";
    const probe = createProbe({
      env: { HOME: "/Users/test" },
      pathExists: vi.fn(async (candidate) => candidate === cursorPath),
      run: vi.fn(async (executable, args) => {
        if (executable === "/usr/bin/osascript") {
          return {
            stdout: args.at(-1)?.includes("230313") ? cursorPath : "",
          };
        }
        if (executable === "/usr/bin/plutil") {
          return { stdout: "com.todesktop.230313mzl4w4u92\n" };
        }
        return { stdout: "" };
      }),
    });

    const editors = await discoverDarwinEditors(probe);
    const target = "/tmp/项目 $HOME && echo nope";

    expect(editors.map(({ id }) => id)).toEqual(["cursor"]);
    expect(editors[0]?.createInvocation(target)).toEqual({
      args: ["-b", "com.todesktop.230313mzl4w4u92", target],
      awaitExit: true,
      executable: "/usr/bin/open",
    });
  });
});

describe("Windows path launcher", () => {
  it("parses uninstall entries without treating their values as commands", () => {
    const entries = parseWindowsRegistryEntries(String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\VSCode
    DisplayName    REG_SZ    Microsoft Visual Studio Code
    DisplayIcon    REG_SZ    "C:\Apps\Microsoft VS Code\Code.exe",0
    Publisher    REG_SZ    Microsoft Corporation
`);

    expect(entries).toEqual([
      {
        displayIcon: String.raw`"C:\Apps\Microsoft VS Code\Code.exe",0`,
        displayName: "Microsoft Visual Studio Code",
        publisher: "Microsoft Corporation",
      },
    ]);
  });

  it("discovers a validated executable and preserves a Unicode target", async () => {
    const codePath = String.raw`C:\Apps\Microsoft VS Code\Code.exe`;
    const registryOutput = String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\VSCode
    DisplayName    REG_SZ    Microsoft Visual Studio Code
    DisplayIcon    REG_SZ    "C:\Apps\Microsoft VS Code\Code.exe",0
    Publisher    REG_SZ    Microsoft Corporation
`;
    const probe = createProbe({
      env: { PATH: "" },
      executableExists: vi.fn(async (candidate) => candidate === codePath),
      run: vi.fn(async () => ({ stdout: registryOutput })),
    });

    const editors = await discoverWindowsEditors(probe);
    const target = String.raw`C:\项目\repo & echo nope`;

    expect(editors.map(({ id }) => id)).toEqual(["vscode"]);
    expect(editors[0]?.createInvocation(target)).toEqual({
      args: [target],
      awaitExit: false,
      executable: codePath,
    });
  });
});

describe("Linux path launcher", () => {
  it("uses PATH discovery and the xdg terminal directory contract", async () => {
    const probe = createProbe({
      env: { PATH: "/opt/bin" },
      executableExists: vi.fn(
        async (candidate) =>
          candidate === "/opt/bin/cursor" ||
          candidate === "/opt/bin/xdg-terminal-exec",
      ),
    });
    const target = "/tmp/项目 repo; echo nope";

    const [editors, terminal] = await Promise.all([
      linuxPathLauncherAdapter.discoverEditors(probe),
      linuxPathLauncherAdapter.discoverTerminal(probe),
    ]);

    expect(editors.map(({ id }) => id)).toEqual(["cursor"]);
    expect(editors[0]?.createInvocation(target)).toEqual({
      args: [target],
      awaitExit: false,
      executable: "/opt/bin/cursor",
    });
    expect(terminal?.createInvocation(target)).toEqual({
      args: [`--dir=${target}`],
      awaitExit: false,
      executable: "/opt/bin/xdg-terminal-exec",
    });
  });
});
