import type { ChatCreationLocation } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import { FolderOpen, GitBranch } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /**
   * Draft-screen capsule. The DNA only lets `rounded-full` into app context for
   * chips, so this variant is scoped to the composer toolbar rather than being
   * folded into the shared select itself.
   */
  chip: "h-8 max-w-[16rem] rounded-full border border-border-subtle bg-card py-0 pr-7 pl-7 text-xs hover:bg-overlay-hover dark:bg-surface-1",
};

export function DraftProjectSelect({
  allowNoProject,
  onCreateProject,
  onProjectChange,
  projects,
  selectedProjectId,
  variant = "default",
}: {
  allowNoProject: boolean;
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  projects: Project[];
  selectedProjectId?: string;
  variant?: keyof typeof projectControlVariants;
}) {
  const { t } = useTranslation();
  const value =
    selectedProjectId ??
    String(allowNoProject ? NO_PROJECT_SELECT_VALUE : NEW_PROJECT_SELECT_VALUE);
  const handleProjectChange = async (nextValue: string) => {
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
      <FolderOpen
        className="
          pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5
          -translate-y-1/2 text-muted-foreground
        "
        weight="regular"
      />
      <Select
        onValueChange={(nextValue) => void handleProjectChange(nextValue)}
        value={value}
      >
        <SelectTrigger
          aria-label={t("workspace.projectSelect")}
          className={cn(
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
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNoProject ? (
            <SelectItem value={String(NO_PROJECT_SELECT_VALUE)}>
              {t("workspace.noProject")}
            </SelectItem>
          ) : null}
          <SelectItem value={String(NEW_PROJECT_SELECT_VALUE)}>
            {t("sidebar.addProject")}
          </SelectItem>
          {projects.map((project) => {
            const projectName = getProjectDisplayName(project.path);

            return (
              <SelectItem
                key={project.id}
                title={project.path}
                value={project.id}
              >
                {projectName}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
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
          -translate-y-1/2 text-muted-foreground
        "
        weight="regular"
      />
      <Select
        onValueChange={(nextValue) =>
          onValueChange(nextValue as ChatCreationLocation)
        }
        value={value}
      >
        <SelectTrigger
          aria-label={t("workspace.creationLocationSelect")}
          className={cn(
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
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="project">
            {t("workspace.creationLocationProject")}
          </SelectItem>
          <SelectItem value="worktree">
            {t("workspace.creationLocationWorktree")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
