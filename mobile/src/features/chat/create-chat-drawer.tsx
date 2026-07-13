import type { FormEvent } from "react";
import type { CreateChatInput } from "@/platform/chat-types";

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
import {
  AGENT_OPTIONS,
  DEFAULT_AGENT_RUNTIME,
  REASONING_EFFORT_OPTIONS,
} from "@/platform/agent-catalog";

import { basename } from "./chat-summary";
import {
  useCreateChat,
  useProjectList,
  useProjectWorktrees,
} from "./use-chats";

type WorktreeMode = "existing" | "create";

interface CreateChatFormState {
  projectId: string;
  prompt: string;
  runtime: string;
  model: string;
  reasoningEffort: string;
  useWorktree: boolean;
  worktreeMode: WorktreeMode;
  worktreeBranch: string;
}

const INITIAL_STATE: CreateChatFormState = {
  projectId: "",
  prompt: "",
  runtime: DEFAULT_AGENT_RUNTIME,
  model: "",
  reasoningEffort: "",
  useWorktree: false,
  worktreeMode: "existing",
  worktreeBranch: "",
};

export function CreateChatDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateChatFormState>(INITIAL_STATE);
  const [, navigate] = useLocation();

  const projectsQuery = useProjectList();
  const worktreesQuery = useProjectWorktrees(
    form.projectId.length > 0 ? form.projectId : undefined,
  );
  const createChat = useCreateChat();

  function update<K extends keyof CreateChatFormState>(
    key: K,
    value: CreateChatFormState[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function reset() {
    setForm(INITIAL_STATE);
    createChat.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = form.prompt.trim();
    if (prompt.length === 0) return;

    const branch = form.worktreeBranch.trim();
    const input: CreateChatInput = {
      prompt,
      runtime: form.runtime,
      projectId: form.projectId.length > 0 ? form.projectId : undefined,
      model: form.model.trim().length > 0 ? form.model.trim() : undefined,
      reasoningEffort:
        form.reasoningEffort.length > 0 ? form.reasoningEffort : undefined,
      useWorktree: form.useWorktree,
      worktreeBranch:
        form.useWorktree && branch.length > 0 ? branch : undefined,
      createWorktree: form.useWorktree && form.worktreeMode === "create",
    };

    const result = await createChat.mutateAsync(input);
    setOpen(false);
    reset();
    navigate(`/chat/${result.chatId}`);
  }

  const canSubmit = form.prompt.trim().length > 0 && !createChat.isPending;

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
                  update("projectId", event.target.value);
                  update("worktreeBranch", "");
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
                id="new-chat-agent"
                value={form.runtime}
                onChange={(event) => update("runtime", event.target.value)}
              >
                {AGENT_OPTIONS.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>
                    {agent.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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

            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <label
                className="flex items-center justify-between gap-3"
                htmlFor="new-chat-worktree"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Use worktree</span>
                  <span className="text-xs text-muted-foreground">
                    Run in an isolated git worktree
                  </span>
                </span>
                <Switch
                  checked={form.useWorktree}
                  disabled={form.projectId.length === 0}
                  id="new-chat-worktree"
                  onCheckedChange={(checked) => update("useWorktree", checked)}
                />
              </label>

              {form.useWorktree ? (
                <WorktreeFields
                  branchInputId="new-chat-branch"
                  mode={form.worktreeMode}
                  branch={form.worktreeBranch}
                  worktrees={worktreesQuery.data ?? []}
                  loading={worktreesQuery.isPending}
                  onModeChange={(mode) => {
                    update("worktreeMode", mode);
                    update("worktreeBranch", "");
                  }}
                  onBranchChange={(branch) => update("worktreeBranch", branch)}
                />
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

function WorktreeFields({
  branch,
  branchInputId,
  loading,
  mode,
  onBranchChange,
  onModeChange,
  worktrees,
}: {
  branch: string;
  branchInputId: string;
  loading: boolean;
  mode: WorktreeMode;
  onBranchChange: (branch: string) => void;
  onModeChange: (mode: WorktreeMode) => void;
  worktrees: { branch: string; cwd: string; isMain: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={mode === "existing"}
          label="Existing"
          onClick={() => onModeChange("existing")}
        />
        <ModeButton
          active={mode === "create"}
          label="Create new"
          onClick={() => onModeChange("create")}
        />
      </div>

      {mode === "existing" ? (
        <Field htmlFor={branchInputId} label="Branch">
          <NativeSelect
            className="w-full"
            disabled={loading}
            id={branchInputId}
            value={branch}
            onChange={(event) => onBranchChange(event.target.value)}
          >
            <NativeSelectOption value="">Select a branch</NativeSelectOption>
            {worktrees.map((worktree) => (
              <NativeSelectOption key={worktree.cwd} value={worktree.branch}>
                {worktree.branch}
                {worktree.isMain ? " (main)" : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field htmlFor={branchInputId} label="New branch name">
          <Input
            id={branchInputId}
            placeholder="feature/my-change"
            value={branch}
            onChange={(event) => onBranchChange(event.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="w-full"
      onClick={onClick}
      size="sm"
      type="button"
      variant={active ? "default" : "outline"}
    >
      {label}
    </Button>
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
