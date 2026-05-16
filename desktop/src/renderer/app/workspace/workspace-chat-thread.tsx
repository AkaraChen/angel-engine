import type { AgentRuntime } from "@shared/agents";
import type { Chat, ChatHistoryMessage, ChatRuntimeConfig } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ErrorInfo, ReactNode } from "react";

import type {
  ChatMessagesUpdateHandler,
  ChatUpdateHandler,
  DraftAgentConfig,
} from "@/app/workspace/workspace-thread-types";
import type { useApi } from "@/platform/use-api";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { RiErrorWarningLine as AlertCircle } from "@remixicon/react";
import { Component, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Redirect } from "wouter";
import i18n from "@/i18n";
import {
  ensureConfigOption,
  normalizeConfigDisplayValue,
  runtimeConfigOptionCount,
  runtimeConfigOptionsToAgentOptions,
  selectedConfigOverride,
} from "@/app/workspace/chat-runtime-options";
import {
  getErrorMessage,
  getProjectDisplayName,
} from "@/app/workspace/workspace-display";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";
import { chatRuntimeProviderKey } from "@/app/workspace/workspace-runtime-keys";
import { EMPTY_MESSAGES } from "@/app/workspace/workspace-thread-types";
import {
  chatLoadSuspenseQueryOptions,
  chatRuntimeConfigQueryOptions,
} from "@/features/chat/api/queries";
import { AssistantThread } from "@/features/chat/components/assistant-thread";
import { AppRuntimeProvider } from "@/features/chat/runtime/app-runtime-provider";
import { ChatOptionsProvider } from "@/features/chat/runtime/chat-options-context";
import {
  useChatRunConfig,
  useChatRunIsRunning,
  useChatRunMessages,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";

interface ActiveChatThreadProps {
  draftAgentConfig: DraftAgentConfig;
  onChatCreated: (chat: Chat) => void;
  onChatMessagesUpdated: ChatMessagesUpdateHandler;
  onChatUpdated: ChatUpdateHandler;
  projects: Project[];
  routeProjectId?: string;
  runtimeOptions: Array<{
    label: string;
    value: AgentRuntime;
  }>;
  selectedChat: Chat;
  setAgentModel: (model: string) => void;
  setAgentReasoningEffort: (effort: string) => void;
  setPersistedChatRuntime: (
    chatId: string,
    runtime: AgentRuntime,
  ) => Promise<void> | void;
}

type RestoredChatThreadProps = Omit<ActiveChatThreadProps, "selectedChat"> & {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  selectedChatId: string;
};

type ChatThreadRuntimeProps = ActiveChatThreadProps & {
  configLoading: boolean;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  keySuffix?: string;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
};

interface ChatProjectContext {
  id?: string;
  name?: string;
  path?: string;
  project?: Project;
}

export function ActiveChatThread({
  draftAgentConfig,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  projects,
  routeProjectId,
  runtimeOptions,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
}: ActiveChatThreadProps) {
  const runtimeConfig = useChatRunConfig(selectedChat.id);

  return (
    <ChatThreadRuntime
      configLoading={false}
      draftAgentConfig={draftAgentConfig}
      historyMessages={EMPTY_MESSAGES}
      historyRevision={0}
      keySuffix="active"
      onChatCreated={onChatCreated}
      onChatMessagesUpdated={onChatMessagesUpdated}
      onChatUpdated={onChatUpdated}
      projects={projects}
      routeProjectId={routeProjectId}
      runtimeOptions={runtimeOptions}
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setPersistedChatRuntime={setPersistedChatRuntime}
      slotKey={selectedChat.id}
    />
  );
}

export function RestoredChatThread({
  api,
  currentRoutePath,
  draftAgentConfig,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  projects,
  routeProjectId,
  runtimeOptions,
  selectedChatId,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
}: RestoredChatThreadProps) {
  const chatLoadQuery = useSuspenseQuery(
    chatLoadSuspenseQueryOptions({ api, chatId: selectedChatId }),
  );
  const chatLoadData = chatLoadQuery.data;
  const selectedChat = chatLoadData.chat;
  const liveRuntimeConfig = useChatRunConfig(selectedChatId);
  const inspectConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: selectedChat.cwd ?? undefined,
      enabled: !chatLoadData.config,
      runtime: selectedChat.runtime,
    }),
  });
  const runtimeConfig =
    liveRuntimeConfig ?? chatLoadData.config ?? inspectConfigQuery.data;
  const canonicalPath = chatRoutePath(selectedChat);

  if (canonicalPath !== currentRoutePath) {
    return <Redirect replace to={canonicalPath} />;
  }

  return (
    <ChatThreadRuntime
      configLoading={chatLoadQuery.isFetching || inspectConfigQuery.isFetching}
      draftAgentConfig={draftAgentConfig}
      historyMessages={chatLoadData.messages}
      historyRevision={chatLoadQuery.dataUpdatedAt}
      onChatCreated={onChatCreated}
      onChatMessagesUpdated={onChatMessagesUpdated}
      onChatUpdated={onChatUpdated}
      projects={projects}
      routeProjectId={routeProjectId}
      runtimeOptions={runtimeOptions}
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setPersistedChatRuntime={setPersistedChatRuntime}
      slotKey={selectedChatId}
    />
  );
}

