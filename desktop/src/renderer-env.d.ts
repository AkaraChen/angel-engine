import type { ChatStreamApi } from "./shared/chat";

declare global {
  type DesktopPlatform =
    | "aix"
    | "android"
    | "darwin"
    | "freebsd"
    | "haiku"
    | "linux"
    | "openbsd"
    | "sunos"
    | "win32"
    | "cygwin"
    | "netbsd";

  interface Window {
    desktopEnvironment: {
      platform: DesktopPlatform;
    };
    chatStream: ChatStreamApi;
    ipcInvoke: (channel: string, input?: unknown) => Promise<unknown>;
  }
}

export {};
