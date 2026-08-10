import type {
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentRuntime,
} from "@angel-engine/daemon-api/agents";
import type { FC, FormEvent } from "react";

import { PencilSimple, Plus, Robot, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
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
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCustomAgentInput,
  createCustomAgentDraft,
  customAgentDraftReducer,
} from "@/features/settings/custom-agent-form";
import { SettingsSection } from "@/features/settings/settings-section";
import { useDaemonClient } from "@/platform/daemon-provider";

import {
  createCustomAgentMutationOptions,
  customAgentDeleteImpactQueryOptions,
  customAgentListQueryOptions,
  deleteCustomAgentMutationOptions,
  updateCustomAgentMutationOptions,
} from "./requests/management";

type CustomAgentFormTarget =
  | { mode: "create" }
  | { agent: CustomAgent; mode: "edit" };

export function CustomAgentsSection() {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const agentsQuery = useQuery(customAgentListQueryOptions({ daemon }));
  const createAgent = useMutation(
    createCustomAgentMutationOptions({ daemon, queryClient }),
  );
  const updateAgent = useMutation(
    updateCustomAgentMutationOptions({ daemon, queryClient }),
  );
  const [formTarget, setFormTarget] = useState<CustomAgentFormTarget | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CustomAgent | null>(null);

  return (
    <>
      <SettingsSection
        description={t("settings.customAgents.description")}
        title={t("settings.customAgents.title")}
      >
        {agentsQuery.isPending ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : agentsQuery.isError ? (
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-muted-foreground">
              {t("settings.customAgents.loadError")}
            </span>
            <Button
              onClick={() => void agentsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("common.tryAgain")}
            </Button>
          </div>
        ) : agentsQuery.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("settings.customAgents.empty")}
          </p>
        ) : (
          agentsQuery.data.map((agent) => (
            <div className="flex items-center gap-3 p-4" key={agent.id}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Robot className="size-5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {agent.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[agent.command, ...agent.args].join(" ")}
                </span>
              </span>
              <Button
                aria-label={t("settings.customAgents.editAria", {
                  name: agent.label,
                })}
                onClick={() => setFormTarget({ agent, mode: "edit" })}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <PencilSimple />
              </Button>
              <Button
                aria-label={t("settings.customAgents.deleteAria", {
                  name: agent.label,
                })}
                onClick={() => setDeleteTarget(agent)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash />
              </Button>
            </div>
          ))
        )}
        <div className="p-3">
          <Button
            className="w-full"
            onClick={() => setFormTarget({ mode: "create" })}
            type="button"
            variant="outline"
          >
            <Plus />
            {t("settings.customAgents.add")}
          </Button>
        </div>
      </SettingsSection>

      {formTarget !== null ? (
        <CustomAgentFormDrawer
          key={
            formTarget.mode === "edit"
              ? formTarget.agent.id
              : "create-custom-agent"
          }
          onClose={() => setFormTarget(null)}
          onSave={async (input) => {
            // Failures propagate to the drawer, which keeps the precise
            // daemon message near the action for correction and retry.
            if (formTarget.mode === "edit") {
              await updateAgent.mutateAsync({
                ...input,
                id: formTarget.agent.id,
              });
            } else {
              await createAgent.mutateAsync(input);
            }
            setFormTarget(null);
          }}
          pending={createAgent.isPending || updateAgent.isPending}
          target={formTarget}
        />
      ) : null}

      <CustomAgentDeleteDialog
        agent={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

interface CustomAgentFormDrawerProps {
  onClose: () => void;
  onSave: (input: CreateCustomAgentInput) => Promise<void>;
  pending: boolean;
  target: CustomAgentFormTarget;
}

const CustomAgentFormDrawer: FC<CustomAgentFormDrawerProps> = ({
  onClose,
  onSave,
  pending,
  target,
}) => {
  const { t } = useTranslation();
  const agent = target.mode === "edit" ? target.agent : null;
  const labelInputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [draft, updateDraft] = useReducer(
    customAgentDraftReducer,
    agent,
    createCustomAgentDraft,
  );
  const [touched, setTouched] = useState({
    command: false,
    label: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const initialInput = useMemo(
    () => JSON.stringify(buildCustomAgentInput(createCustomAgentDraft(agent))),
    [agent],
  );
  const labelValid = draft.label.trim().length > 0;
  const commandValid = draft.command.trim().length > 0;
  const showLabelError = !labelValid && touched.label;
  const showCommandError = !commandValid && touched.command;
  // Save requires a real, valid change: pristine edits stay disabled.
  const isDirty = JSON.stringify(buildCustomAgentInput(draft)) !== initialInput;
  const canSave = labelValid && commandValid && isDirty && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!labelValid || !commandValid) {
      // Enter submits even while Save is disabled; name the missing field
      // and move focus to the first invalid one.
      setTouched({ command: true, label: true });
      if (!labelValid) labelInputRef.current?.focus();
      else commandInputRef.current?.focus();
      return;
    }
    if (!canSave) return;
    try {
      await onSave(buildCustomAgentInput(draft));
    } catch (error) {
      // Keep the precise daemon/API message near the action for correction
      // and retry instead of collapsing to a generic toast.
      setFormError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : t("settings.customAgents.actionError"),
      );
    }
  }

  return (
    <Drawer
      dismissible={!pending}
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DrawerContent className="max-h-[92vh]">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <DrawerHeader>
            <DrawerTitle>
              {agent === null
                ? t("settings.customAgents.createTitle")
                : t("settings.customAgents.editTitle")}
            </DrawerTitle>
            <DrawerDescription>
              {t("settings.customAgents.formDescription")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
            <div>
              <Label className="mb-1.5" htmlFor="custom-agent-name">
                {t("settings.customAgents.nameLabel")}
              </Label>
              <Input
                aria-describedby={
                  showLabelError ? "custom-agent-name-error" : undefined
                }
                aria-invalid={showLabelError}
                autoFocus
                id="custom-agent-name"
                onBlur={() =>
                  setTouched((current) => ({ ...current, label: true }))
                }
                onChange={(event) =>
                  updateDraft({
                    field: "label",
                    value: event.currentTarget.value,
                  })
                }
                ref={labelInputRef}
                value={draft.label}
              />
              {showLabelError ? (
                <p
                  className="mt-1.5 text-xs text-destructive"
                  id="custom-agent-name-error"
                  role="alert"
                >
                  {t("settings.customAgents.nameRequired")}
                </p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5" htmlFor="custom-agent-command">
                {t("settings.customAgents.commandLabel")}
              </Label>
              <Input
                aria-describedby={
                  showCommandError ? "custom-agent-command-error" : undefined
                }
                aria-invalid={showCommandError}
                autoCapitalize="off"
                autoCorrect="off"
                id="custom-agent-command"
                onBlur={() =>
                  setTouched((current) => ({ ...current, command: true }))
                }
                onChange={(event) =>
                  updateDraft({
                    field: "command",
                    value: event.currentTarget.value,
                  })
                }
                placeholder="my-agent"
                ref={commandInputRef}
                spellCheck={false}
                value={draft.command}
              />
              {showCommandError ? (
                <p
                  className="mt-1.5 text-xs text-destructive"
                  id="custom-agent-command-error"
                  role="alert"
                >
                  {t("settings.customAgents.commandRequired")}
                </p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5" htmlFor="custom-agent-args">
                {t("settings.customAgents.argsLabel")}
              </Label>
              <Textarea
                autoCapitalize="off"
                autoCorrect="off"
                id="custom-agent-args"
                onChange={(event) =>
                  updateDraft({
                    field: "argsText",
                    value: event.currentTarget.value,
                  })
                }
                placeholder={t("settings.customAgents.argsPlaceholder")}
                spellCheck={false}
                value={draft.argsText}
              />
            </div>
            <div>
              <Label className="mb-1.5" htmlFor="custom-agent-environment">
                {t("settings.customAgents.environmentLabel")}
              </Label>
              <Textarea
                autoCapitalize="off"
                autoCorrect="off"
                id="custom-agent-environment"
                onChange={(event) =>
                  updateDraft({
                    field: "environmentText",
                    value: event.currentTarget.value,
                  })
                }
                placeholder={t("settings.customAgents.environmentPlaceholder")}
                spellCheck={false}
                value={draft.environmentText}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("settings.customAgents.environmentHint")}
              </p>
            </div>
            <div className="space-y-3">
              <label
                className="flex items-center justify-between gap-4 text-sm"
                htmlFor="custom-agent-need-auth"
              >
                {t("settings.customAgents.needAuthLabel")}
                <Switch
                  checked={draft.needAuth}
                  id="custom-agent-need-auth"
                  onCheckedChange={(checked) => {
                    updateDraft({ field: "needAuth", value: checked });
                    if (!checked) {
                      updateDraft({
                        field: "autoAuthenticate",
                        value: false,
                      });
                    }
                  }}
                />
              </label>
              {draft.needAuth ? (
                <label
                  className="ml-4 flex items-center justify-between gap-4 text-sm"
                  htmlFor="custom-agent-auto-authenticate"
                >
                  {t("settings.customAgents.autoAuthenticateLabel")}
                  <Switch
                    checked={draft.autoAuthenticate}
                    id="custom-agent-auto-authenticate"
                    onCheckedChange={(checked) =>
                      updateDraft({
                        field: "autoAuthenticate",
                        value: checked,
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
          </div>
          <DrawerFooter>
            {formError === null ? null : (
              <p className="mb-2 text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button disabled={!canSave} type="submit">
              {pending ? <Spinner /> : null}
              {t("common.save")}
            </Button>
            <DrawerClose asChild>
              <Button disabled={pending} type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};

interface CustomAgentDeleteDialogProps {
  agent: CustomAgent | null;
  onClose: () => void;
}

const CustomAgentDeleteDialog: FC<CustomAgentDeleteDialogProps> = ({
  agent,
  onClose,
}) => {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const impactQuery = useQuery(
    customAgentDeleteImpactQueryOptions({
      agentId: agent?.id ?? null,
      daemon,
      enabled: agent !== null,
    }),
  );
  const deleteAgent = useMutation(
    deleteCustomAgentMutationOptions({ daemon, queryClient }),
  );

  async function removeAgent(agentId: CustomAgentRuntime) {
    try {
      await deleteAgent.mutateAsync(agentId);
      onClose();
    } catch {
      toast.error(t("settings.customAgents.actionError"));
    }
  }

  const impactMessage = impactQuery.isPending
    ? t("settings.customAgents.deleteChecking")
    : impactQuery.data
      ? impactQuery.data.chatCount === 0
        ? t("settings.customAgents.deleteNoChats")
        : impactQuery.data.chatCount === 1
          ? t("settings.customAgents.deleteImpactOne")
          : t("settings.customAgents.deleteImpact", {
              count: impactQuery.data.chatCount,
            })
      : t("settings.customAgents.deleteImpactUnknown");

  return (
    <AlertDialog
      open={agent !== null}
      onOpenChange={(open) => {
        if (!open && !deleteAgent.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("settings.customAgents.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>{impactMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAgent.isPending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={impactQuery.isPending || deleteAgent.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (agent !== null) void removeAgent(agent.id);
            }}
            variant="destructive"
          >
            {deleteAgent.isPending ? <Spinner /> : null}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
