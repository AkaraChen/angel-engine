import type { ChatStreamApi } from "./shared/chat";
import type { DesktopOpenChatFromNotificationEvent } from "./shared/desktop-window";

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
      getPathForFile: (file: File) => string | null;
      platform: DesktopPlatform;
    };
    desktopWindow: {
      onOpenChatFromNotification: (
        handler: (event: DesktopOpenChatFromNotificationEvent) => void,
      ) => () => void;
      setActiveChatId: (chatId: string | null) => void;
    };
    chatStream: ChatStreamApi;
    ipcInvoke: (channel: string, input?: unknown) => Promise<unknown>;
  }
}

export {};
