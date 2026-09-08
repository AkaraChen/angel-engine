import type { ChatCreationLocation } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import { GitBranch } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/platform/utils";

const projectControlVariants = {
  default:
    "h-8 max-w-[18rem] rounded-md border border-foreground/[0.08] bg-background/88 py-0 pr-8 pl-8 text-xs",
  ghost:
    "h-8 max-w-[18rem] rounded-md border-transparent bg-transparent py-0 pr-6 pl-7 text-xs",
  chip: "h-8 max-w-[16rem] rounded-full border border-border-subtle bg-card py-0 pr-7 pl-7 text-xs",
};

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
