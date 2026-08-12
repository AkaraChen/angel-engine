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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const DEFAULT_SELECT_VALUE = "__default__";
const NO_PROJECT_SELECT_VALUE = "__no_project__";

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
              <Select
                disabled={projectsQuery.isPending}
                value={form.projectId || NO_PROJECT_SELECT_VALUE}
                onValueChange={(value) => {
                  const projectId =
                    value === NO_PROJECT_SELECT_VALUE ? "" : value;
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
                <SelectTrigger className="w-full" id="new-chat-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT_SELECT_VALUE}>
                    {t("createChat.noProject")}
                  </SelectItem>
                  {(projectsQuery.data ?? []).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {basename(project.path)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {canUseWorktree(form) ? (
              <Field htmlFor="new-chat-location" label="Create in">
                <Select
                  value={form.useWorktree ? "worktree" : "project"}
                  onValueChange={(value) =>
                    update("useWorktree", value === "worktree")
                  }
                >
                  <SelectTrigger className="w-full" id="new-chat-location">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="worktree">Create worktree</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field htmlFor="new-chat-agent" label={t("createChat.agentLabel")}>
              <Select
                value={form.runtime}
                onValueChange={(runtime) => {
                  setForm((previous) => ({
                    ...previous,
                    model: "",
                    reasoningEffort: "",
                    runtime,
                  }));
                }}
              >
                <SelectTrigger className="w-full" id="new-chat-agent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                htmlFor="new-chat-model"
                label={t("createChat.modelLabel")}
              >
                <Select
                  disabled={
                    runtimeConfigQuery.isFetching ||
                    runtimeConfigQuery.data?.canSetModel === false
                  }
                  value={form.model || DEFAULT_SELECT_VALUE}
                  onValueChange={(value) =>
                    update("model", value === DEFAULT_SELECT_VALUE ? "" : value)
                  }
                >
                  <SelectTrigger className="w-full" id="new-chat-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_SELECT_VALUE}>
                      {t("createChat.reasoningOptions.default")}
                    </SelectItem>
                    {(runtimeConfigQuery.data?.models ?? []).map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                htmlFor="new-chat-reasoning"
                label={t("createChat.reasoningLabel")}
              >
                <Select
                  disabled={
                    runtimeConfigQuery.isFetching ||
                    runtimeConfigQuery.data?.canSetReasoningEffort === false
                  }
                  value={form.reasoningEffort || DEFAULT_SELECT_VALUE}
                  onValueChange={(value) =>
                    update(
                      "reasoningEffort",
                      value === DEFAULT_SELECT_VALUE ? "" : value,
                    )
                  }
                >
                  <SelectTrigger className="w-full" id="new-chat-reasoning">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_SELECT_VALUE}>
                      {t("createChat.reasoningOptions.default")}
                    </SelectItem>
                    {(runtimeConfigQuery.data?.reasoningEfforts ?? []).map(
                      (option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
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
