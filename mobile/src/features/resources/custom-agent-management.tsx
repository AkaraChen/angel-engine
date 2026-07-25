import type {
  CreateCustomAgentInput,
  CustomAgent,
} from "@angel-engine/daemon-api/agents";
import type { FC, FormEvent, ReactNode } from "react";

import { PencilSimple, Plus, Robot, Trash } from "@phosphor-icons/react";
import { useId, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsSection } from "@/features/settings/settings-section";

import { ResourceState } from "./project-management";
import {
  useCreateCustomAgent,
  useCustomAgentDeleteImpact,
  useCustomAgentList,
  useDeleteCustomAgent,
  useUpdateCustomAgent,
} from "./use-resources";

interface CustomAgentDraft {
  args: string;
  autoAuthenticate: boolean;
  command: string;
  environment: string;
  label: string;
  needAuth: boolean;
}

type CustomAgentDraftAction =
  | {
      field: keyof CustomAgentDraft;
      type: "change";
      value: boolean | string;
    }
  | { agent?: CustomAgent; type: "reset" };

function customAgentDraft(agent: CustomAgent | undefined): CustomAgentDraft {
  return {
    args: agent?.args.join("\n") ?? "",
    autoAuthenticate: agent?.autoAuthenticate ?? false,
    command: agent?.command ?? "",
    environment:
      agent?.environment
        .map((variable) => `${variable.name}=${variable.value}`)
        .join("\n") ?? "",
    label: agent?.label ?? "",
    needAuth: agent?.needAuth ?? false,
  };
}

function customAgentDraftReducer(
  state: CustomAgentDraft,
  action: CustomAgentDraftAction,
): CustomAgentDraft {
  if (action.type === "reset") return customAgentDraft(action.agent);
  return { ...state, [action.field]: action.value };
}

type CustomAgentFormDrawerProps = {
  agent?: CustomAgent;
  children: ReactNode;
  onSaved?: (agent: CustomAgent) => void;
};

export const CustomAgentFormDrawer: FC<CustomAgentFormDrawerProps> = ({
  agent,
  children,
  onSaved,
}) => {
  const { t } = useTranslation();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [draft, dispatch] = useReducer(
    customAgentDraftReducer,
    agent,
    customAgentDraft,
  );
  const createAgent = useCreateCustomAgent();
  const updateAgent = useUpdateCustomAgent();
  const isPending = createAgent.isPending || updateAgent.isPending;
  const canSave =
    draft.label.trim().length > 0 && draft.command.trim().length > 0;

  function reset() {
    dispatch({ agent, type: "reset" });
    createAgent.reset();
    updateAgent.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || isPending) return;

    const input: CreateCustomAgentInput = {
      args: lines(draft.args),
      autoAuthenticate: draft.autoAuthenticate,
      command: draft.command.trim(),
      environment: environmentVariables(draft.environment),
      label: draft.label.trim(),
      needAuth: draft.needAuth,
    };

    try {
      const saved =
        agent === undefined
          ? await createAgent.mutateAsync(input)
          : await updateAgent.mutateAsync({ ...input, id: agent.id });
      onSaved?.(saved);
      setOpen(false);
      reset();
    } catch {
      toast.error(t("settings.customAgents.saveError"));
    }
  }

  function change<K extends keyof CustomAgentDraft>(
    field: K,
    value: CustomAgentDraft[K],
  ) {
    dispatch({ field, type: "change", value });
  }

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
          <DrawerTitle>
            {agent === undefined
              ? t("settings.customAgents.createTitle")
              : t("settings.customAgents.editTitle")}
          </DrawerTitle>
          <DrawerDescription>
            {t("settings.customAgents.formDescription")}
          </DrawerDescription>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            <FormField
              htmlFor={`${formId}-label`}
              label={t("settings.customAgents.nameLabel")}
            >
              <Input
                autoComplete="off"
                id={`${formId}-label`}
                value={draft.label}
                onChange={(event) => change("label", event.currentTarget.value)}
              />
            </FormField>
            <FormField
              htmlFor={`${formId}-command`}
              label={t("settings.customAgents.commandLabel")}
            >
              <Input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                id={`${formId}-command`}
                placeholder={t("settings.customAgents.commandPlaceholder")}
                spellCheck={false}
                value={draft.command}
                onChange={(event) =>
                  change("command", event.currentTarget.value)
                }
              />
            </FormField>
            <FormField
              htmlFor={`${formId}-args`}
              label={t("settings.customAgents.argsLabel")}
            >
              <Textarea
                className="min-h-20 font-mono text-sm"
                id={`${formId}-args`}
                placeholder={t("settings.customAgents.argsPlaceholder")}
                value={draft.args}
                onChange={(event) => change("args", event.currentTarget.value)}
              />
            </FormField>
            <FormField
              htmlFor={`${formId}-environment`}
              label={t("settings.customAgents.environmentLabel")}
            >
              <Textarea
                autoCapitalize="none"
                autoCorrect="off"
                className="min-h-20 font-mono text-sm"
                id={`${formId}-environment`}
                placeholder={t("settings.customAgents.environmentPlaceholder")}
                spellCheck={false}
                value={draft.environment}
                onChange={(event) =>
                  change("environment", event.currentTarget.value)
                }
              />
            </FormField>
            <div className="rounded-lg border border-border">
              <SwitchRow
                checked={draft.needAuth}
                id={`${formId}-need-auth`}
                label={t("settings.customAgents.needAuth")}
                onCheckedChange={(checked) => change("needAuth", checked)}
              />
              <SwitchRow
                checked={draft.autoAuthenticate}
                id={`${formId}-auto-authenticate`}
                label={t("settings.customAgents.autoAuthenticate")}
                onCheckedChange={(checked) =>
                  change("autoAuthenticate", checked)
                }
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1"
              disabled={!canSave || isPending}
              type="submit"
            >
              {isPending ? <Spinner /> : null}
              {t("common.save")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};

