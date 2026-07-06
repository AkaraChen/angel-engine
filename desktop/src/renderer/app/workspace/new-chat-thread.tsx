import type { AgentRuntime } from "@shared/agents";
import type {
  Chat,
  ChatCreationLocation,
  ChatRuntimeConfig,
} from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ReactNode } from "react";
import type {
  ChatMessagesUpdateHandler,
  ChatRunOrigin,
  ChatUpdateHandler,
} from "./workspace-thread-types";
import type { ChatOptionsContextValue } from "@/features/chat/runtime/chat-options-context";
import is from "@sindresorhus/is";
import { useLayoutEffect, useMemo } from "react";
import { NewChatComposer } from "@/app/workspace/new-chat-composer";
import { ChatEnvironmentProvider } from "@/features/chat/runtime/chat-environment-context";
import { ChatOptionsProvider } from "@/features/chat/runtime/chat-options-context";
import { ChatRuntimeActionsProvider } from "@/features/chat/runtime/chat-runtime-actions-context";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { useAgentSkills } from "@/features/chat/state/use-agent-skills";
import { EMPTY_MESSAGES } from "./workspace-thread-types";

const EMPTY_AVAILABLE_COMMANDS: NonNullable<
  ChatRuntimeConfig["availableCommands"]
> = [];

interface NewChatThreadProps {
  chatOptions: ChatOptionsContextValue;
  creationLocation?: ChatCreationLocation;
  creationLocationAccessory?: ReactNode;
  cwd?: string;
  model?: string;
  mode?: string;
  onChatCreated: ChatUpdateHandler;
  onChatMessagesUpdated: ChatMessagesUpdateHandler;
  onChatUpdated: ChatUpdateHandler;
  onBeforeSubmit?: () => boolean | Promise<boolean>;
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  permissionMode?: string;
  prewarmId?: string;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  projects: Project[];
  reasoningEffort?: string;
  runOrigin: ChatRunOrigin;
  runtime: AgentRuntime;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
}

export function NewChatThread({
  chatOptions,
  creationLocation,
  creationLocationAccessory,
  cwd,
  model,
  mode,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  onBeforeSubmit,
  onCreateProject,
  onProjectChange,
  permissionMode,
  prewarmId,
  projectId,
  projectName,
  projectPath,
  projects,
  reasoningEffort,
  runOrigin,
  runtime,
  runtimeConfig,
  slotKey,
}: NewChatThreadProps) {
  const initializeSlot = useChatRunStore((state) => state.initializeSlot);

  const handleChatCreated = (chat: Chat) => {
    onChatCreated(chat, undefined, undefined, runOrigin);
  };
  const handleChatUpdated: ChatUpdateHandler = (chat, messages, config) => {
    onChatUpdated(chat, messages, config, runOrigin);
  };

  const { availableSkills, availableSkillsLoading } = useAgentSkills({
    projectPath,
    runtime,
  });
  const chatEnvironment = useMemo(
    () => ({
      availableCommands:
        runtimeConfig?.availableCommands ?? EMPTY_AVAILABLE_COMMANDS,
      availableCommandsLoading: runtimeConfig === undefined,
      availableSkills,
      availableSkillsLoading,
      isProjectChat:
        is.nonEmptyString(projectId) && is.nonEmptyString(projectPath),
      projectId,
      projectPath,
    }),
    [
      availableSkills,
      availableSkillsLoading,
      projectId,
      projectPath,
      runtimeConfig,
    ],
  );

  useLayoutEffect(() => {
    initializeSlot({
      chatId: undefined,
      config: runtimeConfig,
      historyMessages: EMPTY_MESSAGES,
      historyRevision: 0,
      slotKey,
    });
  }, [initializeSlot, runtimeConfig, slotKey]);

  return (
    <ChatOptionsProvider value={chatOptions}>
      <ChatEnvironmentProvider value={chatEnvironment}>
        <ChatRuntimeActionsProvider slotKey={slotKey}>
          <NewChatComposer
            creationLocation={creationLocation}
            creationLocationAccessory={creationLocationAccessory}
            cwd={cwd}
            model={model}
            mode={mode}
            onBeforeSubmit={onBeforeSubmit}
            onChatCreated={handleChatCreated}
            onChatMessagesUpdated={onChatMessagesUpdated}
            onChatUpdated={handleChatUpdated}
            onCreateProject={onCreateProject}
            onProjectChange={onProjectChange}
            permissionMode={permissionMode}
            prewarmId={prewarmId}
            projectId={projectId}
            projectName={projectName}
            projects={projects}
            reasoningEffort={reasoningEffort}
            runtime={runtime}
            slotKey={slotKey}
          />
        </ChatRuntimeActionsProvider>
      </ChatEnvironmentProvider>
    </ChatOptionsProvider>
  );
}
