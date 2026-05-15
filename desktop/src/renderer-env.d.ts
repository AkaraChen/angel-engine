import type { ChatStreamApi } from "./shared/chat";
import type {
  DesktopWindowCommand,
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
} from "./shared/desktop-window";

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
      confirmDeleteAllChats: () => Promise<boolean>;
      onCommand: (
        handler: (command: DesktopWindowCommand) => void,
      ) => () => void;
      onOpenChatFromNotification: (
        handler: (event: DesktopOpenChatFromNotificationEvent) => void,
      ) => () => void;
      setActiveChatId: (chatId: string | null) => void;
      setTheme: (input: DesktopThemeSetInput) => void;
    };
    chatStream: ChatStreamApi;
    ipcInvoke: (channel: string, input?: unknown) => Promise<unknown>;
  }
}

export {};
