import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent } from "react";

import { Folder, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { SettingsSection } from "@/features/settings/settings-section";
import { useDaemonClient } from "@/platform/daemon-provider";

import {
  createProjectMutationOptions,
  deleteProjectMutationOptions,
  projectDeleteImpactQueryOptions,
  projectListQueryOptions,
  updateProjectMutationOptions,
} from "./requests/management";

type ProjectFormTarget =
  | { mode: "create" }
  | { mode: "edit"; project: Project };

export function ProjectsSection() {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery(projectListQueryOptions({ daemon }));
  const createProject = useMutation(
    createProjectMutationOptions({ daemon, queryClient }),
  );
  const updateProject = useMutation(
    updateProjectMutationOptions({ daemon, queryClient }),
  );
  const [formTarget, setFormTarget] = useState<ProjectFormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const reportActionError = () =>
    toast.error(t("settings.projects.actionError"));

  return (
    <>
      <SettingsSection
        description={t("settings.projects.description")}
        title={t("settings.projects.title")}
      >
        {projectsQuery.isPending ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : projectsQuery.isError ? (
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-muted-foreground">
              {t("settings.projects.loadError")}
            </span>
            <Button
              onClick={() => void projectsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("common.tryAgain")}
            </Button>
          </div>
        ) : projectsQuery.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("settings.projects.empty")}
          </p>
        ) : (
          projectsQuery.data.map((project) => {
            const name = projectName(project.path);
            return (
              <div className="flex items-center gap-3 p-4" key={project.id}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Folder className="size-5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {project.path}
                  </span>
                </span>
                <Button
                  aria-label={`${t("common.edit")} ${name}`}
                  onClick={() => setFormTarget({ mode: "edit", project })}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <PencilSimple />
                </Button>
                <Button
                  aria-label={`${t("common.delete")} ${name}`}
                  onClick={() => setDeleteTarget(project)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash />
                </Button>
              </div>
            );
          })
        )}
        <div className="p-3">
          <Button
            className="w-full"
            onClick={() => setFormTarget({ mode: "create" })}
            type="button"
            variant="outline"
          >
            <Plus />
            {t("settings.projects.add")}
          </Button>
        </div>
      </SettingsSection>

      {formTarget !== null ? (
        <ProjectFormDrawer
          key={
            formTarget.mode === "edit"
              ? formTarget.project.id
              : "create-project"
          }
          onClose={() => setFormTarget(null)}
          onSave={async (path) => {
            try {
              if (formTarget.mode === "edit") {
                await updateProject.mutateAsync({
                  id: formTarget.project.id,
                  path,
                });
              } else {
                await createProject.mutateAsync({ path });
              }
              setFormTarget(null);
            } catch {
              reportActionError();
            }
          }}
          pending={createProject.isPending || updateProject.isPending}
          target={formTarget}
        />
      ) : null}

      <ProjectDeleteDialog
        onClose={() => setDeleteTarget(null)}
        project={deleteTarget}
      />
    </>
  );
}

interface ProjectFormDrawerProps {
  onClose: () => void;
  onSave: (path: string) => Promise<void>;
  pending: boolean;
  target: ProjectFormTarget;
}

const ProjectFormDrawer: FC<ProjectFormDrawerProps> = ({
  onClose,
  onSave,
  pending,
  target,
}) => {
  const { t } = useTranslation();
  const project = target.mode === "edit" ? target.project : null;
  const [path, setPath] = useState(project?.path ?? "");
  const normalizedPath = path.trim();
  const canSave =
    normalizedPath.length > 0 &&
    (project === null || normalizedPath !== project.path) &&
    !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    await onSave(normalizedPath);
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DrawerContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DrawerHeader>
            <DrawerTitle>
              {project === null
                ? t("settings.projects.createTitle")
                : t("settings.projects.editTitle")}
            </DrawerTitle>
            <DrawerDescription>
              {t("settings.projects.formDescription")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <Label className="mb-1.5" htmlFor="project-path">
              {t("settings.projects.pathLabel")}
            </Label>
            <Input
              autoFocus
              id="project-path"
              onChange={(event) => setPath(event.currentTarget.value)}
              placeholder={t("settings.projects.pathPlaceholder")}
              value={path}
            />
          </div>
          <DrawerFooter>
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

interface ProjectDeleteDialogProps {
  onClose: () => void;
  project: Project | null;
}

const ProjectDeleteDialog: FC<ProjectDeleteDialogProps> = ({
  onClose,
  project,
}) => {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const impactQuery = useQuery(
    projectDeleteImpactQueryOptions({
      daemon,
      enabled: project !== null,
      projectId: project?.id ?? null,
    }),
  );
  const deleteProject = useMutation(
    deleteProjectMutationOptions({ daemon, queryClient }),
  );

  async function removeProject() {
    if (project === null) return;
    try {
      await deleteProject.mutateAsync(project.id);
      onClose();
    } catch {
      toast.error(t("settings.projects.actionError"));
    }
  }

  const impactMessage = impactQuery.isPending
    ? t("settings.projects.deleteChecking")
    : impactQuery.data
      ? t("settings.projects.deleteImpact", {
          count: impactQuery.data.chatCount,
        })
      : t("settings.projects.deleteImpactUnknown");

  return (
    <AlertDialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open && !deleteProject.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("settings.projects.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {impactMessage} {t("settings.projects.filesKept")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteProject.isPending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={impactQuery.isPending || deleteProject.isPending}
            onClick={(event) => {
              event.preventDefault();
              void removeProject();
            }}
            variant="destructive"
          >
            {deleteProject.isPending ? <Spinner /> : null}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
