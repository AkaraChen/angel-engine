import type { Project } from "@shared/projects";

import { RiFolderLine as Folder } from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

const NO_PROJECT_SELECT_VALUE = Symbol("angel.projectSelect.noProject");
const NEW_PROJECT_SELECT_VALUE = Symbol("angel.projectSelect.newProject");
const PROJECT_SELECT_SYMBOLS = new Map([
  [String(NO_PROJECT_SELECT_VALUE), NO_PROJECT_SELECT_VALUE],
  [String(NEW_PROJECT_SELECT_VALUE), NEW_PROJECT_SELECT_VALUE],
]);
const projectControlClassName =
  "h-8 max-w-[18rem] rounded-md border border-foreground/[0.08] bg-background/88 py-0 pr-8 pl-8 text-xs shadow-[0_8px_18px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-white/[0.09] dark:bg-card/86 dark:shadow-[0_10px_20px_-20px_rgba(0,0,0,0.72)]";

export function DraftProjectSelect({
  onCreateProject,
  onProjectChange,
  projects,
  selectedProjectId,
}: {
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  projects: Project[];
  selectedProjectId?: string;
}) {
  const { t } = useTranslation();
  const value = selectedProjectId ?? String(NO_PROJECT_SELECT_VALUE);

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
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          const selectedSymbol = PROJECT_SELECT_SYMBOLS.get(nextValue);

          if (selectedSymbol === NEW_PROJECT_SELECT_VALUE) {
            void (async () => {
              const project = await onCreateProject();
              if (project) {
                onProjectChange(project.id);
              }
            })();
            return;
          }
          onProjectChange(
            selectedSymbol === NO_PROJECT_SELECT_VALUE ? null : nextValue,
          );
        }}
        selectClassName={`${projectControlClassName} hover:bg-background/92 focus-visible:!border-foreground/12 focus-visible:!ring-0 dark:hover:bg-card/90 dark:focus-visible:!border-white/14`}
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

export function ReadonlyProjectLabel({
  projectName,
  projectPath,
}: {
  projectName: string;
  projectPath?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative w-fit max-w-[18rem]">
      <Folder
        className="
          pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5
          -translate-y-1/2 text-muted-foreground/85
        "
      />
      <span
        aria-label={t("workspace.projectSelect")}
        className={`${projectControlClassName} inline-flex min-w-0 items-center pr-3 text-muted-foreground`}
        title={projectPath ?? projectName}
      >
        <span className="min-w-0 truncate">{projectName}</span>
      </span>
    </div>
  );
}
