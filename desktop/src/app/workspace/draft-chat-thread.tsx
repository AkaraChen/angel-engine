import { AppRuntimeProvider } from "@/features/chat/runtime/app-runtime-provider";
import {
  ChatOptionsProvider,
  type ChatOptionsContextValue,
} from "@/features/chat/runtime/chat-options-context";
import { AssistantThread } from "@/features/chat/components/assistant-thread";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";
import {
  EMPTY_MESSAGES,
  type ChatUpdateHandler,
} from "./workspace-thread-types";
import type { AgentRuntime } from "@/shared/agents";
import type { Chat, ChatRuntimeConfig } from "@/shared/chat";
import type { Project } from "@/shared/projects";

type DraftChatThreadProps = {
  chatOptions: ChatOptionsContextValue;
  model?: string;
  mode?: string;
  onChatCreated: (chat: Chat) => void;
  onChatUpdated: ChatUpdateHandler;
  onProjectChange: (projectId: string | null) => void;
  permissionMode?: string;
  prewarmId?: string;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  projects: Project[];
  reasoningEffort?: string;
  runtime: AgentRuntime;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
};

export function DraftChatThread({
  chatOptions,
  model,
  mode,
  onChatCreated,
  onChatUpdated,
  onProjectChange,
  permissionMode,
  prewarmId,
  projectId,
  projectName,
  projectPath,
  projects,
  reasoningEffort,
  runtime,
  runtimeConfig,
  slotKey,
}: DraftChatThreadProps) {
  return (
    <ChatOptionsProvider value={chatOptions}>
      <AppRuntimeProvider
        historyMessages={EMPTY_MESSAGES}
        historyRevision={0}
        model={model}
        mode={mode}
        onChatCreated={onChatCreated}
        onChatUpdated={onChatUpdated}
        prewarmId={prewarmId}
        projectId={projectId ?? null}
        projectPath={projectPath}
        permissionMode={permissionMode}
        reasoningEffort={reasoningEffort}
        runtime={runtime}
        runtimeConfig={runtimeConfig}
        slotKey={slotKey}
      >
        <AssistantThread
          composerFloatingAccessory={
            <DraftProjectSelect
              onProjectChange={onProjectChange}
              projects={projects}
              selectedProjectId={projectId}
            />
          }
          projectName={projectName}
        />
      </AppRuntimeProvider>
    </ChatOptionsProvider>
  );
}
