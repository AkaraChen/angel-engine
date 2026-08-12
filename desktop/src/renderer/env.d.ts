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
import type { WorkspaceBrowserApi } from "@shared/workspace-browser";
import type {
  WorkspaceToolContextSetInput,
  WorkspaceToolInstance,
  WorkspaceToolInstanceCloseInput,
  WorkspaceToolWindowOpenInput,
} from "@shared/workspace-tool-instances";
import type {
  WorkspaceToolSurfaceContextSetInput,
  WorkspaceToolSurfaceHostSetInput,
  WorkspaceToolSurfaceSnapshotSetInput,
  WorkspaceToolSurfaceState,
} from "@shared/workspace-tool-surface";
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
      onWorkspaceToolInstanceUpdated: (
        handler: (instance: WorkspaceToolInstance) => void,
      ) => () => void;
      onWorkspaceToolWindowClosed: (
        handler: (toolId: string) => void,
      ) => () => void;
      onWorkspaceToolSurfaceChanged: (
        handler: (state: WorkspaceToolSurfaceState) => void,
      ) => () => void;
      installUpdate: () => Promise<unknown>;
      checkForUpdates: () => Promise<DesktopUpdateStatus>;
      getUpdateStatus: () => Promise<DesktopUpdateStatus>;
      setUpdateChannel: (
        input: DesktopUpdateChannelSetInput,
      ) => Promise<DesktopUpdateStatus>;
      getWorkspaceToolWindowInstance: (
        toolId: string,
      ) => Promise<WorkspaceToolInstance | null>;
      getWorkspaceToolSurfaceState: () => Promise<WorkspaceToolSurfaceState>;
      getWorkspaceDiffBase: (
        root: string,
      ) => Promise<WorkspaceDiffBasePreference | undefined>;
      openSettings: () => void;
      closeWorkspaceToolInstance: (
        input: WorkspaceToolInstanceCloseInput,
      ) => void;
      focusWorkspaceToolSurface: () => void;
      openWorkspaceToolWindow: (input: WorkspaceToolWindowOpenInput) => void;
      registerWorkspaceToolWindowInstance: (
        input: WorkspaceToolWindowOpenInput,
      ) => void;
      setActiveChatId: (chatId: string | null) => void;
      setTheme: (input: DesktopThemeSetInput) => void;
      setWorkspaceToolContext: (input: WorkspaceToolContextSetInput) => void;
      setWorkspaceToolSurfaceContext: (
        input: WorkspaceToolSurfaceContextSetInput,
      ) => void;
      setWorkspaceToolSurfaceHost: (
        input: WorkspaceToolSurfaceHostSetInput,
      ) => void;
      setWorkspaceToolSurfaceSnapshot: (
        input: WorkspaceToolSurfaceSnapshotSetInput,
      ) => void;
      setWorkspaceDiffBase: (
        input: WorkspaceDiffBasePreferenceInput,
      ) => Promise<void>;
    };
    workspaceBrowser: WorkspaceBrowserApi;
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