export function CustomAgentsSettingsSection() {
  const { t } = useTranslation();
  const agents = useCustomAgentList();
  const impact = useCustomAgentDeleteImpact();
  const deleteAgent = useDeleteCustomAgent();
  const [deleteTarget, setDeleteTarget] = useState<{
    agent: CustomAgent;
    chatCount: number;
  } | null>(null);

  async function prepareDelete(agent: CustomAgent) {
    try {
      const result = await impact.mutateAsync(agent.id);
      setDeleteTarget({ agent, chatCount: result.chatCount });
    } catch {
      toast.error(t("settings.customAgents.deleteError"));
    }
  }

  async function confirmDelete() {
    if (deleteTarget === null) return;
    try {
      await deleteAgent.mutateAsync(deleteTarget.agent.id);
      setDeleteTarget(null);
    } catch {
      toast.error(t("settings.customAgents.deleteError"));
    }
  }

  return (
    <>
      <SettingsSection
        description={t("settings.customAgents.description")}
        title={t("settings.customAgents.title")}
      >
        {agents.isPending ? (
          <ResourceState>
            <Spinner className="size-4 text-muted-foreground" />
          </ResourceState>
        ) : agents.isError ? (
          <ResourceState>
            <span>{t("settings.customAgents.loadError")}</span>
            <Button
              onClick={() => void agents.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.tryAgain")}
            </Button>
          </ResourceState>
        ) : agents.data.length === 0 ? (
          <ResourceState>{t("settings.customAgents.empty")}</ResourceState>
        ) : (
          agents.data.map((agent) => (
            <div className="flex items-center gap-3 p-4" key={agent.id}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Robot size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {agent.label}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {[agent.command, ...agent.args].join(" ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <CustomAgentFormDrawer agent={agent}>
                  <Button
                    aria-label={t("settings.customAgents.editAction", {
                      name: agent.label,
                    })}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <PencilSimple />
                  </Button>
                </CustomAgentFormDrawer>
                <Button
                  aria-label={t("settings.customAgents.deleteAction", {
                    name: agent.label,
                  })}
                  disabled={impact.isPending}
                  onClick={() => void prepareDelete(agent)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash />
                </Button>
              </span>
            </div>
          ))
        )}
        <div className="p-3">
          <CustomAgentFormDrawer>
            <Button className="w-full" type="button" variant="outline">
              <Plus />
              {t("settings.customAgents.add")}
            </Button>
          </CustomAgentFormDrawer>
        </div>
      </SettingsSection>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteAgent.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("settings.customAgents.deleteTitle", {
                name: deleteTarget?.agent.label ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.chatCount
                ? t("settings.customAgents.deleteWithChats", {
                    count: deleteTarget.chatCount,
                  })
                : t("settings.customAgents.deleteWithoutChats")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAgent.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              disabled={deleteAgent.isPending}
              onClick={() => void confirmDelete()}
              variant="destructive"
            >
              {deleteAgent.isPending ? <Spinner /> : null}
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FormField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
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

function SwitchRow({
  checked,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-b-0">
      <Label className="flex-1" htmlFor={id}>
        {label}
      </Label>
      <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function environmentVariables(
  value: string,
): CreateCustomAgentInput["environment"] {
  return lines(value).map((line) => {
    const separator = line.indexOf("=");
    return separator < 0
      ? { name: line, value: "" }
      : {
          name: line.slice(0, separator).trim(),
          value: line.slice(separator + 1),
        };
  });
}
