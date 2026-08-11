import type {
  Project,
  ProjectConfigResult,
  ProjectScriptShell,
} from "@angel-engine/daemon-api/projects";
import type { FormEventHandler, ReactElement } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getErrorMessage,
  getProjectDisplayName,
} from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import {
  projectConfigQueryOptions,
  updateProjectConfigMutationOptions,
} from "@/features/projects/api/queries";
import { useApi } from "@/platform/use-api";

interface ProjectSettingsDialogProps {
  onClose: () => void;
  project: Project | null;
}

export function ProjectSettingsDialog({
  onClose,
  project,
}: ProjectSettingsDialogProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {project
              ? t("projects.settingsTitle", {
                  project: getProjectDisplayName(project.path),
                })
              : t("projects.settings")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("projects.setupScript")}
          </DialogDescription>
        </DialogHeader>
        {project ? (
          <ProjectSettingsForm
            key={project.id}
            onClose={onClose}
            project={project}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProjectSettingsForm({
  onClose,
  project,
}: {
  onClose: () => void;
  project: Project;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const configQuery = useQuery(
    projectConfigQueryOptions({ api, projectId: project.id }),
  );
  const saveMutation = useMutation(
    updateProjectConfigMutationOptions({ api, queryClient }),
  );

  if (configQuery.isPending) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <ProjectSettingsError
        message={getErrorMessage(configQuery.error)}
        onClose={onClose}
      />
    );
  }

  return (
    <ProjectSettingsEditor
      config={configQuery.data}
      isSaving={saveMutation.isPending}
      onClose={onClose}
      onSave={async ({ scriptShell, setupScript }) => {
        try {
          await saveMutation.mutateAsync({
            projectId: project.id,
            runScript: configQuery.data.runScript,
            scriptShell,
            setupScript,
            teardownScript: configQuery.data.teardownScript,
          });
          toast({ title: t("projects.settingsSaved") });
          onClose();
        } catch (error) {
          toast({
            description: getErrorMessage(error),
            title: t("projects.settingsSaveFailed"),
            variant: "destructive",
          });
        }
      }}
    />
  );
}

function ProjectSettingsEditor({
  config,
  isSaving,
  onClose,
  onSave,
}: {
  config: ProjectConfigResult;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: {
    scriptShell: ProjectScriptShell;
    setupScript: string[];
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [setupScriptText, setSetupScriptText] = useState(() =>
    config.setupScript.join("\n"),
  );
  const [scriptShell, setScriptShell] = useState(config.scriptShell);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (isSaving) return;
    void onSave({ scriptShell, setupScript: toSetupScript(setupScriptText) });
  };

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("projects.scriptShell")}</span>
        <NativeSelect
          aria-label={t("projects.scriptShell")}
          disabled={isSaving}
          onChange={(event) =>
            setScriptShell(event.currentTarget.value as ProjectScriptShell)
          }
          value={scriptShell}
        >
          <NativeSelectOption value="auto">
            {t("projects.scriptShellAuto")}
          </NativeSelectOption>
          <NativeSelectOption value="bash">
            {t("projects.scriptShellBash")}
          </NativeSelectOption>
          <NativeSelectOption value="system">
            {t("projects.scriptShellSystem")}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("projects.setupScript")}</span>
        <Textarea
          aria-label={t("projects.setupScript")}
          className="min-h-32 font-mono text-xs"
          disabled={isSaving}
          onChange={(event) => setSetupScriptText(event.target.value)}
          placeholder={t("projects.setupScriptPlaceholder")}
          spellCheck={false}
          value={setupScriptText}
        />
      </div>
      <DialogFooter>
        <Button
          disabled={isSaving}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          {t("common.cancel")}
        </Button>
        <Button disabled={isSaving} type="submit">
          {isSaving ? t("common.saving") : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProjectSettingsError({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <span className="text-sm font-medium text-destructive">
          {t("projects.settingsLoadFailed")}
        </span>
        <p className="text-xs break-all text-muted-foreground">{message}</p>
      </div>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          {t("common.close")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** One command per line; blank lines are not commands. */
function toSetupScript(text: string): string[] {
  return text
    .split("\n")
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}
