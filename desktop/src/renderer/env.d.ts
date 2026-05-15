import type { ChatStreamApi } from "@shared/chat";
import type {
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopWindowCommand,
} from "@shared/desktop-window";

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
      openSettings: () => void;
      setActiveChatId: (chatId: string | null) => void;
      setTheme: (input: DesktopThemeSetInput) => void;
    };
    chatStream: ChatStreamApi;
    tipc: {
      invoke: (channel: string, input?: unknown) => Promise<unknown>;
    };
  }
}

export {};