function ChatThreadRuntime({
  configLoading,
  draftAgentConfig,
  historyMessages,
  historyRevision,
  keySuffix,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  projects,
  routeProjectId,
  runtimeOptions,
  runtimeConfig,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
  slotKey,
}: ChatThreadRuntimeProps) {
  const { t } = useTranslation();
  const setRunMode = useChatRunStore((state) => state.setMode);
  const setRunPermissionMode = useChatRunStore(
    (state) => state.setPermissionMode,
  );
  const isRunning = useChatRunIsRunning(slotKey);
  const liveMessages = useChatRunMessages(slotKey);
  const chatRuntime = selectedChat.runtime as AgentRuntime;
  const hasStarted =
    Boolean(selectedChat.remoteThreadId) ||
    historyMessages.length > 0 ||
    liveMessages.length > 0;
  const canSetRuntime = !hasStarted && !isRunning;
  const runtimeDisabledReason = isRunning
    ? t("composer.disabledReasons.agentCannotChangeWhileRunning")
    : hasStarted
      ? t("composer.disabledReasons.agentCannotChangeAfterStart")
      : undefined;
  const projectContext = chatProjectContext(
    routeProjectId,
    selectedChat,
    projects,
  );
  const activeModel = normalizeConfigDisplayValue(
    draftAgentConfig.model ?? runtimeConfig?.currentModel,
  );
  const activeReasoningEffort = normalizeConfigDisplayValue(
    draftAgentConfig.reasoningEffort ?? runtimeConfig?.currentReasoningEffort,
  );
  const activeMode = normalizeConfigDisplayValue(
    runtimeConfig?.agentState?.currentMode ??
      runtimeConfig?.currentMode ??
      draftAgentConfig.mode,
  );
  const activePermissionMode = normalizeConfigDisplayValue(
    runtimeConfig?.agentState?.currentPermissionMode ??
      runtimeConfig?.currentPermissionMode ??
      draftAgentConfig.permissionMode,
  );
  const modelOverride = selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride = selectedConfigOverride(
    draftAgentConfig.reasoningEffort,
  );
  const setBackendMode = useCallback(
    async (mode: string) => {
      const modeOverride = selectedConfigOverride(mode);
      if (!modeOverride) return;
      await setRunMode(slotKey, modeOverride);
    },
    [setRunMode, slotKey],
  );
  const setBackendPermissionMode = useCallback(
    async (mode: string) => {
      const modeOverride = selectedConfigOverride(mode);
      if (!modeOverride) return;
      await setRunPermissionMode(slotKey, modeOverride);
    },
    [setRunPermissionMode, slotKey],
  );
  const setRuntime = useCallback(
    async (runtime: AgentRuntime) => {
      if (!canSetRuntime) return;
      await setPersistedChatRuntime(selectedChat.id, runtime);
    },
    [canSetRuntime, selectedChat.id, setPersistedChatRuntime],
  );
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.models,
      t("common.useDefault"),
    ),
    activeModel,
    t("common.useDefault"),
    t("common.default"),
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.reasoningEfforts,
      t("common.useDefault"),
    ),
    activeReasoningEffort,
    t("common.useDefault"),
    t("common.default"),
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.modes,
      t("common.useDefault"),
    ),
    activeMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const permissionModeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.permissionModes,
      t("common.useDefault"),
    ),
    activePermissionMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelOptionCount = runtimeConfigOptionCount(runtimeConfig?.models);
  const reasoningEffortOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.reasoningEfforts,
  );
  const modeOptionCount = runtimeConfigOptionCount(runtimeConfig?.modes);
  const permissionModeOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.permissionModes,
  );
  const chatOptions = useMemo(
    () => ({
      canSetModel: runtimeConfig?.canSetModel ?? true,
      canSetMode: runtimeConfig?.canSetMode ?? true,
      canSetPermissionMode: runtimeConfig?.canSetPermissionMode ?? true,
      canSetReasoningEffort: runtimeConfig?.canSetReasoningEffort ?? true,
      canSetRuntime,
      configLoading,
      model: activeModel,
      modelOptionCount,
      modelOptions,
      mode: activeMode,
      modeOptionCount,
      modeOptions,
      permissionMode: activePermissionMode,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtime: chatRuntime,
      runtimeDisabledReason,
      runtimeOptions,
      setModel: setAgentModel,
      setMode: setBackendMode,
      setPermissionMode: setBackendPermissionMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime,
    }),
    [
      activeMode,
      activeModel,
      activePermissionMode,
      activeReasoningEffort,
      chatRuntime,
      configLoading,
      modelOptionCount,
      modelOptions,
      modeOptionCount,
      modeOptions,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtimeOptions,
      runtimeConfig?.canSetPermissionMode,
      runtimeConfig?.canSetMode,
      runtimeConfig?.canSetModel,
      runtimeConfig?.canSetReasoningEffort,
      canSetRuntime,
      runtimeDisabledReason,
      setAgentModel,
      setBackendPermissionMode,
      setAgentReasoningEffort,
      setBackendMode,
      setRuntime,
    ],
  );

  return (
    <ChatOptionsProvider value={chatOptions}>
      <AppRuntimeProvider
        chatId={selectedChat.id}
        historyMessages={historyMessages}
        historyRevision={historyRevision}
        key={chatRuntimeProviderKey(selectedChat.id, chatRuntime, keySuffix)}
        model={modelOverride}
        mode={undefined}
        onChatCreated={onChatCreated}
        onChatMessagesUpdated={onChatMessagesUpdated}
        onChatUpdated={onChatUpdated}
        projectId={projectContext.id ?? selectedChat.projectId ?? null}
        projectPath={projectContext.path ?? undefined}
        permissionMode={undefined}
        reasoningEffort={reasoningEffortOverride}
        runtime={chatRuntime}
        runtimeConfig={runtimeConfig}
        slotKey={slotKey}
      >
        <AssistantThread projectName={projectContext.name} />
      </AppRuntimeProvider>
    </ChatOptionsProvider>
  );
}

export class ChatRestoreErrorBoundary extends Component<
  { children: ReactNode },
  { error?: unknown; failed: boolean }
> {
  state: { error?: unknown; failed: boolean } = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Chat restore failed", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background p-4">
          <div
            className="
              flex max-w-xl items-start gap-3 rounded-lg border
              border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-950
              shadow-sm
              dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100
            "
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-300" />
            <div className="min-w-0">
              <div className="font-medium">
                {i18n.t("notifications.chatActionFailed")}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[13px]/5 text-rose-900/90 dark:text-rose-100/85">
                {getErrorMessage(this.state.error)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function chatProjectContext(
  routeProjectId: string | undefined,
  chat: Chat,
  projects: Project[],
): ChatProjectContext {
  const projectId = routeProjectId ?? chat.projectId ?? undefined;
  const project = projectId
    ? projects.find((item) => item.id === projectId)
    : undefined;
  const path =
    project?.path ?? (projectId ? (chat.cwd ?? undefined) : undefined);

  return {
    id: projectId,
    name: path ? getProjectDisplayName(path) : undefined,
    path,
    project,
  };
}
