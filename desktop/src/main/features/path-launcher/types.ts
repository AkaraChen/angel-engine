import type { ChildProcess } from "node:child_process";
import type { PathLauncherEditorId } from "@shared/path-launcher";

export interface CommandResult {
  stdout: string;
}

export interface DiscoveryProbe {
  env: NodeJS.ProcessEnv;
  executableExists: (candidate: string) => Promise<boolean>;
  pathExists: (candidate: string) => Promise<boolean>;
  run: (executable: string, args: readonly string[]) => Promise<CommandResult>;
}

export interface ProcessInvocation {
  args: readonly string[];
  awaitExit: boolean;
  cwd?: string;
  executable: string;
}

export interface ResolvedEditor {
  createInvocation: (target: string) => ProcessInvocation;
  id: PathLauncherEditorId;
  name: string;
}

export interface ResolvedTerminal {
  createInvocation: (target: string) => ProcessInvocation;
  name: string;
}

export interface PlatformPathLauncherAdapter {
  discoverEditors: (probe: DiscoveryProbe) => Promise<ResolvedEditor[]>;
  discoverTerminal: (
    probe: DiscoveryProbe,
  ) => Promise<ResolvedTerminal | undefined>;
}

export type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: {
    cwd?: string;
    detached: boolean;
    shell: false;
    stdio: "ignore";
  },
) => ChildProcess;

export interface PathLauncherExecution {
  copyText: (text: string) => void;
  openPath: (target: string) => Promise<string>;
  spawn: SpawnProcess;
}
