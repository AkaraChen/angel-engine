import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import { CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  WorkspaceToolPatchFileDiffContent,
  WorkspaceToolPatchFileLineStats,
} from "@/app/workspace/workspace-tool-diff";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import {
  formatWorkspaceToolPatchFileName,
  getWorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/platform/utils";

interface WorkspaceToolPatchFileSelection {
  onFileSelectedChange: (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => void;
  selectedFileKeys: Record<string, boolean>;
}

export function WorkspaceToolPatchFileList({
  activeFileKey,
  flush = false,
  onFileActivate,
  onFileSelectedChange,
  patchList,
  rowMode = "expand",
  selectedFileKeys,
}: {
  activeFileKey?: string;
  flush?: boolean;
  onFileActivate?: (file: WorkspaceToolPatchFile) => void;
  onFileSelectedChange?: (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => void;
  patchList: {
    errors: string[];
    files: WorkspaceToolPatchFile[];
  };
  rowMode?: "expand" | "select";
  selectedFileKeys?: Record<string, boolean>;
}) {
  const { t } = useTranslation();
  const selection =
    onFileSelectedChange !== undefined && selectedFileKeys !== undefined
      ? { onFileSelectedChange, selectedFileKeys }
      : undefined;
  const empty = patchList.files.length === 0 && patchList.errors.length === 0;

  return (
    <section
      className={cn(empty ? "flex min-h-0 flex-1 flex-col" : "space-y-2")}
    >
      {patchList.errors.map((error) => (
        <WorkspaceToolBanner key={error} tone="danger">
          {error}
        </WorkspaceToolBanner>
      ))}
      {patchList.files.length > 0 ? (
        <WorkspaceToolPatchFileRows
          activeFileKey={activeFileKey}
          files={patchList.files}
          flush={flush}
          rowMode={rowMode}
          selection={selection}
          onFileActivate={onFileActivate}
        />
      ) : patchList.errors.length === 0 ? (
        <div
          className="
            flex flex-1 items-center justify-center px-3 py-6 text-center
            text-sm text-muted-foreground
          "
        >
          {t("workspace.tools.empty.noChanges")}
        </div>
      ) : null}
    </section>
  );
}

export function WorkspaceToolPatchFileRows({
  activeFileKey,
  files,
  flush = false,
  onFileActivate,
  rowMode = "expand",
  selection,
}: {
  activeFileKey?: string;
  files: WorkspaceToolPatchFile[];
  flush?: boolean;
  onFileActivate?: (file: WorkspaceToolPatchFile) => void;
  rowMode?: "expand" | "select";
  selection?: WorkspaceToolPatchFileSelection;
}) {
  return (
    <div
      className={cn(
        "space-y-px overflow-hidden p-1.5",
        flush ? "" : "rounded-md border border-border-subtle",
      )}
    >
      {files.map((file) => (
        <WorkspaceToolPatchFileItem
          active={file.key === activeFileKey}
          file={file}
          key={file.key}
          mode={rowMode}
          selection={selection}
          onActivate={onFileActivate}
        />
      ))}
    </div>
  );
}

/**
 * Paths are mono everywhere in the tool panels. The directory prefix is
 * dimmed so a column of deeply nested files still scans by basename without
 * needing to truncate from the left.
 */
export function WorkspaceToolPatchFileName({ name }: { name: string }) {
  const separatorIndex = name.lastIndexOf("/");
  const directory =
    separatorIndex === -1 ? "" : name.slice(0, separatorIndex + 1);
  const baseName =
    separatorIndex === -1 ? name : name.slice(separatorIndex + 1);

  return (
    <span className="min-w-0 flex-1 truncate font-mono" title={name}>
      {directory === "" ? null : (
        <span className="text-muted-foreground">{directory}</span>
      )}
      <span className="font-medium text-foreground">{baseName}</span>
    </span>
  );
}

function WorkspaceToolPatchFileCheckbox({
  file,
  fileName,
  selection,
}: {
  file: WorkspaceToolPatchFile;
  fileName: string;
  selection: WorkspaceToolPatchFileSelection;
}) {
  return (
    <Checkbox
      aria-label={`Include ${fileName} in commit`}
      checked={selection.selectedFileKeys[file.key] ?? true}
      className="size-3.5"
      onCheckedChange={(value) =>
        selection.onFileSelectedChange(file, value === true)
      }
    />
  );
}

function WorkspaceToolPatchFileItem({
  active = false,
  file,
  mode,
  onActivate,
  selection,
}: {
  active?: boolean;
  file: WorkspaceToolPatchFile;
  mode: "expand" | "select";
  onActivate?: (file: WorkspaceToolPatchFile) => void;
  selection?: WorkspaceToolPatchFileSelection;
}) {
  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);
  const [open, setOpen] = useState(false);

  if (mode === "select") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-md",
          active ? "bg-surface-1" : "",
        )}
      >
        <div
          className="
            group flex min-h-8 w-full items-center gap-2 px-2 py-1 text-xs
            transition-colors
            hover:bg-overlay-hover
            active:bg-overlay-active
          "
        >
          {selection === undefined ? null : (
            <WorkspaceToolPatchFileCheckbox
              file={file}
              fileName={fileName}
              selection={selection}
            />
          )}
          <button
            aria-current={active ? "true" : undefined}
            className="
              flex min-w-0 flex-1 items-center gap-2 text-left outline-none
              focus-visible:ring-2 focus-visible:ring-ring/50
              focus-visible:ring-inset
            "
            type="button"
            onClick={() => onActivate?.(file)}
          >
            <WorkspaceToolPatchFileName name={fileName} />
          </button>
          <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
        </div>
      </div>
    );
  }

  return (
    <Collapsible
      className={cn(
        "overflow-hidden rounded-md",
        open ? "bg-surface-1/50" : "",
      )}
      open={open}
      onOpenChange={setOpen}
    >
      <div
        className="
          group flex min-h-8 w-full items-center gap-2 px-2 py-1 text-xs
          transition-colors
          hover:bg-overlay-hover
          active:bg-overlay-active
        "
      >
        {selection === undefined ? null : (
          <WorkspaceToolPatchFileCheckbox
            file={file}
            fileName={fileName}
            selection={selection}
          />
        )}
        <CollapsibleTrigger
          className="
            group/trigger flex min-w-0 flex-1 items-center gap-1.5 text-left
            outline-none
            focus-visible:ring-2 focus-visible:ring-ring/50
            focus-visible:ring-inset
          "
          type="button"
        >
          <CaretRight
            aria-hidden="true"
            className="
              size-3 shrink-0 text-muted-foreground transition-transform
              duration-150 ease-standard
              group-data-[state=open]/trigger:rotate-90
              motion-reduce:transition-none
            "
            weight="regular"
          />
          <WorkspaceToolPatchFileName name={fileName} />
        </CollapsibleTrigger>
        <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
      </div>
      {open ? (
        <CollapsibleContent
          className="
            overflow-hidden rounded-b-[inherit]
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
            motion-reduce:animate-none
          "
        >
          <WorkspaceToolPatchFileDiffContent file={file} rounded />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
