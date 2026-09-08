import type { DaemonApi } from "@shared/daemon";
import type {
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopUpdateDownloadedEvent,
  DesktopUpdateMessageEvent,
  DesktopWindowCommand,
  DesktopWindowRole,
} from "@shared/desktop-window";
import type {
  DesktopNotificationHistory,
  DesktopNotificationPreferences,
  DesktopNotificationPreferencesSetInput,
} from "@shared/notification-preferences";
import type {
  DesktopUpdateChannelSetInput,
  DesktopUpdateStatus,
} from "@shared/update-channel";
import type {
  WorkspaceDiffBasePreference,
  WorkspaceDiffBasePreferenceInput,
} from "@shared/workspace-diff-preferences";
import type * as React from "react";

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
    daemon: DaemonApi;
    desktopEnvironment: {
      getPathForFile: (file: File) => string | null;
      platform: DesktopPlatform;
    };
    desktopWindow: {
      role: DesktopWindowRole;
      closeCurrent: () => void;
      notifyContentReady: () => void;
      onCommand: (
        handler: (command: DesktopWindowCommand) => void,
      ) => () => void;
      onKeymapUserBindingsChanged: (
        handler: (state: {
          file: { version: 1; bindings: unknown[] };
          warnings: unknown[];
          fatal?: unknown;
          path: string;
        }) => void,
      ) => () => void;
      onOpenChatFromNotification: (
        handler: (event: DesktopOpenChatFromNotificationEvent) => void,
      ) => () => void;
      onNotificationHistoryChanged: (
        handler: (history: DesktopNotificationHistory) => void,
      ) => () => void;
      getNotificationHistory: () => Promise<DesktopNotificationHistory>;
      clearNotificationHistory: () => Promise<DesktopNotificationHistory>;
      markNotificationHistoryRead: (
        ids: string[],
      ) => Promise<DesktopNotificationHistory>;
      getNotificationPreferences: () => Promise<DesktopNotificationPreferences>;
      setNotificationPreferences: (
        input: DesktopNotificationPreferencesSetInput,
      ) => Promise<DesktopNotificationPreferences>;
      onUpdateDownloaded: (
        handler: (event: DesktopUpdateDownloadedEvent) => void,
      ) => () => void;
      onUpdateMessage: (
        handler: (event: DesktopUpdateMessageEvent) => void,
      ) => () => void;
      onUpdateStatusChanged: (
        handler: (status: DesktopUpdateStatus) => void,
      ) => () => void;
      installUpdate: () => Promise<unknown>;
      checkForUpdates: () => Promise<DesktopUpdateStatus>;
      getUpdateStatus: () => Promise<DesktopUpdateStatus>;
      setUpdateChannel: (
        input: DesktopUpdateChannelSetInput,
      ) => Promise<DesktopUpdateStatus>;
      getWorkspaceDiffBase: (
        root: string,
      ) => Promise<WorkspaceDiffBasePreference | undefined>;
      openSettings: () => void;
      setActiveChatId: (chatId: string | null) => void;
      setTheme: (input: DesktopThemeSetInput) => void;
      setWorkspaceDiffBase: (
        input: WorkspaceDiffBasePreferenceInput,
      ) => Promise<void>;
    };
    tipc: {
      invoke: (channel: string, input?: unknown) => Promise<unknown>;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<ElectronWebviewElement>,
        ElectronWebviewElement
      > & {
        allowpopups?: string;
        partition?: string;
        src?: string;
      };
    }
  }

  interface ElectronWebviewElement extends HTMLElement {
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    getTitle: () => string;
    getURL: () => string;
    goBack: () => void;
    goForward: () => void;
    reload: () => void;
  }
}

export {};
