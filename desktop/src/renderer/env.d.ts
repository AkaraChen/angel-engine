import type { ChatStreamApi } from "@shared/chat";
import type { TerminalApi } from "@shared/terminal";
import type { WorkspaceBrowserApi } from "@shared/workspace-browser";
import type * as React from "react";
import type {
  DesktopConfirmDeleteArchivedChatsInput,
  DesktopConfirmDeleteCustomAgentInput,
  DesktopConfirmSaveWorkspaceFileChangesInput,
  DesktopConfirmSaveWorkspaceFileChangesResult,
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopUpdateDownloadedEvent,
  DesktopWindowCommand,
} from "@shared/desktop-window";
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
      closeCurrent: () => void;
      confirmDeleteAllChats: () => Promise<boolean>;
      confirmDeleteArchivedChats: (
        input: DesktopConfirmDeleteArchivedChatsInput,
      ) => Promise<boolean>;
      confirmDeleteCustomAgent: (
        input: DesktopConfirmDeleteCustomAgentInput,
      ) => Promise<boolean>;
      confirmSaveWorkspaceFileChanges: (
        input: DesktopConfirmSaveWorkspaceFileChangesInput,
      ) => Promise<DesktopConfirmSaveWorkspaceFileChangesResult>;
      onCommand: (
        handler: (command: DesktopWindowCommand) => void,
      ) => () => void;
      onOpenChatFromNotification: (
        handler: (event: DesktopOpenChatFromNotificationEvent) => void,
      ) => () => void;
      onUpdateDownloaded: (
        handler: (event: DesktopUpdateDownloadedEvent) => void,
      ) => () => void;
      onWorkspaceToolDialogRequested: (
        handler: (instance: WorkspaceToolInstance) => void,
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
      getWorkspaceToolWindowInstance: (
        toolId: string,
      ) => Promise<WorkspaceToolInstance | null>;
      getWorkspaceToolSurfaceState: () => Promise<WorkspaceToolSurfaceState>;
      openSettings: () => void;
      closeWorkspaceToolInstance: (
        input: WorkspaceToolInstanceCloseInput,
      ) => void;
      focusWorkspaceToolSurface: () => void;
      openWorkspaceToolDialog: (input: WorkspaceToolWindowOpenInput) => void;
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
    };
    chatStream: ChatStreamApi;
    terminal: TerminalApi;
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
