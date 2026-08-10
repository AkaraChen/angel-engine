import type { PathLauncherActionId } from "@shared/path-launcher";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { pathLauncherEditorActionId } from "@shared/path-launcher";
import { useApi } from "@/platform/use-api";
import { queryKeys } from "@/platform/query-keys";

export interface PathLauncherMenuItem {
  action: PathLauncherActionId;
  label: string;
  /** Items after a `true` boundary render below a separator. */
  startsGroup?: boolean;
}

function fileManagerLabelKey(): string {
  const platform = window.desktopEnvironment.platform;
  if (platform === "darwin") return "pathLauncher.openInFinder";
  if (platform === "win32") return "pathLauncher.openInFileExplorer";
  return "pathLauncher.openInFileManager";
}

/**
 * Availability is a host probe (installed editors, terminal), so it is fetched
 * once and shared by every path-launcher menu instead of per right-click.
 */
export function usePathLauncherMenuItems(
  options: { includeAngelTerminal?: boolean } = {},
): PathLauncherMenuItem[] {
  const api = useApi();
  const { t } = useTranslation();
  const { data } = useQuery({
    queryFn: async () => api.pathLauncher.availability(),
    queryKey: queryKeys.pathLauncher.availability(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const items: PathLauncherMenuItem[] = (data?.editors ?? []).map((editor) => ({
    action: pathLauncherEditorActionId(editor.id),
    label: t("pathLauncher.openInEditor", { editor: editor.name }),
  }));
  items.push({
    action: "fileManager",
    label: t(fileManagerLabelKey()),
    startsGroup: items.length > 0,
  });
  if (data?.systemTerminal === true) {
    items.push({
      action: "systemTerminal",
      label: t("pathLauncher.openInSystemTerminal"),
    });
  }
  if (options.includeAngelTerminal === true) {
    items.push({
      action: "angelTerminal",
      label: t("pathLauncher.openInAngelTerminal"),
    });
  }
  items.push({ action: "copyPath", label: t("pathLauncher.copyPath") });
  return items;
}
