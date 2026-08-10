import {
  Rows as CompactIcon,
  ListBullets as NormalIcon,
  Bug as DebugIcon,
  CaretDown as ChevronDown,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TRANSCRIPT_DENSITY_VALUES,
  type TranscriptDensity,
} from "@/features/chat/transcript-density";
import { useTranscriptDensityStore } from "@/features/chat/transcript-density-store";
import { cn } from "@/platform/utils";

const densityIcon = {
  compact: CompactIcon,
  debug: DebugIcon,
  normal: NormalIcon,
} as const;

export function TranscriptDensityMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const density = useTranscriptDensityStore((state) =>
    state.densityFor(workspaceMode),
  );
  const setDensity = useTranscriptDensityStore((state) => state.setDensity);
  const ActiveIcon = densityIcon[density];
  const activeLabel = t(`workspace.transcriptDensity.options.${density}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("workspace.transcriptDensity.menuLabel", {
            density: activeLabel,
          })}
          className={cn(
            "h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground",
            className,
          )}
          data-electron-no-drag
          size="sm"
          title={t("workspace.transcriptDensity.title")}
          type="button"
          variant="ghost"
        >
          <ActiveIcon className="size-3.5 shrink-0" weight="regular" />
          <span className="max-w-20 truncate">{activeLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" variant="native">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            const next = value as TranscriptDensity;
            setDensity(workspaceMode, next);
          }}
          value={density}
        >
          {TRANSCRIPT_DENSITY_VALUES.map((value) => {
            const Icon = densityIcon[value];
            return (
              <DropdownMenuRadioItem
                key={value}
                title={t(`workspace.transcriptDensity.descriptions.${value}`)}
                value={value}
              >
                <Icon className="size-3.5 shrink-0" weight="regular" />
                <span>{t(`workspace.transcriptDensity.options.${value}`)}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
