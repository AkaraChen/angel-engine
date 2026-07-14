import type { FC, FormEvent, ReactNode } from "react";
import type { CreateChatFormState } from "./create-chat-form";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_OPTIONS } from "@/platform/agent-catalog";

import { basename } from "./chat-summary";
import {
  buildCreateChatInput,
  canSubmitCreateChat,
  canUseWorktree,
  INITIAL_CREATE_CHAT_FORM,
} from "./create-chat-form";
import { stashNewChatPrompt } from "./new-chat-prompt";
import {
  useAgentList,
  useCreateChat,
  useProjectList,
  useRuntimeConfig,
} from "./use-chats";

type CreateChatDrawerProps = {
  children: ReactNode;
};

export const CreateChatDrawer: FC<CreateChatDrawerProps> = ({ children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateChatFormState>(
    INITIAL_CREATE_CHAT_FORM,
  );
  const [, navigate] = useLocation();

  const projectsQuery = useProjectList();
  const agentsQuery = useAgentList();
  const createChat = useCreateChat();
  const selectedProject = projectsQuery.data?.find(
    (project) => project.id === form.projectId,
  );
  const runtimeConfigQuery = useRuntimeConfig({
    cwd: selectedProject?.path,
    enabled: open,
    runtime: form.runtime,
  });

  // Prefer the daemon's agent list; fall back to the built-in catalog while it
  // loads or if the daemon returns none.
  const agentOptions =
    agentsQuery.data !== undefined && agentsQuery.data.length > 0
      ? agentsQuery.data
      : AGENT_OPTIONS;

  function update<K extends keyof CreateChatFormState>(
    key: K,
    value: CreateChatFormState[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function reset() {
    setForm(INITIAL_CREATE_CHAT_FORM);
    createChat.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitCreateChat(form)) return;

    try {
      const chat = await createChat.mutateAsync(buildCreateChatInput(form));
      stashNewChatPrompt(chat.id, form.prompt);
      setOpen(false);
      reset();
      navigate(`/chat/${chat.id}`);
    } catch {
      // The mutation's error state drives the inline message below; swallow the
      // rejection here so it isn't an unhandled promise.
    }
  }

  const canSubmit = canSubmitCreateChat(form) && !createChat.isPending;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>{t("common.newChat")}</DrawerTitle>
          <DrawerDescription>{t("createChat.description")}</DrawerDescription>
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            <Field
              htmlFor="new-chat-prompt"
              label={t("createChat.promptLabel")}
            >
              <Textarea
                autoFocus
                id="new-chat-prompt"
                placeholder={t("createChat.promptPlaceholder")}
                rows={3}
                value={form.prompt}
                onChange={(event) => update("prompt", event.target.value)}
              />
            </Field>

            <Field
              htmlFor="new-chat-project"
              label={t("createChat.projectLabel")}
            >
              <NativeSelect
                className="w-full"
                disabled={projectsQuery.isPending}
                id="new-chat-project"
                value={form.projectId}
                onChange={(event) => {
                  const projectId = event.target.value;
                  setForm((previous) => ({
                    ...previous,
                    model: "",
                    projectId,
                    reasoningEffort: "",
                    // A worktree can't outlive its project, so clearing the
                    // project disables the worktree option.
                    useWorktree:
                      projectId.length > 0 ? previous.useWorktree : false,
                  }));
                }}
              >
                <NativeSelectOption value="">
                  {t("createChat.noProject")}
                </NativeSelectOption>
                {(projectsQuery.data ?? []).map((project) => (
                  <NativeSelectOption key={project.id} value={project.id}>
                    {basename(project.path)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            {canUseWorktree(form) ? (
              <Field htmlFor="new-chat-location" label="Create in">
                <NativeSelect
                  className="w-full"
                  id="new-chat-location"
                  value={form.useWorktree ? "worktree" : "project"}
                  onChange={(event) =>
                    update("useWorktree", event.target.value === "worktree")
                  }
                >
                  <NativeSelectOption value="project">
                    Project
                  </NativeSelectOption>
                  <NativeSelectOption value="worktree">
                    Create worktree
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            ) : null}

            <Field htmlFor="new-chat-agent" label={t("createChat.agentLabel")}>
              <NativeSelect
                className="w-full"
                id="new-chat-agent"
                value={form.runtime}
                onChange={(event) => {
                  const runtime = event.target.value;
                  setForm((previous) => ({
                    ...previous,
                    model: "",
                    reasoningEffort: "",
                    runtime,
                  }));
                }}
              >
                {agentOptions.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>
                    {agent.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                htmlFor="new-chat-model"
                label={t("createChat.modelLabel")}
              >
                <NativeSelect
                  className="w-full"
                  disabled={
                    runtimeConfigQuery.isFetching ||
                    runtimeConfigQuery.data?.canSetModel === false
                  }
                  id="new-chat-model"
                  value={form.model}
                  onChange={(event) => update("model", event.target.value)}
                >
                  <NativeSelectOption value="">
                    {t("createChat.reasoningOptions.default")}
                  </NativeSelectOption>
                  {(runtimeConfigQuery.data?.models ?? []).map((model) => (
                    <NativeSelectOption key={model.value} value={model.value}>
                      {model.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                htmlFor="new-chat-reasoning"
                label={t("createChat.reasoningLabel")}
              >
                <NativeSelect
                  className="w-full"
                  disabled={
                    runtimeConfigQuery.isFetching ||
                    runtimeConfigQuery.data?.canSetReasoningEffort === false
                  }
                  id="new-chat-reasoning"
                  value={form.reasoningEffort}
                  onChange={(event) =>
                    update("reasoningEffort", event.target.value)
                  }
                >
                  <NativeSelectOption value="">
                    {t("createChat.reasoningOptions.default")}
                  </NativeSelectOption>
                  {(runtimeConfigQuery.data?.reasoningEfforts ?? []).map(
                    (option) => (
                      <NativeSelectOption
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </Field>
            </div>

            {createChat.isError ? (
              <p className="text-sm text-destructive">
                {t("createChat.error")}
              </p>
            ) : null}
          </div>

          <DrawerFooter className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerClose asChild>
              <Button className="flex-1" type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
            <Button className="flex-1" disabled={!canSubmit} type="submit">
              {createChat.isPending ? <Spinner /> : null}
              {t("createChat.create")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};

type FieldProps = {
  children: ReactNode;
  htmlFor: string;
  label: string;
};

const Field: FC<FieldProps> = ({ children, htmlFor, label }) => {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
};
