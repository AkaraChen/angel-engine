import type { ChatCreationLocation } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ChangeEvent } from "react";

import {
  RiFolderLine as Folder,
  RiGitBranchLine as GitBranch,
} from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/platform/utils";

const NO_PROJECT_SELECT_VALUE = Symbol("angel.projectSelect.noProject");
const NEW_PROJECT_SELECT_VALUE = Symbol("angel.projectSelect.newProject");
const PROJECT_SELECT_SYMBOLS = new Map([
  [String(NO_PROJECT_SELECT_VALUE), NO_PROJECT_SELECT_VALUE],
  [String(NEW_PROJECT_SELECT_VALUE), NEW_PROJECT_SELECT_VALUE],
]);

const projectControlVariants = {
  default:
    "h-8 max-w-[18rem] rounded-md border border-foreground/[0.08] bg-background/88 py-0 pr-8 pl-8 text-xs shadow-[0_8px_18px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-white/[0.09] dark:bg-card/86 dark:shadow-[0_10px_20px_-20px_rgba(0,0,0,0.72)]",
  ghost:
    "h-8 max-w-[18rem] rounded-md border-transparent bg-transparent py-0 pr-6 pl-7 text-xs hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
};

export function DraftProjectSelect({
  onCreateProject,
  onProjectChange,
  projects,
  selectedProjectId,
  variant = "default",
}: {
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  projects: Project[];
  selectedProjectId?: string;
  variant?: keyof typeof projectControlVariants;
}) {
  const { t } = useTranslation();
  const value = selectedProjectId ?? String(NO_PROJECT_SELECT_VALUE);
  const handleProjectChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.currentTarget.value;
    const selectedSymbol = PROJECT_SELECT_SYMBOLS.get(nextValue);

    if (selectedSymbol === NEW_PROJECT_SELECT_VALUE) {
      const project = await onCreateProject();
      if (project) {
        onProjectChange(project.id);
      }
      return;
    }

    onProjectChange(
      selectedSymbol === NO_PROJECT_SELECT_VALUE ? null : nextValue,
    );
  };

  return (
    <div className="relative w-fit max-w-[18rem]">
      <Folder
        className="
          pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5
          -translate-y-1/2 text-muted-foreground/85
        "
      />
      <NativeSelect
        aria-label={t("workspace.projectSelect")}
        className="max-w-[18rem]"
        onChange={(event) => void handleProjectChange(event)}
        selectClassName={cn(
          projectControlVariants[variant],
          variant === "default" &&
            `
              hover:bg-background/92
              focus-visible:border-foreground/12! focus-visible:ring-0!
              dark:hover:bg-card/90
              dark:focus-visible:border-white/14!
            `,
        )}
        size="sm"
        title={t("workspace.projectSelect")}
        value={value}
      >
        <NativeSelectOption value={String(NO_PROJECT_SELECT_VALUE)}>
          {t("workspace.noProject")}
        </NativeSelectOption>
        <NativeSelectOption value={String(NEW_PROJECT_SELECT_VALUE)}>
          {t("workspace.newProject")}
        </NativeSelectOption>
        {projects.map((project) => {
          const projectName = getProjectDisplayName(project.path);

          return (
            <NativeSelectOption
              key={project.id}
              title={project.path}
              value={project.id}
            >
              {projectName}
            </NativeSelectOption>
          );
        })}
      </NativeSelect>
    </div>
  );
}

export function DraftCreationLocationSelect({
  onValueChange,
  value,
  variant = "default",
}: {
  onValueChange: (value: ChatCreationLocation) => void;
  value: ChatCreationLocation;
  variant?: keyof typeof projectControlVariants;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative w-fit max-w-48">
      <GitBranch
        className="
          pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5
          -translate-y-1/2 text-muted-foreground/85
        "
      />
      <NativeSelect
        aria-label={t("workspace.creationLocationSelect")}
        className="max-w-48"
        onChange={(event) =>
          onValueChange(event.currentTarget.value as ChatCreationLocation)
        }
        selectClassName={cn(
          projectControlVariants[variant],
          "max-w-48",
          variant === "default" &&
            `
              hover:bg-background/92
              focus-visible:border-foreground/12! focus-visible:ring-0!
              dark:hover:bg-card/90
              dark:focus-visible:border-white/14!
            `,
        )}
        size="sm"
        title={t("workspace.creationLocationSelect")}
        value={value}
      >
        <NativeSelectOption value="project">
          {t("workspace.creationLocationProject")}
        </NativeSelectOption>
        <NativeSelectOption value="worktree">
          {t("workspace.creationLocationWorktree")}
        </NativeSelectOption>
      </NativeSelect>
    </div>
  );
}
