import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import { useState } from "react";
import {
  WorkspaceToolPatchFileDiffContent,
  WorkspaceToolPatchFileLineStats,
} from "@/app/workspace/workspace-tool-diff";
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
  return (
    <section className="space-y-2">
      {patchList.errors.map((error) => (
        <div
          className="
            rounded-md border border-status-danger-border bg-status-danger-soft
            px-3 py-2 text-xs text-status-danger select-text
          "
          key={error}
        >
          {error}
        </div>
      ))}
      {patchList.files.length > 0 ? (
        <WorkspaceToolPatchFileRows
          activeFileKey={activeFileKey}
          files={patchList.files}
          flush={flush}
          rowMode={rowMode}
          selectedFileKeys={selectedFileKeys}
          onFileActivate={onFileActivate}
          onFileSelectedChange={onFileSelectedChange}
        />
      ) : patchList.errors.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No changes
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
  onFileSelectedChange,
  rowMode = "expand",
  selectedFileKeys: controlledSelectedFileKeys,
}: {
  activeFileKey?: string;
  files: WorkspaceToolPatchFile[];
  flush?: boolean;
  onFileActivate?: (file: WorkspaceToolPatchFile) => void;
  onFileSelectedChange?: (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => void;
  rowMode?: "expand" | "select";
  selectedFileKeys?: Record<string, boolean>;
}) {
  const [localSelectedFileKeys, setLocalSelectedFileKeys] = useState<
    Record<string, boolean>
  >({});
  const selectedFileKeys = controlledSelectedFileKeys ?? localSelectedFileKeys;
  const handleFileSelectedChange = (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => {
    if (onFileSelectedChange) {
      onFileSelectedChange(file, selected);
      return;
    }
    setLocalSelectedFileKeys((current) => ({
      ...current,
      [file.key]: selected,
    }));
  };

  return (
    <div
      className={cn(
        "overflow-hidden bg-background",
        flush ? "" : "rounded-md border border-border-subtle",
      )}
    >
      {files.map((file) => (
        <WorkspaceToolPatchFileItem
          active={file.key === activeFileKey}
          checked={selectedFileKeys[file.key] ?? true}
          file={file}
          key={file.key}
          mode={rowMode}
          onActivate={onFileActivate}
          onCheckedChange={handleFileSelectedChange}
        />
      ))}
    </div>
  );
}

function WorkspaceToolPatchFileItem({
  active = false,
  checked,
  file,
  mode,
  onActivate,
  onCheckedChange,
}: {
  active?: boolean;
  checked: boolean;
  file: WorkspaceToolPatchFile;
  mode: "expand" | "select";
  onActivate?: (file: WorkspaceToolPatchFile) => void;
  onCheckedChange: (file: WorkspaceToolPatchFile, checked: boolean) => void;
}) {
  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);
  const [open, setOpen] = useState(false);

  if (mode === "select") {
    return (
      <div
        className={cn(
          `
            border-b border-border-subtle
            last:border-b-0
          `,
          active ? "bg-surface-1" : "",
        )}
      >
        <div
          className="
            group flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-xs
            transition-colors
            hover:bg-overlay-hover
            active:bg-overlay-active
          "
        >
          <Checkbox
            aria-label={`Include ${fileName} in commit`}
            checked={checked}
            className="size-3.5"
            onCheckedChange={(value) => onCheckedChange(file, value === true)}
          />
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
            <span
              className="min-w-0 flex-1 truncate font-medium text-foreground"
              title={fileName}
            >
              {fileName}
            </span>
          </button>
          <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
        </div>
      </div>
    );
  }

  return (
    <Collapsible
      className="
        border-b border-border-subtle
        last:border-b-0
      "
      open={open}
      onOpenChange={setOpen}
    >
      <div
        className="
          group flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-xs
          transition-colors
          hover:bg-overlay-hover
          active:bg-overlay-active
        "
      >
        <Checkbox
          aria-label={`Include ${fileName} in commit`}
          checked={checked}
          className="size-3.5"
          onCheckedChange={(value) => onCheckedChange(file, value === true)}
        />
        <CollapsibleTrigger
          className="
            flex min-w-0 flex-1 items-center gap-2 text-left outline-none
            focus-visible:ring-2 focus-visible:ring-ring/50
            focus-visible:ring-inset
          "
          type="button"
        >
          <span
            className="min-w-0 flex-1 truncate font-medium text-foreground"
            title={fileName}
          >
            {fileName}
          </span>
        </CollapsibleTrigger>
        <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
      </div>
      {open ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
            motion-reduce:animate-none
          "
        >
          <WorkspaceToolPatchFileDiffContent file={file} borderTop />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
