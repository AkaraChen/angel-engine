import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC, FormEvent, ReactNode } from "react";

import { FolderOpen, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
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
import { basename } from "@/features/chat/chat-summary";
import { SettingsSection } from "@/features/settings/settings-section";

import {
  useCreateProject,
  useDeleteProject,
  useProjectDeleteImpact,
  useProjectList,
  useUpdateProject,
} from "./use-resources";

type ProjectFormDrawerProps = {
  children: ReactNode;
  onSaved?: (project: Project) => void;
  project?: Project;
};

export const ProjectFormDrawer: FC<ProjectFormDrawerProps> = ({
  children,
  onSaved,
  project,
}) => {
  const { t } = useTranslation();
  const pathId = useId();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(project?.path ?? "");
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isPending = createProject.isPending || updateProject.isPending;

  function reset() {
    setPath(project?.path ?? "");
    createProject.reset();
    updateProject.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0 || isPending) return;

    try {
      const saved =
        project === undefined
          ? await createProject.mutateAsync({ path: normalizedPath })
          : await updateProject.mutateAsync({
              id: project.id,
              path: normalizedPath,
            });
      onSaved?.(saved);
      setOpen(false);
      reset();
    } catch {
      toast.error(t("settings.projects.saveError"));
    }
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
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {project === undefined
              ? t("settings.projects.createTitle")
              : t("settings.projects.editTitle")}
          </DrawerTitle>
          <DrawerDescription>
            {t("settings.projects.formDescription")}
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="px-4">
            <Label className="mb-1.5" htmlFor={pathId}>
              {t("settings.projects.pathLabel")}
            </Label>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              id={pathId}
              placeholder={t("settings.projects.pathPlaceholder")}
              spellCheck={false}
              value={path}
              onChange={(event) => setPath(event.currentTarget.value)}
            />
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
              disabled={path.trim().length === 0 || isPending}
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

export function ProjectsSettingsSection() {
  const { t } = useTranslation();
  const projects = useProjectList();
  const impact = useProjectDeleteImpact();
  const deleteProject = useDeleteProject();
  const [deleteTarget, setDeleteTarget] = useState<{
    chatCount: number;
    project: Project;
  } | null>(null);

  async function prepareDelete(project: Project) {
    try {
      const result = await impact.mutateAsync(project.id);
      setDeleteTarget({ chatCount: result.chatCount, project });
    } catch {
      toast.error(t("settings.projects.deleteError"));
    }
  }

  async function confirmDelete() {
    if (deleteTarget === null) return;
    try {
      await deleteProject.mutateAsync(deleteTarget.project.id);
      setDeleteTarget(null);
    } catch {
      toast.error(t("settings.projects.deleteError"));
    }
  }

  return (
    <>
      <SettingsSection
        description={t("settings.projects.description")}
        title={t("settings.projects.title")}
      >
        {projects.isPending ? (
          <ResourceState>
            <Spinner className="size-4 text-muted-foreground" />
          </ResourceState>
        ) : projects.isError ? (
          <ResourceState>
            <span>{t("settings.projects.loadError")}</span>
            <Button
              onClick={() => void projects.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.tryAgain")}
            </Button>
          </ResourceState>
        ) : projects.data.length === 0 ? (
          <ResourceState>{t("settings.projects.empty")}</ResourceState>
        ) : (
          projects.data.map((project) => {
            const name = basename(project.path);
            return (
              <div className="flex items-center gap-3 p-4" key={project.id}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FolderOpen size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {name}
                  </span>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={project.path}
                  >
                    {project.path}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <ProjectFormDrawer project={project}>
                    <Button
                      aria-label={t("settings.projects.editAction", { name })}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <PencilSimple />
                    </Button>
                  </ProjectFormDrawer>
                  <Button
                    aria-label={t("settings.projects.deleteAction", { name })}
                    disabled={impact.isPending}
                    onClick={() => void prepareDelete(project)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash />
                  </Button>
                </span>
              </div>
            );
          })
        )}
        <div className="p-3">
          <ProjectFormDrawer>
            <Button className="w-full" type="button" variant="outline">
              <Plus />
              {t("settings.projects.add")}
            </Button>
          </ProjectFormDrawer>
        </div>
      </SettingsSection>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteProject.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("settings.projects.deleteTitle", {
                name:
                  deleteTarget === null
                    ? ""
                    : basename(deleteTarget.project.path),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.chatCount
                ? t("settings.projects.deleteWithChats", {
                    count: deleteTarget.chatCount,
                  })
                : t("settings.projects.deleteWithoutChats")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              disabled={deleteProject.isPending}
              onClick={() => void confirmDelete()}
              variant="destructive"
            >
              {deleteProject.isPending ? <Spinner /> : null}
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ResourceState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
