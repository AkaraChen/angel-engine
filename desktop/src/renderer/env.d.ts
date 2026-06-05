import type { ChatStreamApi } from "@shared/chat";
import type {
  DesktopConfirmDeleteArchivedChatsInput,
  DesktopConfirmDeleteCustomAgentInput,
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopUpdateDownloadedEvent,
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
      confirmDeleteArchivedChats: (
        input: DesktopConfirmDeleteArchivedChatsInput,
      ) => Promise<boolean>;
      confirmDeleteCustomAgent: (
        input: DesktopConfirmDeleteCustomAgentInput,
      ) => Promise<boolean>;
      onCommand: (
        handler: (command: DesktopWindowCommand) => void,
      ) => () => void;
      onOpenChatFromNotification: (
        handler: (event: DesktopOpenChatFromNotificationEvent) => void,
      ) => () => void;
      onUpdateDownloaded: (
        handler: (event: DesktopUpdateDownloadedEvent) => void,
      ) => () => void;
      installUpdate: () => Promise<unknown>;
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
