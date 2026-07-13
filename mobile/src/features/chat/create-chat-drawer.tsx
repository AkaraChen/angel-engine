import type { FormEvent } from "react";
import type { CreateChatFormState } from "./create-chat-form";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { REASONING_EFFORT_OPTIONS } from "@/platform/agent-catalog";

import { basename } from "./chat-summary";
import {
  buildCreateChatInput,
  canSubmitCreateChat,
  canUseWorktree,
  INITIAL_CREATE_CHAT_FORM,
  reconcileRuntime,
} from "./create-chat-form";
import { stashNewChatPrompt } from "./new-chat-prompt";
import { useAgentList, useCreateChat, useProjectList } from "./use-chats";

export function CreateChatDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateChatFormState>(
    INITIAL_CREATE_CHAT_FORM,
  );
  const [, navigate] = useLocation();

  const projectsQuery = useProjectList();
  const agentsQuery = useAgentList();
  const createChat = useCreateChat();

  // The daemon's agent list is authoritative — no built-in fallback. The
  // effective runtime is derived (not stored) so it always points at a returned
  // agent (defaulting to the first); we never submit one the daemon didn't
  // offer, and there's no effect syncing state to props.
  const agents = agentsQuery.data ?? [];
  const runtimeIds: string[] = agents.map((agent) => agent.id);
  const runtime = reconcileRuntime(form.runtime, runtimeIds);
  const submitForm: CreateChatFormState = { ...form, runtime };

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
    if (!canSubmitCreateChat(submitForm, runtimeIds)) return;

    try {
      const chat = await createChat.mutateAsync(
        buildCreateChatInput(submitForm),
      );
      stashNewChatPrompt(chat.id, submitForm.prompt);
      setOpen(false);
      reset();
      navigate(`/chat/${chat.id}`);
    } catch {
      // The mutation's error state drives the inline message below; swallow the
      // rejection here so it isn't an unhandled promise.
    }
  }

  const agentsUnavailable = agentsQuery.isSuccess && agents.length === 0;
  const canSubmit =
    canSubmitCreateChat(submitForm, runtimeIds) && !createChat.isPending;

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
          <DrawerTitle>New chat</DrawerTitle>
          <DrawerDescription>
            Start an agent session in a project or worktree.
          </DrawerDescription>
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            <Field htmlFor="new-chat-prompt" label="Initial prompt">
              <Textarea
                autoFocus
                id="new-chat-prompt"
                placeholder="What should the agent work on?"
                rows={3}
                value={form.prompt}
                onChange={(event) => update("prompt", event.target.value)}
              />
            </Field>

            <Field htmlFor="new-chat-project" label="Project">
              <NativeSelect
                className="w-full"
                disabled={projectsQuery.isPending}
                id="new-chat-project"
                value={form.projectId}
                onChange={(event) => {
                  const projectId = event.target.value;
                  setForm((previous) => ({
                    ...previous,
                    projectId,
                    // A worktree can't outlive its project, so clearing the
                    // project disables the worktree option.
                    useWorktree:
                      projectId.length > 0 ? previous.useWorktree : false,
                  }));
                }}
              >
                <NativeSelectOption value="">
                  No project (ad hoc)
                </NativeSelectOption>
                {(projectsQuery.data ?? []).map((project) => (
                  <NativeSelectOption key={project.id} value={project.id}>
                    {basename(project.path)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field htmlFor="new-chat-agent" label="Agent">
              <NativeSelect
                className="w-full"
                disabled={agentsQuery.isPending || agents.length === 0}
                id="new-chat-agent"
                value={runtime}
                onChange={(event) => update("runtime", event.target.value)}
              >
                {agentsQuery.isPending ? (
                  <NativeSelectOption value="">Loading…</NativeSelectOption>
                ) : null}
                {agents.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>
                    {agent.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {agentsQuery.isError ? (
                <p className="text-xs text-destructive">
                  Couldn&apos;t load agents from the daemon.
                </p>
              ) : agentsUnavailable ? (
                <p className="text-xs text-destructive">
                  No agents are available. Enable one in the desktop app first.
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="new-chat-model" label="Model">
                <Input
                  id="new-chat-model"
                  placeholder="Default"
                  value={form.model}
                  onChange={(event) => update("model", event.target.value)}
                />
              </Field>
              <Field htmlFor="new-chat-reasoning" label="Reasoning">
                <NativeSelect
                  className="w-full"
                  id="new-chat-reasoning"
                  value={form.reasoningEffort}
                  onChange={(event) =>
                    update("reasoningEffort", event.target.value)
                  }
                >
                  {REASONING_EFFORT_OPTIONS.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <label
                className="flex items-center justify-between gap-3"
                htmlFor="new-chat-worktree"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    Run in a new worktree
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Isolate this chat in its own git worktree
                  </span>
                </span>
                <Switch
                  checked={form.useWorktree}
                  disabled={!canUseWorktree(form)}
                  id="new-chat-worktree"
                  onCheckedChange={(checked) => update("useWorktree", checked)}
                />
              </label>

              {!canUseWorktree(form) ? (
                <p className="text-xs text-muted-foreground">
                  Select a project to run in a worktree.
                </p>
              ) : null}
            </div>

            {createChat.isError ? (
              <p className="text-sm text-destructive">
                Couldn&apos;t create the chat. Check the daemon connection and
                try again.
              </p>
            ) : null}
          </div>

          <DrawerFooter className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerClose asChild>
              <Button className="flex-1" type="button" variant="outline">
                Cancel
              </Button>
            </DrawerClose>
            <Button className="flex-1" disabled={!canSubmit} type="submit">
              {createChat.isPending ? <Spinner /> : null}
              Create chat
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
